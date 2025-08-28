// src/pages/minutas/nueva.tsx
/**
 * Crear nueva minuta (flujo Start/Stop) — SUBMIT CONTROLADO EN LA PÁGINA
 * ----------------------------------------------------------------------------
 * Cambios clave:
 * - Dejamos de delegar el submit a <MinuteForm/> para evitar que envíe
 *   `folio` o `folio_serial`. Esta página llama a createMinute(...) de
 *   src/lib/minutes.ts, que NO envía esos campos y maneja retry en 23505.
 * - Al guardar, redirige a /minutas/[id]#timer (aterriza en el cronómetro).
 * - UI minimal con Bootstrap; puedes reemplazar inputs por tus componentes.
 */

import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Form, Button, Card, Alert, Spinner, Row, Col } from 'react-bootstrap'
import { createMinute } from '@/lib/minutes' // API controlada (sin folio/serial)
import ui from '@/styles/NewMinute.module.css'
import styles from '@/styles/Minutas.module.css'
import { supabase } from '@/lib/supabaseClient'

// Placeholder especializado para preprensa
const TITLE_PLACEHOLDER =
  'Ej.:  Imposición, sangrías y trapping para etiqueta 10×15 cm'

// Utilidad UX: mapea errores técnicos a mensajes amigables
function toFriendlyMessage(err: unknown): string {
  const e = err as any
  const code = e?.code ?? e?.details?.code
  const msg = String(e?.message ?? '')
  if (code === '23505' || /duplicate key value violates unique constraint/i.test(msg)) {
    return 'Se está asignando el número de minuta. Intenta nuevamente.'
  }
  return e?.message ?? e?.error_description ?? 'Ocurrió un error. Intenta más tarde.'
}

export default function NuevaMinutaPage() {
  const router = useRouter()

  // Estado del form controlado
  const [date, setDate] = useState<string>(() => {
    const d = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  const [start, setStart] = useState<string>('')          // HH:mm (opcional)
  const [end, setEnd] = useState<string>('')              // HH:mm (opcional)
  const [description, setDescription] = useState<string>('') // título/descr. principal
  const [tarea, setTarea] = useState<string>('')          // opcional
  const [novedades, setNovedades] = useState<string>('')  // opcional
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard por sesión básica (si no hay sesión, rebotamos al login)
  async function ensureSession() {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) {
      router.replace('/login')
      return false
    }
    return true
  }

  // Submit controlado — NO envía folio/folio_serial (los pone la BD con trigger)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const ok = await ensureSession()
      if (!ok) return

      const row = await createMinute({
        date,
        start_time: start || null,
        end_time: end || null,
        description: description || null, // la API sólo la envía si existe la columna
        tarea_realizada: tarea || null,
        novedades: novedades || null,
        is_protected: false,
      })

      // ✅ Redirige al detalle aterrizando en el bloque del cronómetro (Start)
      router.replace(`/minutas/${row.id}#timer`)
    } catch (err) {
      setError(toFriendlyMessage(err))
      setSaving(false)
    }
  }

  return (
    <main className={ui.page}>
      <Head><title>Nueva minuta</title></Head>

      <div className={ui.wrapper}>
        {/* Header */}
        <div className={ui.headerTop}>
          <button
            type="button"
            className={ui.back}
            onClick={() => router.back()}
            aria-label="Volver"
          >
            ← Volver
          </button>
        </div>

        <h1 className={`${styles.newMinuteTitle} mb-3`}>Nueva minuta</h1>

        {/* Tarjeta del formulario */}
        <Card className={ui.card}>
          <Card.Body>
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
                className="mb-3"
              >
                {error}
              </Alert>
            )}

            <Form onSubmit={onSubmit}>
              <Row className="g-3">
                <Col md={4}>
                  <Form.Group controlId="date">
                    <Form.Label>Fecha</Form.Label>
                    <Form.Control
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group controlId="start_time">
                    <Form.Label>Hora inicio</Form.Label>
                    <Form.Control
                      type="time"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      placeholder="08:00"
                    />
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group controlId="end_time">
                    <Form.Label>Hora fin</Form.Label>
                    <Form.Control
                      type="time"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      placeholder="12:00"
                    />
                  </Form.Group>
                </Col>

                <Col md={12}>
                  <Form.Group controlId="description">
                    <Form.Label>Descripción / Título</Form.Label>
                    <Form.Control
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={TITLE_PLACEHOLDER}
                    />
                  </Form.Group>
                </Col>

                <Col md={12}>
                  <Form.Group controlId="tarea_realizada">
                    <Form.Label>Tarea realizada (opcional)</Form.Label>
                    <Form.Control
                      type="text"
                      value={tarea}
                      onChange={(e) => setTarea(e.target.value)}
                      placeholder="Breve resumen de la tarea"
                    />
                  </Form.Group>
                </Col>

                <Col md={12}>
                  <Form.Group controlId="novedades">
                    <Form.Label>Novedades / Observaciones (opcional)</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={novedades}
                      onChange={(e) => setNovedades(e.target.value)}
                      placeholder="Anota novedades, incidencias o notas del trabajo"
                    />
                  </Form.Group>
                </Col>

                <Col xs="auto" className="mt-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? (<><Spinner size="sm" animation="border" /> Guardando…</>) : 'Crear minuta'}
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card.Body>
        </Card>
      </div>
    </main>
  )
}
