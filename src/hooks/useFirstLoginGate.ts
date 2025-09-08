/**
 * useFirstLoginGate.ts
 * -----------------------------------------------------------------------------
 * Fuerza redirección a /cambiar-password SOLO cuando es PRIMER INICIO:
 *  - fuente única: profiles.first_login === true
 *  - (fallback opcional) user_metadata.first_login si no hay fila en profiles
 *
 * NO revisa must_change_password (eso es de usePasswordChangeGate).
 * Respeta ?go= y evita bucles en /cambiar-password, /login, /logout.
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

    // Si venimos del login con changed=1 (acaba de cambiar la clave),
    // saltar una vez para evitar re-gate por caches.
    const skipOnce =
      router.pathname.startsWith('/login') &&
      typeof router.query.changed === 'string' &&
      router.query.changed === '1'

    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const uid = session?.user?.id

        if (!mounted || isExemptRoute || skipOnce || !uid) return

        // ---- FUENTE ÚNICA: profiles.first_login ----
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, first_login')
          .eq('id', uid)   // PK = id
          .single()

        // Preferimos profiles; solo si no hay fila, miramos metadata como fallback
        const profileFirst = truthy(prof?.first_login)
        const metaFirst = !prof ? truthy(session?.user?.user_metadata?.first_login) : false

        const isFirstLogin = profileFirst || metaFirst

        if (isFirstLogin) {
          const go = router.asPath || '/mis-minutas'
          router.replace(`/cambiar-password?reason=first&go=${encodeURIComponent(go)}`)
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
