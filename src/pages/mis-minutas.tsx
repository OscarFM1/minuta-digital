/**
 * /mis-minutas
 * Listado de minutas del USUARIO ACTUAL (propietario).
 * - RLS limita a las minutas del usuario, no hace falta filtrar por user_id en el cliente.
 * - Modo de tarjeta: "edit" (muestra Editar/Eliminar).
 * - onView / onEdit navegan al detalle; eliminación con confirmación.
 * - Si es admin, se redirige a /minutas (all-read).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Container, Row, Col, Button, Modal, Alert, Spinner } from 'react-bootstrap'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabaseClient'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import MinutesFilter from '@/components/MinutesFilter'
import styles from '@/styles/Minutas.module.css'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

type Filters = {
  desde?: string
  hasta?: string
}

type MinuteRow = {
  id: string
  user_id: string
  date?: string
  start_time?: string
  end_time?: string
  description?: string
  notes?: string | null
  attachment?: { count: number }[]
}

/** Fetch de minutas del usuario (RLS aplica en el backend) */
const fetchMyMinutes = async (filters: Filters): Promise<MinuteCardData[]> => {
  let query = supabase
    .from('minute')
    .select('id,user_id,date,start_time,end_time,description,notes,attachment(count)')
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)

  const { data, error } = await query
  if (error) throw error

  return (data as MinuteRow[]).map((m) => ({
    id: m.id,
    date: m.date,
    start_time: m.start_time,
    end_time: m.end_time,
    description: m.description,
    notes: m.notes ?? undefined,
    adjuntos: m.attachment?.[0]?.count ?? 0,
    // útil si más adelante validas ownership en el cliente
    // (aunque en esta vista todas son del usuario por RLS)
    user_id: m.user_id as any, // (no la usa MinuteCard, pero dejamos el dato disponible)
  }))
}

export default function MisMinutasPage() {
  const router = useRouter()

  /** Guard de sesión + admin redirect */
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const check = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.replace('/login')
        return
      }
      if (!active) return
      const email = data.user.email ?? null
      setCurrentUserEmail(email)
      setCurrentUserId(data.user.id ?? null)
      if (email === ADMIN_EMAIL) {
        router.replace('/minutas') // admin → vista de todas
        return
      }
      setCheckingAuth(false)
    }
    check()
    return () => { active = false }
  }, [router])

  /** Filtros por fecha */
  const [filters, setFilters] = useState<Filters>({})

  /** SWR: traer mis minutas cuando ya pasó el guard */
  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    checkingAuth ? null : ['mis-minutas', filters],
    () => fetchMyMinutes(filters)
  )

  /** Modal de confirmación para eliminar */
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toDeleteId, setToDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  /** Handlers */
  const handleView = (id: string) => router.push(`/minutas/${id}`)
  const handleEdit = (id: string) => router.push(`/minutas/${id}?edit=1`) // edición inline en el detalle
  const askDelete = (id: string) => { setToDeleteId(id); setShowDelete(true) }

  const confirmDelete = async () => {
    if (!toDeleteId) return
    try {
      setDeleting(true)
      // RLS asegura que solo el dueño pueda eliminar
      const { error } = await supabase.from('minute').delete().eq('id', toDeleteId)
      if (error) throw error
      setShowDelete(false)
      setToDeleteId(null)
      setFeedback('Minuta eliminada correctamente.')
      await mutate()
    } catch (e: any) {
      setFeedback(e.message ?? 'No se pudo eliminar la minuta.')
    } finally {
      setDeleting(false)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (checkingAuth) return <p className="mt-4">Verificando sesión…</p>

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Mis minutas</h1></Col>
        <Col xs="auto">
          <Button variant="outline-secondary" onClick={logout}>Cerrar sesión</Button>
        </Col>
      </Row>

      <MinutesFilter onChange={setFilters} />

      {feedback && (
        <Alert variant="info" className="mt-3" onClose={() => setFeedback(null)} dismissible>
          {feedback}
        </Alert>
      )}
      {error && <Alert variant="danger" className="mt-3">Error al cargar minutas: {error.message}</Alert>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (
        <p className="mt-3">No tienes minutas registradas entre las fechas seleccionadas.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {items?.map((minuta) => (
          <Col key={minuta.id}>
            <MinuteCard
              minuta={minuta}
              mode="edit"                 // 👈 muestra Editar/Eliminar
              onView={handleView}        // (id: string) => void
              onEdit={handleEdit}        // (id: string) => void
              onDelete={askDelete}       // (id: string) => void
            />
          </Col>
        ))}
      </Row>

      {/* Modal Eliminar */}
      <Modal show={showDelete} onHide={() => setShowDelete(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Eliminar minuta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          ¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDelete(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? (<><Spinner size="sm" animation="border" /> Eliminando…</>) : 'Eliminar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
