// src/lib/format-hours.ts
// Utilidades minimalistas y bien tipadas para trabajar con "horas decimales" en UI de gráficos/tablas.
// Pensado para 5 usuarios y métricas simples (sin dependencias).
// -----------------------------------------------------------------------------------------------
// API pública:
// - formatHours(value, style)   -> "7h 30m" (default) o "07:30" (style = 'hh:mm')
// - toDecimalHours(h, m)        -> 7.5  (convierte HH y MM a decimal)
// - sanitizeHours(value)        -> normaliza a >= 0 y redondea a minuto más cercano
// - splitHM(value)              -> { hours, minutes } a partir de decimal
// -----------------------------------------------------------------------------------------------

export type FormatStyle = 'h_m' | 'hh:mm'

/**
 * Normaliza un número de horas a un valor >= 0, finito,
 * redondeado al minuto más cercano (evita 7.499999 por floats).
 */
export function sanitizeHours(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 60) / 60 // precisión a minutos
}

/**
 * Separa horas decimales en horas y minutos enteros.
 * Corrige el caso 60m → +1h.
 */
export function splitHM(value: unknown): { hours: number; minutes: number } {
  const safe = sanitizeHours(value)
  const hours = Math.floor(safe)
  const minutes = Math.round((safe - hours) * 60)
  if (minutes === 60) return { hours: hours + 1, minutes: 0 }
  return { hours, minutes }
}

/**
 * Formatea horas decimales para UI.
 * - 'h_m' (default): "7h 30m" / "7h"
 * - 'hh:mm'        : "07:30" / "07:00"
 */
export function formatHours(value: unknown, style: FormatStyle = 'h_m'): string {
  const { hours, minutes } = splitHM(value)
  if (style === 'hh:mm') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  // estilo 'h_m'
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

/**
 * Convierte HH y MM a horas decimales (p. ej. 7h 30m -> 7.5).
 */
export function toDecimalHours(h: number, m: number): number {
  const hh = Math.max(0, Math.floor(h))
  const mm = Math.max(0, Math.floor(m))
  return sanitizeHours(hh + mm / 60)
}
