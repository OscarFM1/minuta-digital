// src/pages/login.tsx
import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Login.module.css' // ajusta si tu CSS es distinto

export default function LoginPage() {
  const router = useRouter()
  const next =
    (typeof router.query.next === 'string' && router.query.next.trim()) ||
    '/mis-minutas' // 👈 fallback por defecto

  const changed = router.query.changed === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 🔒 Si YA hay sesión, salir del login hacia `next`
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const hasSession = !!data.session?.user
      if (hasSession) {
        // Cortacircuito por si algún gate quiere re-intervenir una vez
        try { sessionStorage.setItem('pwdChanged', '1') } catch {}
        router.replace(next)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        try { sessionStorage.setItem('pwdChanged', '1') } catch {}
        router.replace(next)
      }
    })
    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // 👇 Señal para que cualquier gate salte una vez
      try { sessionStorage.setItem('pwdChanged', '1') } catch {}

      // Redirección inmediata
      router.replace(next)
    } catch (e: any) {
      setErr(e?.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head><title>Iniciar sesión</title></Head>
      <div className={styles.loginContainer}>
        <div className={styles.loginCard} role="region" aria-label="Inicio de sesión">
          <h1 className={styles.loginTitle}>Iniciar sesión</h1>

          {changed && (
            <div className={styles.loginInfo} role="status">
              Tu contraseña se cambió correctamente. Ingresa de nuevo.
            </div>
          )}
          {err && <div className={styles.loginError} role="alert">{err}</div>}

          <form className={styles.loginForm} onSubmit={onSubmit}>
            <label className={styles.loginLabel}>
              <span>Email</span>
              <input
                type="email"
                className={styles.loginInput}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="username"
                required
              />
            </label>

            <label className={styles.loginLabel}>
              <span>Contraseña</span>
              <input
                type="password"
                className={styles.loginInput}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                required
              />
            </label>

            <div className={styles.loginActions}>
              <button type="submit" className={styles.loginButton} disabled={loading} aria-busy={loading}>
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
