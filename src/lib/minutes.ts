// src/lib/minutes.ts
/**
 * Capa de acceso a datos para MINUTAS
 * ============================================================================
 * Cambios clave:
 * - `createMinute` usa EXCLUSIVAMENTE la RPC `public.create_minute_safe`
 *   para crear la minuta y asignar `folio_serial/folio` de forma atómica.
 * - Manejo robusto de errores de concurrencia (23505) con mensaje UX claro.
 * - No existen inserts directos a `public.minute` para crear minutas.
 *
 * Resto:
 * - Utilidades para update/listado/start/stop y helpers varios.
 */

import { supabase } from '@/lib/supabaseClient'
import type { Minute } from '@/types/minute'
import { WORK_TYPE_VALUES } from '@/types/minute'

type WorkType = (typeof WORK_TYPE_VALUES)[number]

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function delay(ms: number) { return new Promise(res => setTimeout(res, ms)) }

/** Borra claves con `undefined` (evita enviar basura en PATCH/INSERT). */
function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {}
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/** Borra campos prohibidos antes de enviar a BD. */
function sanitize<T extends Record<string, any>>(obj: T, forbidden: string[]): T {
  const clone: any = { ...obj }
  for (const k of forbidden) delete clone[k]
  return clone
}

/** Normaliza string vacío → null (para date/time/text opcionales). */
function emptyToNull<T extends string | null | undefined>(v: T): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** YYYY-MM-DD (hoy) — Útil para respetar NOT NULL en `date`. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Normaliza a WorkType válido o null si inválido. */
function normalizeWorkType(v?: string | null): WorkType | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_')
  return (WORK_TYPE_VALUES as readonly string[]).includes(s) ? (s as WorkType) : null
}

// ---------------------------------------------------------------------------
// Introspección ligera (cacheada)
// ---------------------------------------------------------------------------

let ownerColumnCache: 'user_id' | 'created_by' | 'none' | null = null
const columnExistsCache: Record<string, boolean> = {}

async function hasColumn(col: string): Promise<boolean> {
  if (col in columnExistsCache) return columnExistsCache[col]
  const { error } = await supabase.from('minute').select(`id, ${col}`).limit(1)
  const ok = !error
  columnExistsCache[col] = ok
  return ok
}

async function hasDescriptionColumn() { return hasColumn('description') }
async function hasWorkTypeColumn() { return hasColumn('work_type') }

/** Detecta la columna de “dueño” para filtros de listado. */
async function detectOwnerColumn(): Promise<'user_id' | 'created_by' | 'none'> {
  if (ownerColumnCache) return ownerColumnCache
  {
    const { error } = await supabase.from('minute').select('id,user_id').limit(1)
    if (!error) { ownerColumnCache = 'user_id'; return ownerColumnCache }
  }
  {
    const { error } = await supabase.from('minute').select('id,created_by').limit(1)
    if (!error) { ownerColumnCache = 'created_by'; return ownerColumnCache }
  }
  ownerColumnCache = 'none'
  return ownerColumnCache
}

// ---------------------------------------------------------------------------
// Sesión/identidad
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('No hay sesión activa.')
  return data.user.id
}

