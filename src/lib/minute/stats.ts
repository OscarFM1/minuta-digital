// src/lib/minute/stats.ts
import { supabase } from '@/lib/supabaseClient'

export async function listMinutesByMonth(monthISO: string) {
  // monthISO: '2025-09' → filtramos entre inicio/fin del mes
  const desde = `${monthISO}-01`
  const hasta = `${monthISO}-31` // safe-approx; Postgres lte date lo resuelve
  const { data, error } = await supabase
    .from('minute')
    .select('id, date, user_id')
    .gte('date', desde)
    .lte('date', hasta)

  if (error) throw error
  return data
}
