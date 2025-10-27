// src/lib/admin/fetchAdminUserOptions.ts
import { createClient } from '@supabase/supabase-js';

export type AdminUserOption = {
  user_id: string;
  created_by_name: string | null;
  created_by_email: string | null;
  minutes_count: number;
};

export async function fetchAdminUserOptions(params: {
  from: Date;
  to: Date;
  tz?: string;
  limit?: number;
}): Promise<AdminUserOption[]> {
  const { from, to, tz = 'America/Bogota', limit = 50 } = params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const p_from_date = from.toISOString().slice(0, 10);
  const p_to_date   = to.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('admin_minute_user_options', {
    p_from_date, p_to_date, p_tz: tz, p_limit: limit,
  });

  if (error) throw new Error(`No se pudieron cargar usuarios: ${error.message}`);
  return (data ?? []) as AdminUserOption[];
}