async function getCurrentUserIdentity(): Promise<{ name: string | null; email: string | null }> {
  const { data } = await supabase.auth.getUser()
  const u = data.user
  const meta = (u?.user_metadata ?? {}) as Record<string, any>
  const name =
    (meta.full_name as string) ??
    (meta.name as string) ??
    (meta.display_name as string) ??
    null
  const email = (u?.email as string) ?? null
  return { name, email }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * createMinute
 * ----------------------------------------------------------------------------
 * Crea una minuta vía RPC `public.create_minute_safe` (lado BD asigna
 * `folio_serial/folio` de forma atómica).
 *
 * Tras crear:
 *  - Parche best-effort de `created_by_name` / `created_by_email` si existen.
 *  - Parche de `work_type` (validado) y `is_protected` (si se pidió) si existen.
 *
 * Notas:
 * - `start_time`/`end_time` se gestionan con las RPC `minute_start/stop`.
 */
export async function createMinute(input: {
  date?: string | null
  start_time?: string | null   // ignorado en la creación (usa minute_start)
  end_time?: string | null     // ignorado en la creación (usa minute_stop)
  tarea_realizada?: string | null
  novedades?: string | null
  is_protected?: boolean
  description?: string | null
  work_type?: string | null
}): Promise<Minute> {
  // Forzamos sesión para coherencia con RLS y owner implícito en la RPC
  await getCurrentUserId()

  const { name, email } = await getCurrentUserIdentity()
  const safeDate = emptyToNull(input.date ?? null) || todayISO()

  // 1) Creación atómica por RPC (no pasar campos no soportados)
  const { data, error } = await supabase.rpc('create_minute_safe', {
    p_date: safeDate,
    p_description: emptyToNull(input.description ?? null),
    p_tarea: emptyToNull(input.tarea_realizada ?? null),
    p_novedades: emptyToNull(input.novedades ?? null),
    p_work_type: normalizeWorkType(input.work_type ?? null),
  })

  if (error) {
    // Errores de colisión/concurrencia → UX clara y consistente con UI
    if (error.code === '23505' || /reintentos/i.test(error.message || '')) {
      throw new Error('Se está asignando el número de minuta. Intenta nuevamente.')
    }
    throw new Error(error?.message ?? 'No fue posible crear la minuta.')
  }

  const row = data as Minute

  // 2) Parche opcional (best-effort): nombre/email, work_type e is_protected
  try {
    const patch: Record<string, any> = {}

    if (name && (await hasColumn('created_by_name'))) patch.created_by_name = name
    if (email && (await hasColumn('created_by_email'))) patch.created_by_email = email

    const wt = normalizeWorkType(input.work_type ?? null)
    if (wt && (await hasWorkTypeColumn())) patch.work_type = wt

    if (typeof input.is_protected === 'boolean' && (await hasColumn('is_protected'))) {
      patch.is_protected = input.is_protected
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from('minute').update(patch).eq('id', row.id)
    }
  } catch (e) {
    // No rompemos el flujo si falla el parche; la minuta ya quedó creada
    console.warn('[createMinute] Patch opcional omitido:', e)
  }

  return row
}

/**
 * updateMinute
 *  - Aplica un patch seguro (nunca toca `folio`/`folio_serial` ni dueño).
 *  - Devuelve la fila actualizada.
 */
export async function updateMinute(
  id: string,
  patch: {
    date?: string | null
    start_time?: string | null
    end_time?: string | null
    tarea_realizada?: string | null
    novedades?: string | null
    is_protected?: boolean
    description?: string | null
    work_type?: string | null
  }
): Promise<Minute> {
  const normalized: Record<string, any> = {}

  if (patch.date !== undefined) {
    const d = emptyToNull(patch.date)
    if (d !== null) normalized.date = d
  }
  if (patch.start_time !== undefined) normalized.start_time = emptyToNull(patch.start_time)
  if (patch.end_time !== undefined)   normalized.end_time   = emptyToNull(patch.end_time)
  if (patch.tarea_realizada !== undefined) normalized.tarea_realizada = emptyToNull(patch.tarea_realizada)
  if (patch.novedades !== undefined)       normalized.novedades       = emptyToNull(patch.novedades)
  if (patch.is_protected !== undefined)    normalized.is_protected    = patch.is_protected
  if (patch.description !== undefined)     normalized.description     = emptyToNull(patch.description)

  if (patch.work_type !== undefined) {
    normalized.work_type = normalizeWorkType(patch.work_type)
  }

  const safe = sanitize(pruneUndefined(normalized), [
    'folio',
    'folio_serial',
    'user_id',
    'created_by',
  ])

  if ('description' in safe && safe.description && !(await hasDescriptionColumn())) {
    delete (safe as any).description
  }
  if ('work_type' in safe && !(await hasWorkTypeColumn())) {
    delete (safe as any).work_type
  }

  const { data, error } = await supabase
    .from('minute')
    .update(safe)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Minute
}

/** getMinuteById: devuelve la fila o null si no existe (RLS aplica). */
export async function getMinuteById(id: string): Promise<Minute | null> {
  const { data, error } = await supabase.from('minute').select('*').eq('id', id).single()
  if (error) return null
  return data as Minute
}

/** listMyMinutes: lista del usuario actual, ordenada por fecha/hora. */
export async function listMyMinutes(): Promise<Minute[]> {
  const userId = await getCurrentUserId()
  const ownerCol = await detectOwnerColumn()

  let query = supabase
    .from('minute')
    .select(`
      id, date, start_time, end_time, tarea_realizada, novedades,
      folio, folio_serial, created_at, updated_at, is_protected,
      created_by_name, created_by_email, user_id, created_by,
      work_type
    `)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (ownerCol === 'user_id') query = query.eq('user_id', userId)
  else if (ownerCol === 'created_by') query = query.eq('created_by', userId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Minute[]
}

/** listAllMinutesForAdmin: listado global (RLS/Policies decidirán acceso). */
export async function listAllMinutesForAdmin(): Promise<Minute[]> {
  const { data, error } = await supabase
    .from('minute')
    .select(`
      id, date, start_time, end_time, tarea_realizada, novedades,
      folio, folio_serial, created_at, updated_at, is_protected,
      created_by_name, created_by_email, user_id, created_by,
      work_type
    `)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (error) throw error
  return (data ?? []) as Minute[]
}

/** START con hora del servidor vía RPC (respeta RLS en función). */
export async function startMinute(minuteId: string): Promise<Minute> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('No hay sesión.')
  const { data, error } = await supabase.rpc('minute_start', { p_minute_id: minuteId, p_user_id: userId })
  if (error) throw error
  return data as Minute
}

/** STOP con hora del servidor vía RPC (respeta RLS en función). */
export async function stopMinute(minuteId: string): Promise<Minute> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('No hay sesión.')
  const { data, error } = await supabase.rpc('minute_stop', { p_minute_id: minuteId, p_user_id: userId })
  if (error) throw error
  return data as Minute
}

