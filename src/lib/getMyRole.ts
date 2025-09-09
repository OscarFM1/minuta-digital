import { supabase } from '@/lib/supabaseClient'
import type { UserRole } from './resolveHome'
import { normalizeRole } from './resolveHome'

// Lee profiles.role del usuario actual.
export async function getMyRole(): Promise<UserRole> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'worker'
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return normalizeRole(data?.role)
}
