// src/types/minute.ts
/**
 * Minute: modelo de la tabla public.minute con tipos tolerantes.
 * ----------------------------------------------------------------------------
 * Este archivo **solo** define tipos y constantes compartidas. No importes
 * nada desde aquí que a su vez dependa de la capa de datos para evitar ciclos.
 *
 * Notas:
 * - `folio` puede venir como number o string (según instancia/histórico).
 * - `folio_serial` puede venir null o string (p.ej. "0001").
 * - `user_id`/`created_by`: soporta ambas variantes.
 * - NEW: `work_type` (tipo de trabajo) con valores restringidos.
 */

/* ===================== Work Type (constantes/tipos) ===================== */

/** Valores soportados para el tipo de trabajo (persistidos en BD). */
export const WORK_TYPE_VALUES = [
  'gran_formato',
  'publicomercial',
  'editorial',
  'empaques',
] as const

/** Tipo literal derivado de los valores permitidos. */
export type WorkType = typeof WORK_TYPE_VALUES[number]

/** Labels amigables por cada valor (útil en UI/exportaciones). */
export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  gran_formato: 'Gran Formato',
  publicomercial: 'Publicomercial',
  editorial: 'Editorial',
  empaques: 'Empaques',
}

/** Par (value/label) listo para armar `<select>` sin repetir lógica. */
export const WORK_TYPE_OPTIONS: Array<{ value: WorkType; label: string }> =
  WORK_TYPE_VALUES.map((v) => ({ value: v, label: WORK_TYPE_LABEL[v] }))

/* ===================== Modelo principal de Minute ===================== */

export type Minute = {
  id: string

  /** Fecha de la minuta (ISO "YYYY-MM-DD"). */
  date: string

  /** Hora de inicio "HH:mm". (En algunas vistas puede llegar vacío/null) */
  start_time: string

  /** Hora de fin "HH:mm". (En algunas vistas puede llegar vacío/null) */
  end_time: string

  /** Descripción de la tarea realizada (campo principal de contenido). */
  tarea_realizada: string

  /** Notas adicionales / novedades. */
  novedades?: string | null

  /** Dueño por variante 1 (instancias antiguas). */
  user_id?: string | null

  /** Dueño por variante 2 (instancias nuevas). */
  created_by?: string | null

  /** Nombre del creador (si se propaga en create). */
  created_by_name?: string | null

  /** Email del creador (si se propaga en create). */
  created_by_email?: string | null

  /** Bandera para proteger edición/borrado según reglas de negocio. */
  is_protected?: boolean | null

  // --- FOLIO ---
  /** Número visible de folio (puede ser string o number según origen). */
  folio?: number | string | null
  /** Serial interno asignado por trigger (e.g. "0001"). */
  folio_serial?: string | null

  // --- NEW: Tipo de trabajo ---
  /**
   * Línea a la que pertenece la minuta. Persistido como uno de:
   *  - 'gran_formato' | 'publicomercial' | 'editorial' | 'empaques'
   * Puede ser null si aún no se define o en instancias sin la columna.
   */
  work_type?: WorkType | null

  // --- metadatos ---
  /** Timestamp de creación (ISO). */
  created_at: string
  /** Timestamp de última actualización (ISO). */
  updated_at?: string | null

  // Para listados (JOIN/COUNT opcional)
  /** Conteo de adjuntos (si se selecciona con agregación). */
  attachments_count?: number | null
}
