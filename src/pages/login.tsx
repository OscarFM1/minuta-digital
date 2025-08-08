// src/pages/login.tsx

import { useState, ChangeEvent, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Spinner
} from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'

/**
 * LoginPage
 *
 * Muestra un formulario de login centrado en pantalla.
 * - Email + contraseña
 * - Llama a supabase.auth.signIn
 * - Redirige a /minutas tras el login exitoso
 */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Si ya hay sesión, redirige directo
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/minutas')
    })
  }, [router])

  /** Maneja el submit del formulario */
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
      <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '80vh' }}>
        <Row className="w-100 justify-content-center">
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card className="shadow-sm">
              <Card.Body>
                <h3 className="mb-4 text-center">Iniciar Sesión</h3>
                {error && <Alert variant="danger">{error}</Alert>}
                <Form onSubmit={handleSubmit}>
                  <Form.Group controlId="email" className="mb-3">
                    <Form.Label>Correo electrónico</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={email}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      required
                    />
                  </Form.Group>
                  <Form.Group controlId="password" className="mb-4">
                    <Form.Label>Contraseña</Form.Label>
                    <Form.Control
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      required
                    />
                  </Form.Group>
                  <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                    {loading
                      ? (<><Spinner animation="border" size="sm" /> Iniciando…</>)
                      : 'Entrar'}
                  </Button>
                </Form>
              </Card.Body>
              <Card.Footer className="text-center">
                ¿No tienes cuenta? <a href="/signup">Regístrate</a>
              </Card.Footer>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  )
}
