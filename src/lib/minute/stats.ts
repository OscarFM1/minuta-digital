// src/lib/minute/stats.ts
/**
 * Módulo de métricas de minutas.
 * -------------------------------------------------------------
 * Este módulo expone funciones para consumir la información de "Mis minutas"
 * desde la capa de BD (RPCs en Supabase). El flujo recomendado es usar
 * getMyMinutesPage(), que devuelve lista + totales consistentes en una sola llamada.
 *
 * Recomendación:
 *  - Usar getMyMinutesPage() para renderizar:
 *      - el grid de minutas (items)
 *      - la barra StatsBar (count, totalMinutes)
 *  - Mantengo getMyMinutesStats() por compatibilidad temporal.
 *
 * IMPORTANTE:
 *  - Las RPCs usan auth.uid(), así que este módulo siempre debe llamarse
 *    con sesión iniciada (el Supabase client ya envía el JWT).
 */

import { supabase } from '@/lib/supabaseClient'

/** Estructura de datos que consume el card (StatsBar). */
export type MyMinutesStats = {
  /** Total de minutas del usuario autenticado en el rango solicitado. */
  total: number
  /** Total de minutos (entero) del mismo conjunto. */
  totalMinutes: number
}

/** Item que retorna la RPC unificada `my_minutes_page`. */
export type MinuteRow = {
  id: string
  date: string
  started_at: string | null
  ended_at: string | null
  start_time: string | null
  end_time: string | null
  /** Duración efectiva por fila (segundos) con fallback a date + time. */
  duration_effective_seconds: number
  description: string | null
  tarea_realizada: string | null
  /** Repetidos en cada fila para el set actual (consumir solo de la primera). */
  total_rows: number
  total_seconds: number
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
 * 🔵 RECOMENDADO: Lista + totales del mismo conjunto en una sola llamada.
 * Usa la RPC `my_minutes_page` (con fallback de duración y TZ local en BD).
 *
 * @returns { items, total, totalMinutes }
 *  - items: filas a renderizar en el grid (MinuteRow[])
 *  - total: count estable del set
 *  - totalMinutes: sumatoria estable (total_seconds/60 floor)
 */
export async function getMyMinutesPage(params?: {
  from?: string | null
  to?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: MinuteRow[]; total: number; totalMinutes: number }> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) return { items: [], total: 0, totalMinutes: 0 }

  const { data, error } = await supabase.rpc('my_minutes_page', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
    p_limit: params?.limit ?? 20,
    p_offset: params?.offset ?? 0,
  })
  if (error) throw error

  const items = (data ?? []) as MinuteRow[]
  const total = Number(items[0]?.total_rows ?? 0)
  const totalSeconds = Number(items[0]?.total_seconds ?? 0)
  const totalMinutes = secondsToMinutes(totalSeconds)

  return { items, total, totalMinutes }
}

/**
 * 🟠 Compatibilidad: estadísticas antiguas basadas en `my_minutes_stats`.
 * Úsala solo si tienes pantallas que todavía la requieren.
 */
export async function getMyMinutesStats(params?: {
  from?: string | null
  to?: string | null
}): Promise<MyMinutesStats> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) return { total: 0, totalMinutes: 0 }

  const { data, error } = await supabase.rpc('my_minutes_stats', {
    p_from: params?.from ?? null,
    p_to: params?.to ?? null,
  })
  if (error) throw error

  const total = Number((data as any)?.total ?? 0)
  const totalSeconds = Number((data as any)?.total_seconds ?? 0)

  return {
    total: Number.isFinite(total) ? total : 0,
    totalMinutes: secondsToMinutes(totalSeconds),
  }
}

/**
 * Utilidad: devuelve el primer y último día (YYYY-MM-DD) a partir de 'YYYY-MM'.
 * Maneja años bisiestos y meses de 28/29/30/31 días.
 */
function monthEdgeDates(monthISO: string): { from: string; to: string } {
  const [yStr, mStr] = monthISO.split('-')
  const year = Number(yStr)
  const monthIndex = Number(mStr) - 1 // JS Date: 0-11
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`monthISO inválido: "${monthISO}". Se esperaba "YYYY-MM"`)
  }

  const fromDate = new Date(Date.UTC(year, monthIndex, 1))
  const toDate = new Date(Date.UTC(year, monthIndex + 1, 0))
  const pad = (n: number) => String(n).padStart(2, '0')

  const from = `${fromDate.getUTCFullYear()}-${pad(fromDate.getUTCMonth() + 1)}-${pad(fromDate.getUTCDate())}`
  const to = `${toDate.getUTCFullYear()}-${pad(toDate.getUTCMonth() + 1)}-${pad(toDate.getUTCDate())}`
  return { from, to }
}

/**
 * Consulta ad-hoc por mes. Mantén esto solo para diagnósticos o reportes.
 * Para la pantalla "Mis minutas" usa SIEMPRE getMyMinutesPage().
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
