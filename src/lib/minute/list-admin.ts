// src/lib/minute/list-admin.ts
import { supabase } from '@/lib/supabaseClient'

export async function listMinutesAdmin(filters?: { desde?: string; hasta?: string }) {
  let q = supabase
    .from('minute')
    .select('id, created_at, date, start_time, end_time, description, notes, work_type, folio, folio_serial, user_id, created_by_name, created_by_email')
    .order('created_at', { ascending: false })

  if (filters?.desde) q = q.gte('date', filters.desde)
  if (filters?.hasta) q = q.lte('date', filters.hasta)

  const { data, error } = await q
  if (error) {
    console.error('[listMinutesAdmin] error:', JSON.stringify(error, null, 2))
    throw new Error('No se pudo cargar el listado')
  }
  return data
}
