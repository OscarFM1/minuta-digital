// src/pages/login.tsx
import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Login.module.css'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'
const LOGIN_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

// Normaliza posibles valores en metadata
const isFirstLogin = (v: any) => v === true || v === 'true' || v === 1 || v === '1'

export default function LoginPage() {
  const router = useRouter()
  const [userOrEmail, setUserOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const redirecting = useRef(false) // previene que el loading quede colgado

  // Destino por defecto
  const computeGo = () =>
    typeof router.query.go === 'string' ? router.query.go : '/mis-minutas'

  // Redirección robusta (navegación dura)
  const hardRedirect = (url: string) => {
    redirecting.current = true
    window.location.replace(url)
  }

  // 1) Mensaje informativo si viene de ruta protegida
  useEffect(() => {
    if (router.query.unauthorized) {
      setInfo('No tienes permisos para esa sección. Inicia sesión con una cuenta autorizada.')
    }
  }, [router.query.unauthorized])

  // 2) Si ya hay sesión al montar la página, redirige
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!alive) return
      const user = data?.user
      if (!user) return

      const go = computeGo()
      const meta = user.user_metadata
      if (isFirstLogin(meta?.first_login)) hardRedirect(`/cambiar-password?go=${encodeURIComponent(go)}`)
      else if (user.email === ADMIN_EMAIL) hardRedirect('/minutas')
      else hardRedirect(go)
    })()
    return () => { alive = false }
  }, [router])

  // 3) Suscripción: cuando Supabase diga SIGNED_IN → redirige
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_IN' && session?.user && !redirecting.current) {
        const go = computeGo()
        const user = session.user
        const meta = user.user_metadata
        if (isFirstLogin(meta?.first_login)) hardRedirect(`/cambiar-password?go=${encodeURIComponent(go)}`)
        else if (user.email === ADMIN_EMAIL) hardRedirect('/minutas')
        else hardRedirect(go)
      }
      if (_event === 'SIGNED_OUT' && !redirecting.current) {
        hardRedirect('/login')
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, []) // una sola vez

  // 4) Submit de login: solo disparamos signIn; la redirección la hace el listener
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      const email = userOrEmail.includes('@')
        ? userOrEmail.trim()
        : `${userOrEmail.trim()}@${LOGIN_DOMAIN}`

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Fallback: si en 3s no redirigió (por cualquier motivo), liberamos loading
      setTimeout(() => {
        if (!redirecting.current) setLoading(false)
      }, 3000)
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesión')
      setLoading(false)
    }
  }

  return (
    <>
      <Head><title>Iniciar Sesión – Minuta Digital</title></Head>
      <div className={styles.wrapper}>
        <div className={styles.left} />
        <div className={styles.right}>
          <Card className={styles.card}>
            <div className={styles.cardHeader} />
            <Card.Body className="p-4">
              <div className={styles.logo}>
                <Image
                  src="/img/logo.png"
                  alt="Logo Empresa"
                  width={240}
                  height={100}
                  quality={100}
                  priority
                  style={{ objectFit: 'contain' }}
                />
              </div>

              <h2 className={styles.title}>Minuta Digital</h2>
              {info && <Alert variant="info">{info}</Alert>}
              {error && <Alert variant="danger">{error}</Alert>}

              <Form onSubmit={handleSubmit}>
                <Form.Group controlId="user" className="mb-3">
                  <Form.Label className={styles.label}>Usuario</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="ej.: kat.acosta"
                    value={userOrEmail}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setUserOrEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    required
                  />
                </Form.Group>

                <Form.Group controlId="password" className="mb-4">
                  <Form.Label className={styles.label}>Contraseña</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setPassword(e.target.value)
                      if (error) setError(null)
                    }}
                    required
                  />
                </Form.Group>

                <Button type="submit" className={styles.button} disabled={loading}>
                  {loading ? (<><Spinner animation="border" size="sm" /> Iniciando…</>) : 'Entrar'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  )
}
