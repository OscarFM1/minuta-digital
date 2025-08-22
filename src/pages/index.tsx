// src/pages/index.tsx
/**
 * Root router: decide a dónde ir según el rol.
 * - Sin sesión -> /login
 * - Admin -> /minutas
 * - Usuario -> /mis-minutas
 */
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

export default function RootRedirect() {
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const email = data?.user?.email
      if (!email) {
        router.replace('/login'); return
      }
      router.replace(email === ADMIN_EMAIL ? '/minutas' : '/mis-minutas')
    })()
  }, [router])

  return <p className="m-3">Redirigiendo…</p>
}
