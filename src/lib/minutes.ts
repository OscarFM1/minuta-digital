// src/lib/minutes.ts
/**
 * Capa de acceso a datos para MINUTAS
 * ============================================================================
 * Objetivo
 * - Crear/actualizar minutas SIN enviar `folio`/`folio_serial` desde el cliente.
 *   (Los asigna el trigger en la BD. Concurrency-safe.)
 * - Reintentar 1 vez ante 23505 (duplicate key) para resolver carreras.
 * - Ser tolerante a esquemas (instancias con `user_id` o `created_by`).
 * - No romper si faltan columnas opcionales (description, created_by_*, work_type).
 *
 * Buenas prácticas
 * - Insert con backoff corto (120ms) cuando ocurre 23505 (unique_violation).
 * - Nunca tocar `folio`/`folio_serial` ni columnas de dueño en UI.
 * - Selects tipados y helpers cacheados para introspección ligera.
 *
 * Requisitos en BD:
 * - Trigger que asigna folio/folio_serial (y UNIQUE efectiva por usuario).
 * - Columna opcional `work_type` con CHECK de valores (si aplicaste la migración).
 */

import { supabase } from '@/lib/supabaseClient'
import type { Minute } from '@/types/minute'
import { WORK_TYPE_VALUES } from '@/types/minute'

// Derivamos el tipo localmente del valor runtime para evitar alias/imports dobles
type WorkType = (typeof WORK_TYPE_VALUES)[number]

// ---------------------------------------------------------------------------
// Utils de errores y helpers generales
// ---------------------------------------------------------------------------

/** Detecta 23505 (duplicate key / unique_violation) con tolerancia a formatos. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as any
  const code = e?.code ?? e?.details?.code ?? e?.hint?.code
  const msg = String(e?.message ?? '')
  return code === '23505' || /duplicate key value violates unique constraint/i.test(msg)
}

/** Backoff simple para reintento controlado. */
function delay(ms: number) { return new Promise(res => setTimeout(res, ms)) }

/** Borra claves con `undefined` (evita enviar basura en PATCH/INSERT). */
function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {}
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/** Limpia campos prohibidos antes de enviar a BD. */
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

/** YYYY-MM-DD (hoy) — Útil para evitar NOT NULL en `date`. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Normaliza un valor arbitrario a WorkType (case/espacios → snake) o null si inválido. */
function normalizeWorkType(v?: string | null): WorkType | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_')
  return (WORK_TYPE_VALUES as readonly string[]).includes(s) ? (s as WorkType) : null
}

// ---------------------------------------------------------------------------
// Detecciones cacheadas de columnas (introspección ligera)
// ---------------------------------------------------------------------------

let ownerColumnCache: 'user_id' | 'created_by' | 'none' | null = null
const columnExistsCache: Record<string, boolean> = {}

/** Detecta si existe una columna en public.minute (resultado cacheado). */
async function hasColumn(col: string): Promise<boolean> {
  if (col in columnExistsCache) return columnExistsCache[col]
  const { error } = await supabase.from('minute').select(`id, ${col}`).limit(1)
  const ok = !error
  columnExistsCache[col] = ok
  return ok
}

async function hasDescriptionColumn() { return hasColumn('description') }
/** Detecta si existe la columna `work_type`. */
async function hasWorkTypeColumn() { return hasColumn('work_type') }

/**
 * Detecta la columna de “dueño” (propietario de la fila) disponible:
 * retorna "user_id", "created_by" o "none".
 */
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

/** Usuario actual (id o error claro). */
async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('No hay sesión activa.')
  return data.user.id
}

/** Identidad ligera del usuario actual (name/email) para metadata. */
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
// Inserción con asignación de dueño + manejo de 23505 con retry
// ---------------------------------------------------------------------------

/**
 * Intenta insertar la fila probando las variantes de columna de dueño.
 * - NO incluye ni toca `folio`/`folio_serial`: los genera el trigger de BD.
 * - Si aparece 23505 (por carrera de unique en folio), reintenta 1 vez (120ms).
 */
