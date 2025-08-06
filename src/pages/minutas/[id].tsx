// src/pages/minutas/[id].tsx

import { useState, useEffect, ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import type { NextPage } from 'next'
import {
  Container,
  Form,
  Button,
  Row,
  Col,
  Alert,
  Spinner
} from 'react-bootstrap'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabaseClient'

/** Estructura de una minuta según la base de datos */
interface Minuta {
  id: string
  date: string
  start_time: string
  end_time: string
  description: string
  notes?: string | null
}

const EditMinutePage: NextPage = () => {
  const router = useRouter()
  const { id } = router.query as { id: string }

  const [values, setValues] = useState({
    date:        dayjs().format('YYYY-MM-DD'),
    startTime:   dayjs().format('HH:mm'),
    endTime:     dayjs().format('HH:mm'),
    description: '',
    notes:       '',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // 1) Cargar los datos de la minuta al montar el componente
  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data, error } = await supabase
        .from('minute')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        setError(error.message)
      } else if (data) {
        const m = data as Minuta
        setValues({
          date:        m.date,
          startTime:   m.start_time.slice(11, 16),
          endTime:     m.end_time.slice(11, 16),
          description: m.description,
          notes:       m.notes || '',
        })
      }
      setLoading(false)
    })()
  }, [id])

  /** Maneja cambios en los inputs */
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
  }

  /** Envía la actualización a Supabase */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)

    try {
      const startTimestamp = `${values.date}T${values.startTime}`
      const endTimestamp   = `${values.date}T${values.endTime}`

      const { error } = await supabase
        .from('minute')
        .update({
          date:        values.date,
          start_time:  startTimestamp,
          end_time:    endTimestamp,
          description: values.description,
          notes:       values.notes || null,
        })
        .eq('id', id)

      if (error) throw error
      setSuccess(true)
      setTimeout(() => router.push('/minutas'), 1000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Container className="text-center my-5">
        <Spinner animation="border" />
      </Container>
    )
  }

  return (
    <>
      <Head>
        <title>Editar Minuta</title>
      </Head>
      <Container className="my-4">
        <h3>Editar Minuta</h3>
        {error   && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">Minuta actualizada!</Alert>}

        <Form onSubmit={handleSubmit}>
          <Row>
            <Col md={4}>
              <Form.Group controlId="date">
                <Form.Label>Fecha</Form.Label>
                <Form.Control
                  type="date"
                  name="date"
                  value={values.date}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="startTime">
                <Form.Label>Hora inicio</Form.Label>
                <Form.Control
                  type="time"
                  name="startTime"
                  value={values.startTime}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group controlId="endTime">
                <Form.Label>Hora fin</Form.Label>
                <Form.Control
                  type="time"
                  name="endTime"
                  value={values.endTime}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mt-3" controlId="description">
            <Form.Label>Descripción</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="description"
              value={values.description}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mt-3" controlId="notes">
            <Form.Label>Novedades (opcional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              name="notes"
              value={values.notes}
              onChange={handleChange}
            />
          </Form.Group>

          <Button
            variant="primary"
            type="submit"
            className="mt-4"
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Actualizar Minuta'}
          </Button>
        </Form>
      </Container>
    </>
  )
}

export default EditMinutePage
