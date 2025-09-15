// src/pages/minutas/nueva.tsx
/**
 * Crear nueva minuta (flujo Start/Stop) — SIN inputs de hora
 * ----------------------------------------------------------------------------
 * - Fecha fija (hoy) no editable en UI.
 * - Crea la minuta con fecha automática + descripción (y opcionales: tarea/novedades).
 * - Tras guardar, redirige a /minutas/[id]#timer para usar exclusivamente Start/Stop.
 * - ✅ Incluye checklist de comerciales (public.comerciales) y guarda en public.minuta_comercial.
 * - ✅ Reintento automático (23505/40001) al asignar número de minuta.
 * - ✅ ENVÍA Authorization: Bearer <token> al endpoint /api/minutes/create (fix 401).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Form, Button, Card, Alert, Spinner, Row, Col } from 'react-bootstrap'
// import { createMinute } from '@/lib/minutes'   // ⛔️ ya no lo usamos aquí
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

/** Reintenta N veces para conflictos de llave única o serialización */
async function withRetry<T>(fn: () => Promise<T>, times = 3, delayMs = 250): Promise<T> {
  let attempt = 0
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 80)))
  while (true) {
    try {
      return await fn()
    } catch (e: any) {
      const code = e?.code ?? e?.details?.code
      const msg = String(e?.message ?? '')
      const isDupe = code === '23505' || /duplicate key value/i.test(msg)
      const isSerialization = code === '40001'
      if (attempt < times - 1 && (isDupe || isSerialization)) {
        attempt++
        await sleep(delayMs * attempt)
        continue
      }
      throw e
    }
  }
}

type Comercial = { email: string; nombre: string }

export default function NuevaMinutaPage() {
  const router = useRouter()

  const todayISO = getTodayISO()
  const friendlyDate = getFriendlyFromISO(todayISO)

  // Estado del form (sin horas)
  const [description, setDescription] = useState<string>('') // título/descr. principal
  const [tarea, setTarea] = useState<string>('')            // opcional
  const [novedades, setNovedades] = useState<string>('')    // opcional
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Comerciales (checklist)
  const [comerciales, setComerciales] = useState<Comercial[]>([])
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [loadingCom, setLoadingCom] = useState<boolean>(false)
  const [warnAssign, setWarnAssign] = useState<string | null>(null)

  // Guard por sesión básica (si no hay sesión, rebotamos al login)
  async function ensureSession() {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) { router.replace('/login'); return false }
    return true
  }

  // Carga comerciales activos para el checklist
  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingCom(true)
      try {
        const { data, error } = await supabase
          .from('comerciales')
          .select('email,nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true })

        if (error) throw error
        if (!mounted) return
        setComerciales(data ?? [])
      } catch (e) {
        console.error('No se pudieron cargar los comerciales:', e)
        setWarnAssign('No se pudieron cargar los comerciales. Podrás asignarlos más tarde desde el detalle.')
      } finally {
        if (mounted) setLoadingCom(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Maneja selección (evita duplicados con Set)
  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const s = new Set(prev)
      if (s.has(email)) s.delete(email); else s.add(email)
      return Array.from(s)
    })
  }

  /** Llama al API /api/minutes/create con Authorization: Bearer <token> */
  async function createMinuteViaApi(payload: {
    date?: string | null
    description: string | null
    task_done?: string | null
    notes?: string | null
    work_type?: string | null
    is_protected?: boolean
  }) {
    const { data: { session }, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) throw new Error(sessErr.message)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}` // 👈 clave del fix 401
    }

    const resp = await fetch('/api/minutes/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      let detail = 'unknown_error'
      try { detail = (await resp.json())?.error ?? detail } catch {}
      const err = new Error(detail) as any
      if (resp.status === 409) err.code = '23505'
      if (resp.status === 401) err.message = 'not_authenticated'
      throw err
    }
    const { minute } = await resp.json()
    return minute as { id: string }
  }

  // Submit controlado — SIN horas (las pone Start/Stop en el detalle)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setWarnAssign(null)
    setSaving(true)

    try {
      const ok = await ensureSession()
      if (!ok) return

      // 1) Crea la minuta con reintento automático ante 23505/40001
      const row = await withRetry(() => createMinuteViaApi({
        date: todayISO,
        description: description || null,
        task_done: tarea || null,
        notes: novedades || null,
        work_type: null,         // si tienes tipo de trabajo, colócalo aquí
        is_protected: false,
      }), 3, 250)

      // 2) Asigna comerciales (no bloqueante)
      try {
        const emails = Array.from(new Set(selectedEmails)).filter(Boolean)
        if (row?.id && emails.length > 0) {
          const rows = emails.map(email => ({ minuta_id: row.id, comercial_email: email }))
          const { error: relErr } = await supabase.from('minuta_comercial').insert(rows)
          if (relErr) throw relErr
        }
      } catch (e) {
        console.error('Minuta creada pero falló la asignación de comerciales:', e)
        setWarnAssign('La minuta se creó, pero no se pudieron asignar los comerciales. Puedes hacerlo desde el detalle.')
      }

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
            {warnAssign && (
              <Alert variant="warning" onClose={() => setWarnAssign(null)} dismissible className="mb-3">
                {warnAssign}
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

                {/* ✅ Checklist de comerciales */}
                <Col md={12}>
                  <Form.Group controlId="comerciales">
                    <Form.Label>¿Para qué comercial(es) es esta actividad?</Form.Label>
                    <div
                      style={{
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        padding: 10,
                        maxHeight: 220,
                        overflow: 'auto',
                        background: '#0c1626',
                      }}
                    >
                      {loadingCom ? (
                        <div className="d-flex align-items-center gap-2">
                          <Spinner size="sm" animation="border" /> Cargando comerciales…
                        </div>
                      ) : comerciales.length === 0 ? (
                        <div className="text-muted small">No hay comerciales activos.</div>
                      ) : (
                        comerciales.map((c) => (
                          <Form.Check
                            key={c.email}
                            id={`com-${c.email}`}
                            type="checkbox"
                            label={c.nombre}
                            title={c.email}
                            checked={selectedEmails.includes(c.email)}
                            onChange={() => toggleEmail(c.email)}
                            className="mb-1"
                          />
                        ))
                      )}
                    </div>
                    <div className="text-muted small mt-1">
                      Puedes seleccionar uno o varios.
                    </div>
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
          background: #0c1626;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.1);
          user-select: none;
          pointer-events: none;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </main>
  )
}
