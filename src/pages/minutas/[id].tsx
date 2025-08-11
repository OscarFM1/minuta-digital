/**
 * /minutas/[id]
 * Detalle de una minuta (vista protegida)
 *
 * Contiene:
 *  - Navegación explícita al listado por rol (evita router.back()).
 *  - Admin: solo lectura + muestra autor (created_by_*).
 *  - Dueño: puede eliminar y EDITAR horas de inicio/fin.
 *  - Adjuntos con <AttachmentsList minuteId={id} />.
 *
 * Buenas prácticas:
 *  - Estados claros de loading/error.
 *  - Evitar depender del historial del navegador.
 *  - Actualizaciones mínimas y RLS-friendly (solo dueño puede UPDATE/DELETE).
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Spinner,
  Alert,
  Modal,
  Badge,
  Form, // para inputs de hora en edición
} from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'
import AttachmentsList from '@/components/AttachmentsList'

/** Email del administrador (solo lectura) */
const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

/** Tipo de dato de una minuta (incluye user_id para determinar ownership) */
type Minute = {
  id: string
  user_id: string
  date?: string
  start_time?: string
  end_time?: string
  description?: string
  notes?: string
  attachment?: { count: number }[]  // resultado de attachment(count)
  created_by_name?: string | null   // NUEVO: autor visible para admin
  created_by_email?: string | null  // NUEVO: autor visible para admin
}

