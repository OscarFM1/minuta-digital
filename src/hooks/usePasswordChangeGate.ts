/**
 * usePasswordChangeGate.ts
 * -----------------------------------------------------------------------------
 * Redirige a /cambiar-password si profiles.must_change_password === true.
 * - Espera sesión (uid) antes de consultar profiles.
 * - Consulta profiles por PK 'id' (no 'user_id').
 * - Se auto-exime en /cambiar-password, /login y /logout para evitar bucles.
 * - Revalida al ganar/renovar sesión (onAuthStateChange + SWR).
 * - 💡 Redirige con go=<rutaOriginal> para volver donde estaba el usuario.
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

// 2) Lee el perfil del propio usuario (self)
async function getOwnProfile(uid: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, must_change_password')
    .eq('id', uid) // PK es 'id'
    .single()

  // Si hay error (RLS/no existe), devuelve null para no romper la app
  if (error) return null
  return (data as ProfileRow) ?? null
}

export function usePasswordChangeGate() {
  const router = useRouter()
  const pathname = router.pathname

  // Evita bucles en páginas exentas
  const isExempt = useMemo(
    () =>
      pathname.startsWith('/cambiar-password') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/logout'),
    [pathname]
  )

  // Revalida cuando cambia el estado de auth (login/logout/refresh)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      mutate('auth:uid')
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  // 1) Espera uid (sesión)
  const { data: uid } = useSWR(isExempt ? null : 'auth:uid', getAuthUid, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  // 2) Con uid presente, consulta profile
  const { data: profile } = useSWR(
    uid && !isExempt ? ['profile:me', uid] : null,
    () => getOwnProfile(uid as string),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  )

  // 3) Decide redirección → /cambiar-password?go=<rutaOriginal>
  useEffect(() => {
    if (isExempt) return
    if (!profile) return

    if (profile.must_change_password) {
      // Si ya estamos redirigiendo a cambiar-password, no hacer nada
      if (router.pathname.startsWith('/cambiar-password')) return

      // Usa la ruta actual como destino de retorno
      const go = encodeURIComponent(router.asPath || '/minutas/estadisticas')
      router.replace(`/cambiar-password?go=${go}`)
    }
  }, [isExempt, profile, router])
}
