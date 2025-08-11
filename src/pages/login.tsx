// src/pages/login.tsx
import { useState, ChangeEvent, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Login.module.css'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Si viene de una ruta protegida sin permisos, mostramos aviso
  useEffect(() => {
    if (router.query.unauthorized) {
      setInfo('No tienes permisos para esa sección. Inicia sesión con una cuenta autorizada.')
    }
  }, [router.query.unauthorized])

  // Si ya hay sesión, redirige según email (evita loops)
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser()
      const userEmail = data?.user?.email
      if (!userEmail) return
      if (userEmail === ADMIN_EMAIL) {
        router.replace('/minutas')
      } else {
        router.replace('/mis-minutas')
      }
    }
    checkSession()
  }, [router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const userEmail = data.user?.email
      if (userEmail === ADMIN_EMAIL) {
        router.push('/minutas')
      } else {
        router.push('/mis-minutas')
      }
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Iniciar Sesión – Minuta Digital</title>
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.left} />
        <div className={styles.right}>
          <Card className={styles.card}>
            {/* Header en blanco */}
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
                <Form.Group controlId="email" className="mb-3">
                  <Form.Label className={styles.label}>Correo Electrónico</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setEmail(e.target.value)
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
                  {loading ? (<><Spinner animation="border" size="sm" /> Iniciando…</>) : 'Iniciar Sesión'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  )
}