export default function MinutaDetallePage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }

  /** Estado de sesión/usuario actual */
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  /** Datos de la minuta */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [minuta, setMinuta] = useState<Minute | null>(null)

  /** Modal eliminar */
  const [showDelete, setShowDelete] = useState(false)

  /** Edición de horas (solo dueño) */
  const [editingTimes, setEditingTimes] = useState(false)
  const [startTimeEdit, setStartTimeEdit] = useState<string>('') // HH:mm
  const [endTimeEdit, setEndTimeEdit] = useState<string>('')     // HH:mm
  const [savingTimes, setSavingTimes] = useState(false)

  /** 1) Verificación de sesión (CSR) */
  useEffect(() => {
    let mounted = true
    const check = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.replace('/login')
        return
      }
      if (!mounted) return
      setCurrentEmail(data.user.email ?? null)
      setCurrentUserId(data.user.id ?? null)
      setCheckingAuth(false)
    }
    check()
    return () => { mounted = false }
  }, [router])

  /** 2) Carga de la minuta desde BD (con RLS aplicado) */
  useEffect(() => {
    if (!id) return
    if (checkingAuth) return

    let mounted = true
    const fetchMinute = async () => {
      setLoading(true)
      setError(null)
      try {
        // Selecciona campos clave + autor + count de adjuntos
        const { data, error } = await supabase
          .from('minute')
          .select(`
            id,
            user_id,
            date,
            start_time,
            end_time,
            description,
            notes,
            created_by_name,
            created_by_email,
            attachment(count)
          `)
          .eq('id', id)
          .maybeSingle()

        if (error) throw error

        if (!data) {
          // Puede ser que no exista o RLS la oculte (no dueño)
          setMinuta(null)
          setError('Minuta no encontrada o sin permisos para verla.')
        } else {
          setMinuta(data as Minute)
          // Precargar horas (HH:mm) para edición
          const toHM = (iso?: string) =>
            iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
          setStartTimeEdit(toHM((data as any).start_time))
          setEndTimeEdit(toHM((data as any).end_time))
        }
      } catch (err: any) {
        setError(err.message ?? 'Error al cargar la minuta.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchMinute()
    return () => { mounted = false }
  }, [id, checkingAuth])

  /** 3) Derivados de UI: rol y ownership */
  const isAdmin = useMemo(() => currentEmail === ADMIN_EMAIL, [currentEmail])
  const isOwner = useMemo(() => {
    if (!minuta || !currentUserId) return false
    return minuta.user_id === currentUserId
  }, [minuta, currentUserId])

  /** Navegación consistente por rol (evita router.back()) */
  const goToList = () => router.push(isAdmin ? '/minutas' : '/mis-minutas')

  /** 4) Eliminar (solo dueño) */
  const handleDelete = async () => {
    if (!id) return
    try {
      // RLS: solo permitirá si auth.uid() = minute.user_id
      const { error } = await supabase.from('minute').delete().eq('id', id)
      if (error) throw error
      setShowDelete(false)
      goToList()
    } catch (err: any) {
      setError(err.message ?? 'No se pudo eliminar la minuta.')
      setShowDelete(false)
    }
  }

  /** 5) Guardar edición de horas (solo dueño) */
  const handleSaveTimes = async () => {
    if (!minuta || !minuta.date) return
    if (!startTimeEdit || !endTimeEdit) {
      setError('Debes completar hora inicio y fin.')
      return
    }
    setSavingTimes(true)
    setError(null)
    try {
      // Combinar fecha (YYYY-MM-DD) + HH:mm (local) a string ISO simple
      const startIso = `${minuta.date}T${startTimeEdit}`
      const endIso   = `${minuta.date}T${endTimeEdit}`

      const { error } = await supabase
        .from('minute')
        .update({ start_time: startIso, end_time: endIso })
        .eq('id', minuta.id)

      if (error) throw error

      // Refrescar en UI sin recargar
      setMinuta(prev => prev ? ({ ...prev, start_time: startIso, end_time: endIso }) : prev)
      setEditingTimes(false)
    } catch (e: any) {
      setError(e.message ?? 'No se pudieron guardar las horas.')
    } finally {
      setSavingTimes(false)
    }
  }

  /** 6) Helpers de formato */
  const fechaBonita = useMemo(() => {
    return minuta?.date
      ? new Date(minuta.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—'
  }, [minuta?.date])

  const hora = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'

  /** 7) Render: estados */
  if (checkingAuth) return <p className="mt-4">Verificando sesión…</p>

  if (loading) {
    return (
      <Container className="py-4">
        <Spinner animation="border" size="sm" /> Cargando minuta…
      </Container>
    )
  }

  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="warning">{error}</Alert>
        <Button variant="secondary" onClick={goToList}>Volver</Button>
      </Container>
    )
  }

  if (!minuta) {
    return (
      <Container className="py-4">
        <Alert variant="warning">Minuta no encontrada.</Alert>
        <Button variant="secondary" onClick={goToList}>Volver</Button>
      </Container>
    )
  }

  /** 8) UI principal (detalle) */
  const adjuntos = minuta.attachment?.[0]?.count ?? 0

  // Etiqueta de autor visible solo para admin
  const whoLabel = isAdmin
    ? (minuta.created_by_name || minuta.created_by_email || '—')
    : null

  return (
    <Container className="py-4">
      <Row className="align-items-center mb-3">
        <Col>
          <h1 className="mb-0">Detalle de Minuta</h1>
          <div className="text-muted">
            <small>
              Fecha: <strong>{fechaBonita}</strong>
              {' · '}Hora: {hora(minuta.start_time)}–{hora(minuta.end_time)}
              {whoLabel && (
                <>
                  {' · '}Registró: <strong>{whoLabel}</strong>
                </>
              )}
            </small>
          </div>
        </Col>
        <Col xs="auto" className="d-flex gap-2">
          {/* Dueño: puede editar horas y eliminar */}
          {!isAdmin && isOwner && !editingTimes && (
            <>
              <Button size="sm" variant="outline-primary" onClick={() => setEditingTimes(true)}>
                Editar horas
              </Button>
              <Button size="sm" variant="outline-danger" onClick={() => setShowDelete(true)}>
                Eliminar
              </Button>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={goToList}>
            Volver
          </Button>
        </Col>
      </Row>

      {/* Edición inline de horas (solo dueño) */}
      {!isAdmin && isOwner && editingTimes && (
        <Card className="mb-3">
          <Card.Header>Editar horas</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={3}>
                <Form.Group controlId="startTimeEdit">
                  <Form.Label>Hora inicio</Form.Label>
                  <Form.Control
                    type="time"
                    value={startTimeEdit}
                    onChange={(e) => setStartTimeEdit(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group controlId="endTimeEdit">
                  <Form.Label>Hora fin</Form.Label>
                  <Form.Control
                    type="time"
                    value={endTimeEdit}
                    onChange={(e) => setEndTimeEdit(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md="auto" className="d-flex align-items-end gap-2">
                <Button
                  variant="primary"
                  onClick={handleSaveTimes}
                  disabled={savingTimes}
                >
                  {savingTimes ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => setEditingTimes(false)}
                  disabled={savingTimes}
                >
                  Cancelar
                </Button>
              </Col>
            </Row>
            <small className="text-muted d-block mt-2">
              Solo el propietario puede editar las horas (RLS).
            </small>
          </Card.Body>
        </Card>
      )}

      <Row>
        <Col md={8} className="mb-3">
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Descripción</span>
              <Badge bg="light" text="dark">
                {adjuntos} adjunto{adjuntos === 1 ? '' : 's'}
              </Badge>
            </Card.Header>
            <Card.Body>
              <p className="mb-2"><strong>Tarea realizada</strong></p>
              <p className="mb-3">{minuta.description || '—'}</p>

              <p className="mb-2"><strong>Novedades</strong></p>
              <p className="mb-0">{minuta.notes || '—'}</p>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="mb-3">
          <Card>
            <Card.Header>Adjuntos</Card.Header>
            <Card.Body>
              <AttachmentsList minuteId={minuta.id} />
              {isAdmin && (
                <small className="text-muted d-block mt-2">
                  Vista de solo lectura (admin).
                </small>
              )}
              {!isAdmin && !isOwner && (
                <small className="text-muted d-block mt-2">
                  No eres el propietario de esta minuta.
                </small>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modal de confirmación para eliminar (solo dueño) */}
      <Modal show={showDelete} onHide={() => setShowDelete(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar eliminación</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          ¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete}>Eliminar</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
