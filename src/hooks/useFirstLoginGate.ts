/**
 * useFirstLoginGate.ts
 * -----------------------------------------------------------------------------
 * Fuerza redirección a /cambiar-password cuando:
 *  1) profiles.must_change_password === true  (contraseña temporal)  ← PRIORIDAD
 *  2) first_login === true (desde user_metadata o profiles.first_login)
 *
 * Mantiene:
 *  - Respeta ?go= (regresa a la intención original).
 *  - Evita bucles en /cambiar-password, /login, /logout.
 *
 * Requisitos:
 *  - RLS en profiles que permita SELECT del propio registro:
 *      USING (auth.uid() = id)
 */

import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

function truthy(v: any) {
  return v === true || v === 'true' || v === 1 || v === '1'
}

export function useFirstLoginGate() {
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    const isExemptRoute =
      router.pathname.startsWith('/cambiar-password') ||
      router.pathname.startsWith('/login') ||
      router.pathname.startsWith('/logout')

    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const uid = session?.user?.id

        if (!mounted || isExemptRoute || !uid) return

        // ---- 1) MUST CHANGE PASSWORD (desde BD) ----
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, must_change_password, first_login')
          .eq('id', uid) // tu PK es "id"
          .single()

        const mustChange = !!prof?.must_change_password

        // ---- 2) FIRST LOGIN (metadata o BD) ----
        const metaFirst =
          truthy(session?.user?.user_metadata?.first_login) ||
          truthy((session?.user as any)?.app_metadata?.first_login)

        const profileFirst = truthy(prof?.first_login)

        const isFirstLogin = !!(metaFirst || profileFirst)

        if (mustChange || isFirstLogin) {
          const go = router.asPath || '/mis-minutas'
          const reason = mustChange ? 'temp' : 'first'
          router.replace(`/cambiar-password?reason=${reason}&go=${encodeURIComponent(go)}`)
        }
      } catch {
        // no-op
      }
    }

    // primera comprobación + recheck al cambiar estado de auth
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [router])
}
