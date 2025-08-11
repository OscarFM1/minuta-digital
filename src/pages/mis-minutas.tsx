/**
 * mis-minutas.tsx
 * Vista para usuarios normales: ven/crean/editan SOLO sus minutas (RLS hace el filtro).
 */
import React, { useState } from 'react'
import { Container, Row, Col, Button, Modal } from 'react-bootstrap'
import MinuteCard from '@/components/MinuteCard'
import MinutesFilter from '@/components/MinutesFilter'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Minutas.module.css'

type Minute = {
  id: string
  date?: string
  start_time?: string
  end_time?: string
  description?: string
  notes?: string
  adjuntos?: number
}

type Filters = { desde?: string; hasta?: string }

const fetchMyMinutes = async (filters: Filters): Promise<Minute[]> => {
  let query = supabase
    .from('minute')
    .select('id,date,start_time,end_time,description,notes,attachment(count)')
    .order('date', { ascending: false })

  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)

  const { data, error } = await query
  if (error) throw error

  // RLS ya limita a "solo mis minutas"
  return (data ?? []).map((m: any) => ({
    ...m,
    adjuntos: m?.attachment?.[0]?.count ?? 0,
  }))
}

export default function MisMinutasPage() {
  const [filters, setFilters] = useState<Filters>({})
  const { data: minutas, error, isLoading, mutate } = useSWR<Minute[]>(
    ['mis-minutas', filters],
    () => fetchMyMinutes(filters)
  )

  const [showDelete, setShowDelete] = useState(false)
  const [minutaToDelete, setMinutaToDelete] = useState<Minute | null>(null)

  function handleDelete(minuta: Minute) {
    setMinutaToDelete(minuta)
    setShowDelete(true)
  }
  async function confirmDelete() {
    if (!minutaToDelete) return
    await supabase.from('minute').delete().eq('id', minutaToDelete.id)
    setShowDelete(false)
    setMinutaToDelete(null)
    mutate()
  }

  function handleEdit(minuta: Minute) {
    window.location.href = `/minutas/${minuta.id}`
  }
  function handleNuevaMinuta() {
    window.location.href = '/minutas/nueva'
  }
  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Mis minutas</h1></Col>
        <Col xs="auto">
          <Button variant="primary" onClick={handleNuevaMinuta}>Nueva minuta</Button>
          <Button variant="outline-secondary" className="ms-2" onClick={logout}>Cerrar sesión</Button>
        </Col>
      </Row>

      <MinutesFilter onChange={setFilters} />

      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando...</p>}
      {!isLoading && !error && (minutas?.length ?? 0) === 0 && <p className="mt-3">No hay minutas para mostrar.</p>}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {minutas?.map((minuta) => (
          <Col key={minuta.id}>
            <MinuteCard minuta={minuta} onEdit={handleEdit} onDelete={handleDelete} />
          </Col>
        ))}
      </Row>

      <Modal show={showDelete} onHide={() => setShowDelete(false)}>
        <Modal.Header closeButton><Modal.Title>Confirmar eliminación</Modal.Title></Modal.Header>
        <Modal.Body>¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={confirmDelete}>Eliminar</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
