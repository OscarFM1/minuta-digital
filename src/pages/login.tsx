// src/pages/login.tsx
/**
 * LOGIN — Flujo robusto sin "Verificando sesión…" infinito.
 * Redirección por ROL y respeto a must_change_password (profiles).
 * - worker  -> /mis-minutas
 * - admin/* -> /minutas
 * - Si ?next o ?go son compatibles con el rol, se respetan.
 */
import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import styles from '@/styles/Login.module.css'

const LOGIN_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers locales de destino por rol (sin crear archivos extra)             */
/* ────────────────────────────────────────────────────────────────────────── */
type UserRole = 'worker' | 'admin' | 'super_admin'
const normalizeRole = (r?: string | null): UserRole =>
  r === 'admin' || r === 'super_admin' ? (r as UserRole) : 'worker'
const homeForRole = (role?: string | null) =>
  normalizeRole(role) === 'worker' ? '/mis-minutas' : '/minutas'
const resolvePostAuthDestination = (role?: string | null, go?: string | null) => {
  const safe = homeForRole(role)
  if (!go) return safe
  try {
    const u = new URL(go, 'https://dummy.local')
    const path = u.pathname + (u.search ?? '')
    const isWorker = normalizeRole(role) === 'worker'
    const okWorker = path === '/' || path === '/mis-minutas' || path.startsWith('/cambiar-password')
    const okAdmin  = path === '/' || path.startsWith('/minutas') || path.startsWith('/cambiar-password')
    return (isWorker ? okWorker : okAdmin) ? path : safe
  } catch {
    return safe
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { status, user } = useAuth()
  const [userOrEmail, setUserOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const redirecting = useRef(false)

  // Acepta ?next y ?go (prioridad a next)
  const computeGo = () => {
    const q = router.query
    const next =
      typeof q.next === 'string' && q.next.trim().length > 0 ? q.next.trim() : null
    const go =
      typeof q.go === 'string' && q.go.trim().length > 0 ? q.go.trim() : null
    return next || go || null
  }

  useEffect(() => {
    if (router.query.unauthorized) {
      setInfo('No tienes permisos para esa sección. Inicia sesión con una cuenta autorizada.')
    }
  }, [router.query.unauthorized])

  // Si ya estás autenticado, decide destino por rol y must_change_password
  useEffect(() => {
    if (redirecting.current) return
    if (status === 'authenticated' && user) {
      redirecting.current = true
      ;(async () => {
        // Perfil actual
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, must_change_password')
          .eq('id', user.id)
          .single()

        const go = computeGo()

        // Gate de password por profiles.must_change_password
        if (profile?.must_change_password === true) {
          router.replace(`/cambiar-password?go=${encodeURIComponent(go ?? homeForRole(profile?.role))}`)
          return
        }

        // Destino por rol
        const next = resolvePostAuthDestination(profile?.role, go)
        router.replace(next)
      })()
    }
  }, [status, user, router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      const email = userOrEmail.includes('@')
        ? userOrEmail.trim()
        : `${userOrEmail.trim()}@${LOGIN_DOMAIN}`

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Cortacircuito temporal (evita re-disparo del gate en la navegación inmediata)
      try { sessionStorage.setItem('pwdChanged', '1') } catch {}

      // Leer perfil justo después del login
      const uid = data.user?.id
      let role: UserRole = 'worker'
      let mustChange = false
      if (uid) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, must_change_password')
          .eq('id', uid)
          .single()
        role = normalizeRole(profile?.role)
        mustChange = profile?.must_change_password === true
      }

      const go = computeGo()

      // Si debe cambiar contraseña → enviar al gate con ?go
      if (mustChange) {
        router.replace(`/cambiar-password?go=${encodeURIComponent(go ?? homeForRole(role))}`)
        return
      }

      // Si no, enviar al destino por rol (respetando ?next/?go válidos)
      const next = resolvePostAuthDestination(role, go)
      router.replace(next)
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesión')
      setLoading(false)
    }
  }

  if (status === 'authenticated') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
        <small className="mt-2 text-muted">Redirigiendo…</small>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
        <small className="mt-2 text-muted">Cargando…</small>
      </div>
    )
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
                    autoComplete="username"
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
                    autoComplete="current-password"
                    minLength={8}
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
