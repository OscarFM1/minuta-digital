// src/components/MinuteForm.tsx

import { useState, ChangeEvent, FormEvent } from 'react'
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

/** 
 * Estructura de los valores del formulario.
 */
interface FormValues {
  date: string
  startTime: string
  endTime: string
  description: string
  notes?: string
  files: FileList | null
}

/**
 * MinuteForm
 * 
 * Formulario para:
 * - Registrar fecha y horas de trabajo.
 * - Describir la tarea y novedades.
 * - Subir evidencias (archivos).
 * 
 * Al enviar:
 * 1. Inserta en la tabla `minute`.
 * 2. Sube archivos a Supabase Storage.
 * 3. Registra metadatos en la tabla `attachment`.
 */
export function MinuteForm() {
  const [values, setValues] = useState<FormValues>({
    date: dayjs().format('YYYY-MM-DD'),
    startTime: dayjs().format('HH:mm'),
    endTime: dayjs().format('HH:mm'),
    description: '',
    notes: '',
    files: null,
  })
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  /** Actualiza campos de texto, fecha y hora */
  const handleChange = (e: ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
  }

  /** Captura los archivos seleccionados */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues(prev => ({ ...prev, files: e.target.files }))
  }

  /** Envía datos y archivos a Supabase */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!values.files || values.files.length === 0) {
      setError('Por favor sube al menos un archivo de evidencia.')
      return
    }

    setLoading(true)
    try {
      // 1) Inserta la minuta
      const { data: minute, error: minErr } = await supabase
        .from('minute')
        .insert({
          date: values.date,
          start_time: values.startTime,
          end_time: values.endTime,
          description: values.description,
          notes: values.notes || null,
        })
        .select('id')
        .single()
      if (minErr || !minute) throw minErr || new Error('No se creó la minuta')

      const minuteId = minute.id as string

      // 2) Sube cada archivo y registra metadato
      await Promise.all(
        Array.from(values.files).map(async file => {
          const path = `${minuteId}/${file.name}`
          const { error: uploadErr } = await supabase
            .storage
            .from('attachments')
            .upload(path, file)
          if (uploadErr) throw uploadErr

          await supabase
            .from('attachment')
            .insert({
              minute_id: minuteId,
              url: path,
              filename: file.name,
            })
        })
      )

      setSuccess(true)
      setValues(prev => ({ ...prev, description: '', notes: '', files: null }))
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Error al guardar la minuta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="my-4">
      <h3>Registrar Minuta</h3>

      {error   && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">Minuta guardada correctamente.</Alert>}

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

        <Form.Group controlId="description" className="mt-3">
          <Form.Label>Descripción de la tarea</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            name="description"
            value={values.description}
            onChange={handleChange}
            placeholder="Describe lo que hiciste..."
            required
          />
        </Form.Group>

        <Form.Group controlId="notes" className="mt-3">
          <Form.Label>Novedades (opcional)</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            name="notes"
            value={values.notes}
            onChange={handleChange}
            placeholder="Comentarios adicionales"
          />
        </Form.Group>

        <Form.Group controlId="files" className="mt-3">
          <Form.Label>Evidencias (archivos)</Form.Label>
          <Form.Control
            type="file"
            multiple
            onChange={handleFileChange}
            required
          />
        </Form.Group>

        <Button
          variant="primary"
          type="submit"
          className="mt-4"
          disabled={loading}
        >
          {loading
            ? (<><Spinner animation="border" size="sm" /> Guardando…</>)
            : 'Guardar Minuta'}
        </Button>
      </Form>
    </Container>
  )
}
