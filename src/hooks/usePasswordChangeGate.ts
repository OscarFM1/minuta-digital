/**
 * Obliga a cambiar la contraseña si profiles.must_change_password === true.
 * - Lee la sesión actual.
 * - Consulta el propio perfil (profiles.id = auth.users.id).
 * - Si detecta el flag -> redirige a /cambiar-password.
 * - Evita bucles en /cambiar-password, /login, /logout.
 */
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  must_change_password?: boolean
  first_login?: boolean | string | number
}

async function fetchOwnProfile(): Promise<Profile | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, must_change_password, first_login')
    .eq('id', userId)           // 👈 tu PK es "id", no "user_id"
    .single()

  if (error) return null
  return data as Profile
}

export function usePasswordChangeGate() {
  const router = useRouter()
  const pathname = router.pathname

  const isGateExempt = useMemo(
    () =>
      pathname.startsWith('/cambiar-password') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/logout'),
    [pathname]
  )

  const { data: profile } = useSWR(
    isGateExempt ? null : 'profile:me',
    fetchOwnProfile,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )

  useEffect(() => {
    if (!isGateExempt && profile?.must_change_password) {
      router.replace('/cambiar-password?reason=temp')
    }
  }, [isGateExempt, profile?.must_change_password, router])
}
