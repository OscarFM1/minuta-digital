/**
 * src/lib/admin/fetchAdminMinutes.ts
 * -----------------------------------------------------------------------------
 * Carga minutas en Admin vía RPC:
 *  - v2: public.admin_minutes_page_v2(...)
 *  - fallback: public.admin_minutes_page(...)
 * Normaliza formato de salida (v2 {items...} / v1 array) para evitar listas vacías.
 * Recuerda subir cualquier cambio a Git.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AdminMinuteItem = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  description: string;
  notes: string | null;
  created_at: string;
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
  started_at: string | null;
  ended_at: string | null;
  work_type: 'gran_formato' | 'publicomercial' | 'editorial' | 'empaques' | null;
  attachments_count: number;
  duration_seconds: number;
};

export type AdminMinutesResponse = {
  items: AdminMinuteItem[];
  totalRows: number;
  totalMinutes: number;
};

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function rpcWithFallback<T = any>(
  client: SupabaseClient,
  nameV2: string,
  nameV1: string,
  args?: Record<string, unknown>
): Promise<T> {
  const v2 = await client.rpc(nameV2, args ?? {});
  if (v2.error) {
    const msg = v2.error.message?.toLowerCase() ?? '';
    if (msg.includes('not found') || msg.includes('rpc')) {
      const v1 = await client.rpc(nameV1, args ?? {});
      if (v1.error) throw v1.error;
      return v1.data as T;
    }
    throw v2.error;
  }
  return v2.data as T;
}

export async function fetchAdminMinutes(params: {
  from: Date;
  to: Date;
  userId?: string | null;
  tz?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminMinutesResponse> {
  const { from, to, userId = null, tz = 'America/Bogota', limit = 50, offset = 0 } = params;

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const p_from_date = toDateOnly(from);
  const p_to_date   = toDateOnly(to);

  const data: any = await rpcWithFallback(
    supa,
    'admin_minutes_page_v2',
    'admin_minutes_page',
    { p_from_date, p_to_date, p_user_id: userId, p_tz: tz, p_limit: limit, p_offset: offset }
  );

  // Normaliza: v2 = {items...}; v1 = array
  const items = (Array.isArray(data) ? data : data?.items ?? []) as AdminMinuteItem[];
  const totalRows = Number(data?.total_rows ?? (Array.isArray(data) ? data.length : 0));
  const totalMinutes = Math.floor(Number(data?.total_seconds ?? 0) / 60);

  return { items, totalRows, totalMinutes };
}