// ---------------------------------------------------------------------------
// Eliminación segura de minuta + limpieza best-effort
// ---------------------------------------------------------------------------

export async function deleteMinute(
  minuteId: string,
  options: { bucket?: string; removeStorage?: boolean } = {}
): Promise<{ minuteId: string; attachmentsFound: number; storageRemoved: number; attachmentsDeleted: number; }> {
  const bucket = options.bucket || process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'minutes'
  const shouldRemoveStorage = options.removeStorage !== false

  let attachmentsFound = 0
  let storageRemoved = 0
  let attachmentsDeleted = 0

  const { data: files, error: selErr } = await supabase
    .from('attachment')
    .select('id, path')
    .eq('minute_id', minuteId)

  if (selErr) {
    console.warn('[deleteMinute] No se pudieron leer adjuntos:', selErr)
  }

  const paths = (files ?? [])
    .map((f: any) => f?.path)
    .filter((p: any) => typeof p === 'string' && p.trim().length > 0)

  attachmentsFound = paths.length

  if (shouldRemoveStorage && attachmentsFound > 0) {
    const { error: rmErr } = await supabase.storage.from(bucket).remove(paths)
    if (rmErr) {
      console.warn('[deleteMinute] Falló borrar archivos de Storage:', rmErr)
    } else {
      storageRemoved = attachmentsFound
    }
  }

  const { data: delAttRows, error: delAttErr } = await supabase
    .from('attachment')
    .delete()
    .eq('minute_id', minuteId)
    .select('id')

  if (delAttErr) {
    console.info('[deleteMinute] Borrado attachment omitible:', delAttErr)
  } else {
    attachmentsDeleted = delAttRows?.length ?? 0
  }

  const { error: delMinErr } = await supabase
    .from('minute')
    .delete()
    .eq('id', minuteId)
    .select('id')

  if (delMinErr) throw delMinErr

  return { minuteId, attachmentsFound, storageRemoved, attachmentsDeleted }
}

// ---------------------------------------------------------------------------
// Resolución del "creador" para UI admin
// ---------------------------------------------------------------------------

async function getProfileNameEmail(userId: string): Promise<{ name: string | null; email: string | null }> {
  let { data, error } = await supabase
    .from('profiles')
    .select('full_name, name, display_name, email')
    .eq('id', userId)
    .limit(1)
    .single()

  if (!error && data) {
    const name = (data.full_name || data.name || data.display_name || null) as string | null
    const email = (data.email || null) as string | null
    return { name, email }
  }

  const alt = await supabase
    .from('profile')
    .select('full_name, name, display_name, email')
    .eq('id', userId)
    .limit(1)
    .single()

  if (!alt.error && alt.data) {
    const name = (alt.data.full_name || alt.data.name || alt.data.display_name || null) as string | null
    const email = (alt.data.email || null) as string | null
    return { name, email }
  }

  return { name: null, email: null }
}

export type MinuteWithCreator = Minute & { creator_display: string | null }

export async function getMinuteByIdWithCreator(id: string): Promise<MinuteWithCreator | null> {
  const row = await getMinuteById(id)
  if (!row) return null
  const ownerCol = await detectOwnerColumn()
  const ownerId =
    ownerCol === 'user_id' ? (row as any).user_id
    : ownerCol === 'created_by' ? (row as any).created_by
    : null
  let creator_display: string | null = null

  if ((row as any).created_by_name) {
    creator_display = (row as any).created_by_name
  } else if ((row as any).created_by_email) {
    creator_display = (row as any).created_by_email
  } else if (ownerId) {
    const p = await getProfileNameEmail(ownerId)
    creator_display = (p.name && p.name.trim()) || p.email || null
  }

  return { ...(row as any), creator_display }
}
