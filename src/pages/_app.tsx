// src/pages/_app.tsx

import '@/styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    // 1) Al cargar, comprueba si hay sesión activa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && router.pathname !== '/login') {
        router.replace('/login')
      }
      if (session && router.pathname === '/login') {
        router.replace('/minutas')
      }
    })

    // 2) Escucha cambios de auth (login/logout)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/login')
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [router])

  return <Component {...pageProps} />
}
