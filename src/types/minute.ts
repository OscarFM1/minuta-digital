// src/types/minute.ts
/**
 * Minute: modelo de la tabla public.minute con tipos tolerantes.
 * - folio puede venir como number o string (según instancia/histórico)
 * - folio_serial puede venir null o string (p.ej. "0001")
 * - user_id/created_by: soporta ambas variantes
 */
export type Minute = {
  id: string;
  date: string;            // ISO "YYYY-MM-DD"
  start_time: string;      // "HH:mm"
  end_time: string;        // "HH:mm"
  tarea_realizada: string;
  novedades?: string | null;

  user_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;

  is_protected?: boolean | null;

  // --- FOLIO ---
  folio?: number | string | null;
  folio_serial?: string | null;

  // --- metadatos ---
  created_at: string;
  updated_at?: string | null;

  // para listados (JOIN/COUNT opcional)
  attachments_count?: number | null;
};
