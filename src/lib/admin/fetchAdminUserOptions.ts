// src/lib/admin/fetchAdminUserOptions.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AdminUserOption = {
  user_id: string;
  created_by_name: string | null;
  created_by_email: string | null;
  minutes_count: number;
};

/** Helper con args opcionales para evitar el error de TS. */
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

export async function fetchAdminUserOptions(params: {
  from: Date;
  to: Date;
  tz?: string;
  limit?: number;
}): Promise<AdminUserOption[]> {
  const { from, to, tz = 'America/Bogota', limit = 50 } = params;

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const p_from_date = from.toISOString().slice(0, 10);
  const p_to_date   = to.toISOString().slice(0, 10);

  const data = await rpcWithFallback<any[]>(
    supa,
    'admin_minute_user_options_v2',
    'admin_minute_user_options',
    { p_from_date, p_to_date, p_tz: tz, p_limit: limit }
  );

  return (data ?? []) as AdminUserOption[];
}
