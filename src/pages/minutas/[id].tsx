/**
 * /minutas/[id]
 * Detalle de una minuta (vista protegida)
 *
 * Reglas de acceso (UI Guard + RLS):
 *  - Debe existir sesión (Autenticado con Supabase Auth).
 *  - Admin (operaciones@multi...):
 *      → Solo lectura (no edición, no eliminación).
 *      → Debe poder ver TODAS las minutas (asegurar policy SELECT para admin).
 *  - Usuario normal:
 *      → Gracias a RLS, SOLO puede leer minutas donde minute.user_id = auth.uid().
 *      → Si intenta acceder a una que no es suya, el SELECT devolverá vacío.
 *      → Si es dueño: puede eliminar (y más adelante editar).
 *
 * Notas:
 *  - Esta página NO inserta ni actualiza. Solo muestra y permite eliminar si es dueño.
 *  - Para mostrar adjuntos reutilizamos <AttachmentsList minuteId={id} />, que ya genera URLs.
 *  - Si quieres edición, podemos inyectar un <MinuteForm modo="editar" ...> más adelante.
 *
 * Accesibilidad y UX:
 *  - Loading y errores claros.
 *  - Bloqueos por rol con mensajes explícitos.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Container, Row, Col, Card, Button, Spinner, Alert, Modal, Badge } from 'react-bootstrap'
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
        // Traemos la minuta por id; seleccionamos user_id para saber el dueño
        // y el count de attachments para UI.
        const { data, error } = await supabase
          .from('minute')
          .select('id,user_id,date,start_time,end_time,description,notes,attachment(count)')
          .eq('id', id)
          .maybeSingle()

        if (error) throw error

        // Si no hay data: puede ser que no exista o RLS la oculte (no dueño)
        if (!data) {
          setMinuta(null)
          setError('Minuta no encontrada o sin permisos para verla.')
        } else {
          setMinuta(data as Minute)
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

  /** ✅ Helper de navegación consistente por rol (evita router.back()) */
  const goToList = () => router.push(isAdmin ? '/minutas' : '/mis-minutas') // ✅ CAMBIO

  /** 4) Eliminar (solo dueño) */
  const handleDelete = async () => {
    if (!id) return
    try {
      // RLS: solo permitirá si auth.uid() = minute.user_id
      const { error } = await supabase.from('minute').delete().eq('id', id)
      if (error) throw error
      setShowDelete(false)
      // Redirige al listado correcto tras eliminar
      goToList() // ✅ CAMBIO
    } catch (err: any) {
      setError(err.message ?? 'No se pudo eliminar la minuta.')
      setShowDelete(false)
    }
  }

  /** 5) Formatos bonitos para fecha/hora */
  const fechaBonita = useMemo(() => {
    return minuta?.date
      ? new Date(minuta.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—'
  }, [minuta?.date])

  const hora = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'

  /** 6) Render: estados */
  if (checkingAuth) {
    return <p className="mt-4">Verificando sesión…</p>
  }

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
        <Button variant="secondary" onClick={goToList}>Volver</Button> {/* ✅ CAMBIO */}
      </Container>
    )
  }

  if (!minuta) {
    return (
      <Container className="py-4">
        <Alert variant="warning">Minuta no encontrada.</Alert>
        <Button variant="secondary" onClick={goToList}>Volver</Button> {/* ✅ CAMBIO */}
      </Container>
    )
  }

  /** 7) UI principal (detalle) */
  const adjuntos = minuta.attachment?.[0]?.count ?? 0

  return (
    <Container className="py-4">
      <Row className="align-items-center mb-3">
        <Col>
          <h1 className="mb-0">Detalle de Minuta</h1>
          <div className="text-muted">
            <small>
              Fecha: <strong>{fechaBonita}</strong> · Hora: {hora(minuta.start_time)}–{hora(minuta.end_time)}
            </small>
          </div>
        </Col>
        <Col xs="auto" className="d-flex gap-2">
          {/* Admin: solo lectura -> NO mostrar eliminar/editar */}
          {/* Dueño: puede eliminar (y luego podremos habilitar edición) */}
          {!isAdmin && isOwner && (
            <>
              {/* (Opcional) botón de edición futuro:
              <Button size="sm" variant="outline-primary" onClick={() => router.push(`/minutas/editar/${minuta.id}`)}>
                Editar
              </Button> */}
              <Button size="sm" variant="outline-danger" onClick={() => setShowDelete(true)}>
                Eliminar
              </Button>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={goToList}>
            Volver
          </Button> {/* ✅ CAMBIO */}
        </Col>
      </Row>

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
              {/* Lista real de evidencias usando componente existente */}
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
