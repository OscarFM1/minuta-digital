// src/pages/login.tsx

import { useState, ChangeEvent, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import {
  Card,
  Form,
  Button,
  Alert,
  Spinner
} from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/minutas')
    })
  }, [router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      router.push('/minutas')
    }
  }

  return (
    <>
      <Head>
        <title>Iniciar Sesión – Minuta Digital</title>
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.left}></div>
        <div className={styles.right}>
          <Card className={styles.card}>
            <Card.Body className="p-4">
              <div className={styles.logo}>
                <Image
                  src="/img/logo.png"
                  alt="Logo Empresa"
                  width={180}
                  height={80}
                  quality={100}
                  priority
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <h2 className={styles.title}>Minuta Digital</h2>
              {error && <Alert variant="danger">{error}</Alert>}
              <Form onSubmit={handleSubmit}>
                <Form.Group controlId="email" className="mb-3">
                  <Form.Label className={styles.label}>
                    Correo Electrónico
                  </Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group controlId="password" className="mb-4">
                  <Form.Label className={styles.label}>
                    Contraseña
                  </Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                  />
                </Form.Group>

                <Button
                  variant="primary"
                  type="submit"
                  className={styles.button}
                  disabled={loading}
                >
                  {loading
                    ? (<><Spinner animation="border" size="sm" /> Iniciando…</>)
                    : 'Iniciar Sesión'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </>
  )
}
