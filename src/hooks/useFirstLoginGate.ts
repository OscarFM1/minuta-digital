/**
 * useFirstLoginGate.ts
 * -----------------------------------------------------------------------------
 * Fuerza redirección a /cambiar-password SOLO para PRIMER INICIO:
 *  - Fuente principal: profiles.first_login === true
 *  - Fallback: user_metadata.first_login si no existe fila en profiles
 *
 * NO revisa must_change_password (eso es de usePasswordChangeGate).
 * Evita bucles en /cambiar-password, /login y /logout.
 * Cortacircuito: salta UNA vez si detecta /login?changed=1 o sessionStorage.pwdChanged="1".
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

    // a) Si venimos del login con changed=1, saltar una vez
    const skipFromLoginOnce =
      router.pathname.startsWith('/login') &&
      typeof router.query.changed === 'string' &&
      router.query.changed === '1'

    // b) Cortacircuito en memoria de sesión (lo limpia al usarlo)
    const shouldSkipBySessionFlag = () => {
      try {
        if (sessionStorage.getItem('pwdChanged') === '1') {
          sessionStorage.removeItem('pwdChanged')
          return true
        }
      } catch {
        /* ignore */
      }
      return false
    }

    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const uid = session?.user?.id

        if (!mounted || isExemptRoute || !uid) return
        if (skipFromLoginOnce || shouldSkipBySessionFlag()) return

        // ---- FUENTE ÚNICA: profiles.first_login ----
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, first_login')
          .eq('id', uid) // PK = id
          .single()

        // Preferimos profiles; si no existe fila, miramos metadata como fallback
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

    // Primera comprobación + recheck al cambiar estado de auth
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [router])
}
