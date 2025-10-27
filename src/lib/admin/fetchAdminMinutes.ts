/**
 * src/lib/admin/fetchAdminMinutes.ts
 * -----------------------------------------------------------------------------
 * ÚNICO punto de acceso para cargar minutas en la vista Admin mediante RPC:
 *   public.admin_minutes_page(p_from_date, p_to_date, p_user_id, p_tz, p_limit, p_offset)
 *
 * - Devuelve lista paginada + totales en una sola llamada.
 * - Evita subconsultas recursivas (se acabó el "stack depth limit exceeded").
 * - Aplica fallback de duración en SQL (no recalcular en el front).
 *
 * Buenas prácticas:
 * - Tipos estrictos de TS.
 * - Fechas: enviar como YYYY-MM-DD (date), no DateTime.
 * - Errores: lanza Error con contexto; la UI decide cómo mostrarlos.
 *
 * Recordatorio: sube cualquier cambio a Git.
 */

import { createClient } from '@supabase/supabase-js';

export type AdminMinuteItem = {
  id: string;
  date: string;                 // YYYY-MM-DD
  start_time: string | null;    // HH:mm:ss o null
  end_time: string | null;
  description: string;
  notes: string | null;
  created_at: string;           // ISO
  user_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  tarea_realizada: string;
  novedades: string | null;
  updated_at: string | null;
  folio_serial: number | null;
  folio: string | null;
  start_time_backup: string | null;
  end_time_backup: string | null;
  is_protected: boolean;
  started_at: string | null;    // ISO o null
  ended_at: string | null;      // ISO o null
  work_type: 'gran_formato' | 'publicomercial' | 'editorial' | 'empaques' | null;
  attachments_count: number;
  duration_seconds: number;     // ya viene con fallback desde SQL
};

export type AdminMinutesResponse = {
  items: AdminMinuteItem[];
  totalRows: number;     // total de filas del set (sin paginar)
  totalMinutes: number;  // totalSeconds/60 redondeado hacia abajo
};

function toDateOnly(d: Date): string {
  // Convierte Date local a 'YYYY-MM-DD' sin timezone.
  return d.toISOString().slice(0, 10);
}

/**
 * fetchAdminMinutes
 * @param params.from  Fecha local (inicio, inclusive)
 * @param params.to    Fecha local (fin, inclusive)
 * @param params.userId (opcional) filtra por usuario
 * @param params.tz     zona horaria (default: 'America/Bogota')
 * @param params.limit  tamaño de página (default: 50)
 * @param params.offset desplazamiento para paginación
 */
export async function fetchAdminMinutes(params: {
  from: Date;
  to: Date;
  userId?: string | null;
  tz?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminMinutesResponse> {
  const {
    from,
    to,
    userId = null,
    tz = 'America/Bogota',
    limit = 50,
    offset = 0,
  } = params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const p_from_date = toDateOnly(from);
  const p_to_date   = toDateOnly(to);

  const { data, error } = await supabase.rpc('admin_minutes_page', {
    p_from_date,
    p_to_date,
    p_user_id: userId,
    p_tz: tz,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    // Log útil para depurar errores residuales
    // (No incluyas secrets; solo payload necesario)
    console.error('[admin_minutes_page] RPC error', {
      message: error.message,
      hint: (error as any).hint,
      code: (error as any).code,
      params: { p_from_date, p_to_date, userId, tz, limit, offset },
    });
    throw new Error(`Error cargando minutas (admin): ${error.message}`);
  }

  const items = (data?.items ?? []) as AdminMinuteItem[];
  const totalRows = Number(data?.total_rows ?? 0);
  const totalMinutes = Math.floor(Number(data?.total_seconds ?? 0) / 60);

  return { items, totalRows, totalMinutes };
}
