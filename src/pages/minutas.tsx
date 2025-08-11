import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
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

type Filters = {
  desde?: string
  hasta?: string
  usuario?: string
}

const fetchMinutes = async (filters: Filters): Promise<Minute[]> => {
  // Traemos solo las columnas necesarias + el count de la relación attachment
  let query = supabase
    .from('minute')
    .select('id,date,start_time,end_time,description,notes,attachment(count)')
    .order('date', { ascending: false })

  // Aplica filtros solo si tienen valor
  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)
  // if (filters?.usuario) query = query.eq('usuario', filters.usuario)

  const { data, error } = await query
  if (error) throw error

  // `attachment(count)` retorna algo como: attachment: [{ count: X }]
  return (data ?? []).map((m: any) => ({
    ...m,
    adjuntos: m?.attachment?.[0]?.count ?? 0,
  }))
}

export default function MinutasPage() {
  const [filters, setFilters] = useState<Filters>({})
  const { data: minutas, error, isLoading, mutate } = useSWR<Minute[]>(
    ['minutas', filters],
    () => fetchMinutes(filters)
  )

  const [showDelete, setShowDelete] = useState(false)
  const [minutaToDelete, setMinutaToDelete] = useState<Minute | null>(null)

  // AUTORIZACIÓN DE USUARIO (solo admin operaciones)
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      const email = data?.user?.email
      if (email !== 'operaciones@multi-impresos.com') {
        router.replace('/mis-minutas') // usuarios normales → su vista
        return
      }
      setCheckingAuth(false) // admin confirmado
    }
    checkUser()
  }, [router])

  if (checkingAuth) {
    return <p className="mt-4">Verificando permisos...</p>
  }

  // Manejar eliminación (OJO: si quieres admin solo-lectura total, luego quitamos también eliminar/editar)
  function handleDelete(minuta: Minute) {
    setMinutaToDelete(minuta)
    setShowDelete(true)
  }

  async function confirmDelete() {
    if (!minutaToDelete) return
    await supabase.from('minute').delete().eq('id', minutaToDelete.id)
    setShowDelete(false)
    setMinutaToDelete(null)
    mutate() // Refresca listado
  }

  function handleEdit(minuta: Minute) {
    window.location.href = `/minutas/${minuta.id}`
  }

  // Nota: eliminamos handleNuevaMinuta porque el admin no puede crear

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas</h1></Col>
        <Col xs="auto">
          {/* Admin SOLO lectura: sin botón de creación */}
          <Button variant="outline-secondary" onClick={logout}>Cerrar sesión</Button>
        </Col>
      </Row>

      <MinutesFilter onChange={setFilters} />

      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando...</p>}
      {!isLoading && !error && (minutas?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {minutas?.map((minuta) => (
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
