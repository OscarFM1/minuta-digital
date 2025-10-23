// src/lib/minute/stats.ts
/**
 * Módulo de métricas de minutas.
 * -------------------------------------------------------------
 * Contiene utilidades para:
 *  - Obtener estadísticas del usuario autenticado (total y minutos).
 *  - Listar minutas por mes con rango correcto (sin aproximaciones).
 *
 * Notas de ingeniería:
 *  - getMyMinutesStats() llama a la RPC "my_minutes_stats" (SECURITY DEFINER),
 *    lo que asegura un cálculo consistente (sin variaciones antes/después de login).
 *  - Convertimos segundos -> minutos en este módulo para mantener al componente
 *    StatsBar simple y desacoplado de la fuente exacta (seg/ min).
 */

import { supabase } from '@/lib/supabaseClient'

/** Estructura de datos que consume el card (StatsBar). */
export type MyMinutesStats = {
  /** Total de minutas del usuario autenticado en el rango solicitado. */
  total: number
  /** Total de minutos (entero) del mismo conjunto. */
  totalMinutes: number
}

/**
 * Convierte segundos a minutos enteros, sin decimales.
 * Protege contra valores undefined/NaN (retorna 0).
 */
function secondsToMinutes(seconds: unknown): number {
  const n = typeof seconds === 'number' ? seconds : Number(seconds ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n / 60)
}

/**
 * Obtiene estadísticas de "Mis minutas" desde la RPC `my_minutes_stats`.
 * - Devuelve cifras estables: `{ total, totalMinutes }`.
 * - Si no hay sesión, devuelve `{ total: 0, totalMinutes: 0 }`.
 *
 * @param params Opcionalmente rango de fechas (formato YYYY-MM-DD).
 */
export async function getMyMinutesStats(params?: {
  from?: string | null
  to?: string | null
}): Promise<MyMinutesStats> {
  // 1) Aseguramos sesión para evitar leer como "anon"
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) return { total: 0, totalMinutes: 0 }

  // 2) Llamamos RPC
  const { data, error } = await supabase.rpc('my_minutes_stats', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
  })
  if (error) throw error

  // 3) Normalizamos
  const total = Number((data as any)?.total ?? 0)
  const totalSeconds = Number((data as any)?.total_seconds ?? 0)

  return {
    total: Number.isFinite(total) ? total : 0,
    totalMinutes: secondsToMinutes(totalSeconds),
  }
}

/**
 * Devuelve el primer y último día (YYYY-MM-DD) a partir de 'YYYY-MM' sin librerías externas.
 * Maneja años bisiestos y meses de 28/29/30/31 días.
 */
function monthEdgeDates(monthISO: string): { from: string; to: string } {
  // monthISO esperado: "YYYY-MM"
  const [yStr, mStr] = monthISO.split('-')
  const year = Number(yStr)
  const monthIndex = Number(mStr) - 1 // JS Date: 0-11
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`monthISO inválido: "${monthISO}". Se esperaba "YYYY-MM"`)
  }

  // Día 1
  const fromDate = new Date(Date.UTC(year, monthIndex, 1))
  // Día 0 del mes siguiente → último día del mes actual
  const toDate = new Date(Date.UTC(year, monthIndex + 1, 0))

  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${fromDate.getUTCFullYear()}-${pad(fromDate.getUTCMonth() + 1)}-${pad(fromDate.getUTCDate())}`
  const to = `${toDate.getUTCFullYear()}-${pad(toDate.getUTCMonth() + 1)}-${pad(toDate.getUTCDate())}`
  return { from, to }
}

/**
 * Lista minutas por mes (rango exacto), útil para paneles/diagnósticos.
 * Mantiene tu firma original, pero corrige el fin de mes.
 *
 * @param monthISO 'YYYY-MM' (ej: '2025-09')
 */
export async function listMinutesByMonth(monthISO: string) {
  const { from, to } = monthEdgeDates(monthISO)

  const { data, error } = await supabase
    .from('minute')
    .select('id, date, user_id')
    .gte('date', from)
    .lte('date', to)

  if (error) throw error
  return data
}
