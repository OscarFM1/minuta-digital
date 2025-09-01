// src/pages/login.tsx
/**
 * LOGIN — Flujo robusto sin "Verificando sesión…" infinito.
 *
 * Qué cambia:
 *  - Usa el estado global de sesión vía useAuth() (provisto por AuthProvider).
 *  - Si ya estás autenticado, redirige de inmediato (sin onAuthStateChange local).
 *  - El submit hace signInWithPassword y deja que el AuthProvider actualice el estado.
 *  - Respeta metadata first_login y el correo ADMIN para decidir destino.
 *
 * Requisitos:
 *  - Tener configurado AuthProvider en _app.tsx.
 *  - Proteger páginas privadas con <SessionGate requireAuth> (recomendado).
 */

import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import styles from '@/styles/Login.module.css'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'
const LOGIN_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

// Normaliza posibles valores en metadata
const isFirstLogin = (v: any) => v === true || v === 'true' || v === 1 || v === '1'

export default function LoginPage() {
  const router = useRouter()
  const { status, user } = useAuth() // <-- Estado global de sesión
  const [userOrEmail, setUserOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const redirecting = useRef(false) // evita redirecciones múltiples

  // Destino por defecto (permite ?go=/ruta/privada)
  const computeGo = () =>
    typeof router.query.go === 'string' ? router.query.go : '/mis-minutas'

  // 1) Mensaje informativo si viene de ruta protegida
  useEffect(() => {
    if (router.query.unauthorized) {
      setInfo('No tienes permisos para esa sección. Inicia sesión con una cuenta autorizada.')
    }
  }, [router.query.unauthorized])

  // 2) Redirige en cuanto exista sesión validada por el AuthProvider
  useEffect(() => {
    if (redirecting.current) return
    if (status === 'authenticated' && user) {
      const go = computeGo()
      const meta = user.user_metadata
      redirecting.current = true

      if (isFirstLogin(meta?.first_login)) {
        router.replace(`/cambiar-password?go=${encodeURIComponent(go)}`)
        return
      }
      if (user.email === ADMIN_EMAIL) {
        router.replace('/minutas')
        return
      }
      router.replace(go)
    }
    // Si 'unauthenticated', simplemente mostramos el formulario
  }, [status, user, router])

  // 3) Submit de login: dispara signIn; el efecto de arriba hará la redirección
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
      // El AuthProvider actualizará 'status' y 'user' → useEffect redirige
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesión')
      setLoading(false)
    }
  }

  // 4) Si ya hay sesión, mostramos un feedback breve mientras redirige
  if (status === 'authenticated') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
        <small className="mt-2 text-muted">Redirigiendo…</small>
      </div>
    )
  }

  // 5) Si el estado global está cargando (primera carga), evitamos parpadeo
  if (status === 'loading') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" />
        <small className="mt-2 text-muted">Cargando…</small>
      </div>
    )
  }

  // 6) Estado no autenticado → mostrar formulario
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
