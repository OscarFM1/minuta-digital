import { useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabaseClient'

function clearSupabaseAuthKeys() {
  try {
    const keys = Object.keys(window.localStorage || {}).filter(k =>
      /^sb-.*-auth-token/i.test(k)
    )
    for (const k of keys) localStorage.removeItem(k)
  } catch { /* ignore */ }
}

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      try { await supabase.auth.signOut() } catch {}
      clearSupabaseAuthKeys()
      // navegación dura para arrancar la app “limpia”
      window.location.replace('/login')
    })()
  }, [])

  return (
    <>
      <Head><title>Cerrando sesión…</title></Head>
      <p style={{padding: 24}}>Cerrando sesión…</p>
      {/* Fallback si JS estuviera deshabilitado */}
      <noscript>
        <meta httpEquiv="refresh" content="0;url=/login" />
      </noscript>
    </>
  )
}
