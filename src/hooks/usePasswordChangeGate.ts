/**
 * usePasswordChangeGate.ts
 * -----------------------------------------------------------------------------
 * Gatea SOLO por profiles.must_change_password === true.
 * - Se auto-exime en /cambiar-password, /login y /logout.
 * - Salta UNA VEZ si detecta:
 *     a) ?changed=1 en /login (primer render post-cambio), o
 *     b) sessionStorage.pwdChanged === '1' (cortacircuito de cliente).
 */

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import useSWR, { mutate } from 'swr'
import { supabase } from '@/lib/supabaseClient'

type ProfileRow = { id: string; must_change_password: boolean | null }

async function getAuthUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

async function getOwnProfile(uid: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, must_change_password')
    .eq('id', uid)
    .single()
  if (error) return null
  return data as ProfileRow
}

export function usePasswordChangeGate() {
  const router = useRouter()
  const pathname = router.pathname

  const isExempt = useMemo(
    () =>
      pathname.startsWith('/cambiar-password') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/logout'),
    [pathname]
  )

  // Saltar una vez si venimos del login con changed=1
  const skipFromLoginOnce =
    pathname.startsWith('/login') &&
    typeof router.query.changed === 'string' &&
    router.query.changed === '1'

  // Cortacircuito en memoria de sesión (se limpia al usarlo)
  const shouldSkipBySessionFlag = () => {
    try {
      if (sessionStorage.getItem('pwdChanged') === '1') {
        sessionStorage.removeItem('pwdChanged')
        return true
      }
    } catch {/* ignore */}
    return false
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      mutate('auth:uid')
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  const { data: uid } = useSWR(isExempt ? null : 'auth:uid', getAuthUid, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  const { data: profile } = useSWR(
    uid && !isExempt ? ['profile:me', uid] : null,
    () => getOwnProfile(uid as string),
    { revalidateOnFocus: true, revalidateOnReconnect: true }
  )

  useEffect(() => {
    if (isExempt) return
    if (!profile) return

    // Salto por primer render post-cambio (query) o por flag de sesión
    if (skipFromLoginOnce || shouldSkipBySessionFlag()) return

    if (profile.must_change_password) {
      if (router.pathname.startsWith('/cambiar-password')) return
      const go = encodeURIComponent(router.asPath || '/minutas/estadisticas')
      router.replace(`/cambiar-password?go=${go}`)
    }
  }, [isExempt, profile, router, skipFromLoginOnce])
}
