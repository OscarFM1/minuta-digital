/**
 * usePasswordChangeGate.ts
 * -----------------------------------------------------------------------------
 * Redirige a /cambiar-password si profiles.must_change_password === true.
 * - Espera a tener sesión del usuario (uid) antes de consultar profiles.
 * - Consulta profiles por PK 'id' (no 'user_id').
 * - Se auto-exime en /cambiar-password, /login y /logout para evitar bucles.
 * - Se revalida al ganar/renovar sesión (onAuthStateChange + SWR).
 */

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate } from 'swr'
import { supabase } from '@/lib/supabaseClient'

type ProfileRow = {
  id: string
  must_change_password: boolean | null
}

// 1) Obtiene el uid actual (o null si no hay sesión)
async function getAuthUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

// 2) Lee el perfil del propio usuario
async function getOwnProfile(uid: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, must_change_password')
    .eq('id', uid) // 👈 tu PK es 'id'
    .single()

  // Si hay error de RLS o no existe, devuelve null para no romper la app
  if (error) return null
  return (data as ProfileRow) ?? null
}

export function usePasswordChangeGate() {
  const router = useRouter()
  const pathname = router.pathname

  // Evita bucles
  const isExempt = useMemo(
    () =>
      pathname.startsWith('/cambiar-password') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/logout'),
    [pathname]
  )

  // Escucha cambios de auth para revalidar 'auth:uid'
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      mutate('auth:uid')
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  // Primero: espera uid (sesión)
  const { data: uid } = useSWR(isExempt ? null : 'auth:uid', getAuthUid, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  // Segundo: con uid presente, consulta profile
  const { data: profile } = useSWR(
    uid && !isExempt ? ['profile:me', uid] : null,
    () => getOwnProfile(uid as string),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  )

  // Tercero: decide redirección
  useEffect(() => {
    if (!isExempt && profile?.must_change_password) {
      router.replace('/cambiar-password?reason=temp')
    }
  }, [isExempt, profile?.must_change_password, router])
}