async function insertMinuteWithOwner(base: Record<string, unknown>, userId: string): Promise<Minute> {
  const detected = await detectOwnerColumn()
  const candidates: Array<Record<string, unknown>> = []

  if (detected === 'user_id') {
    candidates.push({ ...base, user_id: userId })
    candidates.push({ ...base, created_by: userId })
  } else if (detected === 'created_by') {
    candidates.push({ ...base, created_by: userId })
    candidates.push({ ...base, user_id: userId })
  } else {
    candidates.push({ ...base }) // instancia sin columna de dueño (poco probable)
  }

  let lastErr: any = null

  for (const payload of candidates) {
    const clean = pruneUndefined(payload)

    // Intento 1
    let { data, error } = await supabase
      .from('minute')
      .insert(clean)      // ❗️sin folio/serial
      .select()
      .single()

    if (!error) return data as Minute

    // Si es por columna faltante, prueba siguiente candidato
    const msg = (error.message || '').toLowerCase()
    const missing = msg.includes('could not find') || msg.includes('does not exist') || msg.includes('unknown column')
    if (missing) { lastErr = error; continue }

    // Si es unique_violation (23505) reintenta 1 vez con backoff corto
    if (isUniqueViolation(error)) {
      await delay(120)
      const second = await supabase.from('minute').insert(clean).select().single()
      if (!second.error) return second.data as Minute
      if (isUniqueViolation(second.error)) {
        throw new Error('Conflicto temporal al asignar número de minuta. Intenta nuevamente.')
      }
      throw second.error
    }

    // Otro error “real”
    throw error
  }

  throw lastErr ?? new Error('No fue posible insertar la minuta (columna de dueño desconocida).')
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * createMinute
 *  - NO envía `folio` ni `folio_serial`. (El trigger en BD los genera.)
 *  - Si existen, setea created_by_name / created_by_email.
 *  - `description`/`work_type` solo si las columnas existen.
 *  - ✅ Garantiza `date` (hoy) si no viene, para respetar NOT NULL.
 */
export async function createMinute(input: {
  date?: string | null
  start_time?: string | null
  end_time?: string | null
  tarea_realizada?: string | null
  novedades?: string | null
  is_protected?: boolean
  description?: string | null
  work_type?: string | null
}): Promise<Minute> {
  const userId = await getCurrentUserId()
  const { name, email } = await getCurrentUserIdentity()

  // ✅ Si no nos pasan fecha, usamos hoy (evita NOT NULL)
  const safeDate = emptyToNull(input.date ?? null) || todayISO()

  // Campos base (sin folio/serial) — normalizamos vacíos a null
  const base: Record<string, unknown> = {
    date: safeDate, // 👈 nunca null
    start_time: emptyToNull(input.start_time ?? null),
    end_time: emptyToNull(input.end_time ?? null),
    tarea_realizada: emptyToNull(input.tarea_realizada ?? null),
    novedades: emptyToNull(input.novedades ?? null),
    is_protected: input.is_protected ?? false,
  }

  // Identidad (sólo si existen esas columnas)
  if (await hasColumn('created_by_name')) base.created_by_name = name
  if (await hasColumn('created_by_email')) base.created_by_email = email

  // description (si existe y viene dato)
  const desc = emptyToNull(input.description ?? null)
  if (desc && (await hasDescriptionColumn())) {
    base.description = desc
  }

  // work_type (si existe la columna y el valor es válido)
  const wt = normalizeWorkType(input.work_type ?? null)
  if (wt && (await hasWorkTypeColumn())) {
    base.work_type = wt
  }

  const row = await insertMinuteWithOwner(base, userId)
  return row
}

/**
 * updateMinute
 *  - Aplica un patch seguro (nunca toca `folio`/`folio_serial` ni dueño).
 *  - Devuelve la fila actualizada.
 *  - ✅ Ya no envía `date: null` cuando `patch.date` es `undefined`.
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
    // ❌ NO permitir: folio, folio_serial, user_id, created_by
  }
): Promise<Minute> {
  // Construimos el objeto **solo** con claves presentes y válidas.
  const normalized: Record<string, any> = {}

  // 👇 Solo incluimos date si VIENE en el patch y no es null/''.
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

  // work_type: permitimos limpiar (null) o actualizar si válido
  if (patch.work_type !== undefined) {
    normalized.work_type = normalizeWorkType(patch.work_type)
  }

  const safe = sanitize(pruneUndefined(normalized), [
    'folio',
    'folio_serial',
    'user_id',
    'created_by',
  ])

  // Sólo incluir description si existe la columna
  if ('description' in safe && safe.description && !(await hasDescriptionColumn())) {
    delete (safe as any).description
  }
  // Sólo incluir work_type si existe la columna
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
// Eliminación segura de minuta (tester-only vía RLS) + limpieza best-effort
// ---------------------------------------------------------------------------

/**
 * deleteMinute
 * ----------------------------------------------------------------------------
 * Elimina una minuta y sus adjuntos asociados. Pensada para el flujo del
 * usuario de pruebas (p. ej., `pruebas@login.local`), donde la **RLS** en BD
 * permite el `DELETE` únicamente para su propio contenido.
 *
 * Comportamiento:
 *  1) Lee los paths de `attachment` (si existen).
 *  2) Intenta borrar los archivos del bucket de Storage (best-effort).
 *  3) Elimina filas de `attachment` (por si NO hay ON DELETE CASCADE).
 *  4) Elimina la fila de `minute`.
 */
export async function deleteMinute(
  minuteId: string,
  options: { bucket?: string; removeStorage?: boolean } = {}
): Promise<{ minuteId: string; attachmentsFound: number; storageRemoved: number; attachmentsDeleted: number; }> {
  const bucket = options.bucket || process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'minutes'
  const shouldRemoveStorage = options.removeStorage !== false

  // 1) Leer adjuntos (paths) asociados a la minuta
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

  // 2) Borrar archivos en Storage (best-effort)
  const paths = (files ?? [])
    .map((f: any) => f?.path)
    .filter((p: any) => typeof p === 'string' && p.trim().length > 0)

  attachmentsFound = paths.length

  if (shouldRemoveStorage && attachmentsFound > 0) {
    const { error: rmErr } = await supabase.storage.from(bucket).remove(paths)
    if (rmErr) {
      console.warn('[deleteMinute] Falló borrar archivos de Storage:', rmErr)
    } else {
      storageRemoved = attachmentsFound // asumimos éxito si no hubo error
    }
  }

  // 3) Borrar filas de `attachment` (por si NO hay cascade)
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

  // 4) Borrar la minuta
  const { error: delMinErr } = await supabase
    .from('minute')
    .delete()
    .eq('id', minuteId)
    .select('id')

  if (delMinErr) {
    // Típico: 42501 (permission denied) por RLS si NO es el tester autorizado.
    throw delMinErr
  }

  return { minuteId, attachmentsFound, storageRemoved, attachmentsDeleted }
}

// ---------------------------------------------------------------------------
// Resolución del "creador" de la minuta (ADMIN-friendly)
// ---------------------------------------------------------------------------

/**
 * Busca nombre/email del usuario en la tabla de perfiles.
 * - Intenta primero 'profiles' y luego 'profile' (tolerante a esquemas).
 * - Devuelve el mejor display name disponible o nulls si no hay datos.
 */
async function getProfileNameEmail(userId: string): Promise<{ name: string | null; email: string | null }> {
  // 1) Intento en 'profiles'
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

  // 2) Intento alterno en 'profile'
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

/**
 * Resuelve el string a mostrar para "Creador" a partir de una fila de minute.
 * Prioriza:
 *   1) created_by_name
 *   2) created_by_email
 *   3) (fallback) lookup en profiles usando la columna de dueño (user_id/created_by)
 */
export async function resolveCreatorDisplay(minuteRow: {
  created_by_name?: string | null
  created_by_email?: string | null
  user_id?: string | null
  created_by?: string | null
}): Promise<string | null> {
  const byName = (minuteRow.created_by_name || '').trim()
  if (byName) return byName

  const byEmail = (minuteRow.created_by_email || '').trim()
  if (byEmail) return byEmail

  // Fallback: detectar columna de dueño y consultar profiles
  const ownerCol = await detectOwnerColumn()
  const ownerId =
    ownerCol === 'user_id' ? minuteRow.user_id
    : ownerCol === 'created_by' ? minuteRow.created_by
    : null

  if (!ownerId) return null

  const { name, email } = await getProfileNameEmail(ownerId)
  return (name && name.trim()) || email || null
}

/**
 * Carga una minuta por id y adjunta `creator_display` ya resuelto para UI admin.
 * No altera el contrato de Minute; agrega un campo derivado.
 */
export type MinuteWithCreator = Minute & { creator_display: string | null }

export async function getMinuteByIdWithCreator(id: string): Promise<MinuteWithCreator | null> {
  const row = await getMinuteById(id)
  if (!row) return null
  const creator_display = await resolveCreatorDisplay(row as any)
  return { ...(row as any), creator_display }
}
