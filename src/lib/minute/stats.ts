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
  duration_effective_seconds: number | string
  description: string | null
  tarea_realizada: string | null
  /** Repetidos en cada fila para el set actual (consumir solo de la primera). */
  total_rows: number | string
  total_seconds: number | string
}

/* ============================
 * Utilidades numéricas seguras
 * ============================ */

/** Convierte unknown a entero seguro >= 0. Si falla, retorna 0. */
function toSafeInt(n: unknown): number {
  if (typeof n === 'number') return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  if (typeof n === 'string') {
    const v = Number(n)
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
  }
  return 0
}

/** Convierte segundos a minutos enteros (floor). */
function secondsToMinutes(seconds: unknown): number {
  return Math.floor(toSafeInt(seconds) / 60)
}

/* ============================
 * RPC recomendada (lista + totales unificados)
 * ============================ */

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

  // OJO: PostgREST puede devolver total_rows/total_seconds como string => normalizamos
  const total = toSafeInt(items[0]?.total_rows ?? 0)
  const totalSeconds = toSafeInt(items[0]?.total_seconds ?? 0)
  const totalMinutes = secondsToMinutes(totalSeconds)

  // También normalizamos por fila la duración efectiva (útil si la usas en las cards)
  for (const it of items) {
    
    it.duration_effective_seconds = toSafeInt(it.duration_effective_seconds)
  }

  return { items, total, totalMinutes }
}

/* ============================
 * Compatibilidad (stats antiguas)
 * ============================ */

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

  const total = toSafeInt((data as any)?.total ?? 0)
  const totalSeconds = toSafeInt((data as any)?.total_seconds ?? 0)

  return {
    total,
    totalMinutes: secondsToMinutes(totalSeconds),
  }
}

/* ============================
 * Utilidad de diagnóstico por mes
 * ============================ */

/**
 * Consulta ad-hoc por mes. Mantén esto solo para diagnósticos o reportes.
 * Para la pantalla "Mis minutas" usa SIEMPRE getMyMinutesPage().
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
 * Consulta ad-hoc por mes (diagnóstico). No usar para la pantalla principal.
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
