/**
 * Capa de acceso a datos para MINUTAS
 * ============================================================================
 * Objetivo
 * - Crear/actualizar minutas SIN enviar `folio`/`folio_serial` desde el cliente.
 *   (Los asigna el trigger en la BD. Concurrency-safe.)
 * - Reintentar 1 vez ante 23505 (duplicate key) para resolver carreras.
 * - Ser tolerante a esquemas (instancias con `user_id` o `created_by`).
 * - No romper si faltan columnas opcionales (description, created_by_*).
 *
 * Buenas prácticas aplicadas
 * - Insert idempotente con backoff corto (120ms) en 23505 (unique_violation).
 * - Nunca actualizamos `folio`/`folio_serial` ni columnas de dueño desde UI.
 * - Selects tipados y ordenados; helpers cacheados para introspección ligera.
 *
 * NOTA: Esta API asume que en la BD ya existe el trigger que asigna folio:
 *   - Trigger BEFORE INSERT/UPDATE en public.minute (con advisory lock por user)
 *   - UNIQUE efectiva en (user_id, folio_serial)
 */

import { supabase } from '@/lib/supabaseClient'
import type { Minute } from '@/types/minute'

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

/** Limpia campos prohibidos antes de enviar a BD. */
function sanitize<T extends Record<string, any>>(obj: T, forbidden: string[]): T {
  const clone: any = { ...obj }
  for (const k of forbidden) delete clone[k]
  return clone
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
    // Intento 1
    let { data, error } = await supabase
      .from('minute')
      .insert(payload)   // ❗️sin folio/serial
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
      const second = await supabase.from('minute').insert(payload).select().single()
      if (!second.error) return second.data as Minute
      if (isUniqueViolation(second.error)) {
        // Devolver error amable; la capa superior lo puede traducir si desea
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
 *  - `description` sólo si la columna existe.
 */
export async function createMinute(input: {
  date?: string | null
  start_time?: string | null
  end_time?: string | null
  tarea_realizada?: string | null
  novedades?: string | null
  is_protected?: boolean
  description?: string | null
}): Promise<Minute> {
  const userId = await getCurrentUserId()
  const { name, email } = await getCurrentUserIdentity()

  // Campos base (sin folio/serial)
  const base: Record<string, unknown> = {
    tarea_realizada: input.tarea_realizada ?? null,
    novedades: input.novedades ?? null,
    is_protected: input.is_protected ?? false,
  }

  // Opcionales de fecha/hora
  if (input.date != null) base.date = input.date
  if (input.start_time != null) base.start_time = input.start_time
  if (input.end_time != null) base.end_time = input.end_time

  // Identidad (sólo si existen esas columnas)
  if (await hasColumn('created_by_name')) base.created_by_name = name
  if (await hasColumn('created_by_email')) base.created_by_email = email

  // description (si existe y viene dato)
  if (input.description && (await hasDescriptionColumn())) {
    base.description = input.description
  }

  const row = await insertMinuteWithOwner(base, userId)
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
    // ❌ NO permitir: folio, folio_serial, user_id, created_by
  }
): Promise<Minute> {
  const safe = sanitize(patch as Record<string, any>, [
    'folio',
    'folio_serial',
    'user_id',
    'created_by',
  ])

  // Sólo incluir description si existe la columna
  if (safe.description && !(await hasDescriptionColumn())) {
    delete (safe as any).description
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
      created_by_name, created_by_email, user_id, created_by
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
      created_by_name, created_by_email, user_id, created_by
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
