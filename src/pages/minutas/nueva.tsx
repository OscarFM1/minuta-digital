// src/pages/minutas/nueva.tsx
/**
 * Crear nueva minuta (flujo Start/Stop) — SIN inputs de hora
 * ----------------------------------------------------------------------------
 * - Fecha fija (hoy) no editable en UI.
 * - Crea la minuta con fecha automática + descripción (y opcionales: tarea/novedades).
 * - Tras guardar, redirige a /minutas/[id]#timer para usar exclusivamente Start/Stop.
 */

import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Form, Button, Card, Alert, Spinner, Row, Col } from 'react-bootstrap'
import { createMinute } from '@/lib/minutes'
import ui from '@/styles/NewMinute.module.css'
import styles from '@/styles/Minutas.module.css'
import { supabase } from '@/lib/supabaseClient'

// Helpers de fecha (local, sin zonas raras)
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
function getTodayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function getFriendlyFromISO(iso: string) {
  return iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
}

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

  // ⛔️ Ya no guardamos fecha en estado.
  const todayISO = getTodayISO()
  const friendlyDate = getFriendlyFromISO(todayISO)

  // Estado del form (sin horas)
  const [description, setDescription] = useState<string>('') // título/descr. principal
  const [tarea, setTarea] = useState<string>('')            // opcional
  const [novedades, setNovedades] = useState<string>('')    // opcional
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard por sesión básica (si no hay sesión, rebotamos al login)
  async function ensureSession() {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) { router.replace('/login'); return false }
    return true
  }

  // Submit controlado — SIN horas (las pone Start/Stop en el detalle)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const ok = await ensureSession()
      if (!ok) return

      const row = await createMinute({
        date: todayISO,                 // 👈 fija a hoy (no editable en UI)
        start_time: null,
        end_time: null,
        description: description || null,
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
              <Alert variant="danger" onClose={() => setError(null)} dismissible className="mb-3">
                {error}
              </Alert>
            )}

            <Form onSubmit={onSubmit}>
              <Row className="g-3">
                {/* Fecha (solo informativa, NO editable) */}
                <Col md={4}>
                  <Form.Group controlId="date">
                    <Form.Label>Fecha</Form.Label>
                    <div className="readonlyDate" aria-readonly="true">
                      {friendlyDate}
                    </div>
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

      {/* Estilo para el display de fecha (simula input, pero no es interactivo) */}
      <style jsx>{`
        .readonlyDate {
          display: inline-flex;
          align-items: center;
          width: 100%;
          min-height: 38px;
          padding: 8px 12px;
          border-radius: 0.375rem;
          background: #0c1626; /* consistente con el tema oscuro */
          color: #fff;
          border: 1px solid rgba(255,255,255,0.1);
          user-select: none;
          pointer-events: none; /* no clics ni foco */
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </main>
  )
}
