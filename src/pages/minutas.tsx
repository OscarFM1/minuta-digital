/**
 * minutas.tsx
 * Página principal de minutas: header, filtros, grid responsive, acciones.
 * Autor: TuNombre
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
  titulo?: string
  fecha?: string
  resumen?: string
  responsable?: string
  adjuntos?: number
}

const fetchMinutes = async (filters: any) => {
  let query = supabase.from('minute').select('*').order('created_at', { ascending: false })
  // Si hay filtros, aplicarlos solo si tienen valor:
  if (filters?.desde) query = query.gte('fecha', filters.desde)
  if (filters?.hasta) query = query.lte('fecha', filters.hasta)
  // Si quieres filtrar por usuario, descomenta:
  // if (filters?.usuario) query = query.eq('usuario', filters.usuario)
  const { data, error } = await query
  if (error) throw error
  return data
}

export default function MinutasPage() {
  const [filters, setFilters] = useState({})
  const { data: minutas, error, isLoading, mutate } = useSWR(['minutas', filters], () => fetchMinutes(filters))
  const [showDelete, setShowDelete] = useState(false)
  const [minutaToDelete, setMinutaToDelete] = useState<Minute | null>(null)

  // Manejar eliminación
  function handleDelete(minuta: Minute) {
    setMinutaToDelete(minuta)
    setShowDelete(true)
  }
  async function confirmDelete() {
    if (!minutaToDelete) return
    // Elimina attachments y minuta (borrado en cascada si lo tienes en backend)
    await supabase.from('minute').delete().eq('id', minutaToDelete.id)
    setShowDelete(false)
    setMinutaToDelete(null)
    mutate() // Refresca listado
  }

  function handleEdit(minuta: Minute) {
    window.location.href = `/minutas/${minuta.id}`
  }

  function handleNuevaMinuta() {
    window.location.href = '/minutas/nueva'
  }

  // LOGOUT ASYNC
  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas</h1></Col>
        <Col xs="auto">
          <Button variant="primary" onClick={handleNuevaMinuta}>Nueva minuta</Button>
          <Button variant="outline-secondary" className="ms-2" onClick={logout}>Cerrar sesión</Button>
        </Col>
      </Row>
      <MinutesFilter onChange={setFilters} />

      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando...</p>}
      {!isLoading && !error && minutas?.length === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {minutas?.map((minuta: Minute) => (
          <Col key={minuta.id}>
            <MinuteCard
              minuta={minuta}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </Col>
        ))}
      </Row>
      {/* Modal de confirmación para eliminar */}
      <Modal show={showDelete} onHide={() => setShowDelete(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar eliminación</Modal.Title>
        </Modal.Header>
        <Modal.Body>¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={confirmDelete}>Eliminar</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
