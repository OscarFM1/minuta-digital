/**
 * /mis-minutas
 * Vista para usuarios normales (y fallback seguro si el admin cae aquí):
 * - Lista minutas del usuario autenticado (RLS lo garantiza).
 * - Muestra botones de "Editar" y "Eliminar" SOLO si la minuta es del usuario.
 * - Si el usuario es admin (operaciones@...), fuerza SOLO LECTURA (solo “Ver detalles”).
 *
 * Seguridad:
 *  - RLS en BD impide ver/editar/eliminar minutas ajenas.
 *  - Este control de UI evita mostrar acciones indebidas por error de configuración o sharing futuro.
 *
 * UX:
 *  - Badge "Propia" vs "Solo lectura" para dejar claro el estado.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Container, Row, Col, Button, Modal, Badge } from 'react-bootstrap'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import MinutesFilter from '@/components/MinutesFilter'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Minutas.module.css'

/** Email del administrador (solo lectura) */
const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

/** Tipo de dato de una minuta traída del backend (incluye user_id requerido). */
type Minute = {
  id: string
  user_id: string
  date?: string
  start_time?: string
  end_time?: string
  description?: string
  notes?: string
  adjuntos?: number
}

type Filters = { desde?: string; hasta?: string }

const fetchMyMinutes = async (filters: Filters): Promise<Minute[]> => {
  // Traemos lo necesario + user_id + conteo de attachments
  let query = supabase
    .from('minute')
    .select('id,user_id,date,start_time,end_time,description,notes,attachment(count)')
    .order('date', { ascending: false })

  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((m: any) => ({
    ...m,
    adjuntos: m?.attachment?.[0]?.count ?? 0,
  }))
}

export default function MisMinutasPage() {
  const router = useRouter()

  // Estado de filtros (fecha, etc.)
  const [filters, setFilters] = useState<Filters>({})

  // Datos de sesión
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)

  // Carga de usuario autenticado
  useEffect(() => {
    let mounted = true
    const check = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.replace('/login')
        return
      }
      if (!mounted) return
      setCurrentUserId(data.user.id ?? null)
      setCurrentEmail(data.user.email ?? null)
      setCheckingAuth(false)
    }
    check()
    return () => { mounted = false }
  }, [router])

  // Carga de minutas (respeta RLS: solo las del usuario)
  const { data: minutas, error, isLoading, mutate } = useSWR<Minute[]>(
    ['mis-minutas', filters],
    () => fetchMyMinutes(filters)
  )

  // Flags de rol
  const isAdmin = useMemo(() => currentEmail === ADMIN_EMAIL, [currentEmail])

  // Modal de eliminación y objetivo a eliminar
  const [showDelete, setShowDelete] = useState(false)
  const [minutaToDelete, setMinutaToDelete] = useState<Minute | null>(null)

  // Handlers (tipados con MinuteCardData para compatibilidad con el componente)
  function handleView(minuta: MinuteCardData) {
    router.push(`/minutas/${minuta.id}`)
  }

  function handleEdit(minuta: MinuteCardData) {
    const isOwner = minuta.user_id && minuta.user_id === currentUserId
    if (!isOwner || isAdmin) {
      router.push(`/minutas/${minuta.id}`) // Fallback a solo lectura
      return
    }
    // TODO: ruta de edición real si la habilitas
    router.push(`/minutas/${minuta.id}`)
  }

  function handleDeleteAsk(minuta: MinuteCardData) {
    const isOwner = minuta.user_id && minuta.user_id === currentUserId
    if (!isOwner || isAdmin) return // Defensa UI extra
    setMinutaToDelete(minuta as Minute)
    setShowDelete(true)
  }

  async function confirmDelete() {
    if (!minutaToDelete) return
    // RLS en BD valida que solo el dueño pueda borrar
    await supabase.from('minute').delete().eq('id', minutaToDelete.id)
    setShowDelete(false)
    setMinutaToDelete(null)
    mutate() // refrescar listado
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (checkingAuth) return <p className="mt-4">Verificando sesión…</p>

  return (
    <Container fluid className={styles.bg}>
      {/* Header con acciones */}
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Mis minutas</h1></Col>
        <Col xs="auto">
          {/* Usuarios normales → pueden crear; admin → no mostramos crear */}
          {!isAdmin && (
            <Button variant="primary" onClick={() => router.push('/minutas/nueva')}>
              Nueva minuta
            </Button>
          )}
          <Button variant="outline-secondary" className="ms-2" onClick={logout}>
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      {/* Filtros por fecha */}
      <MinutesFilter onChange={setFilters} />

      {/* Estados de carga/errores */}
      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (minutas?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      {/* Grid de tarjetas */}
      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {minutas?.map((minuta) => {
          const isOwner = minuta.user_id === currentUserId
          // Admin → SOLO LECTURA siempre; user → owner solo si es dueño
          const cardMode = isAdmin ? 'read' : (isOwner ? 'owner' : 'read')

          return (
            <Col key={minuta.id}>
              <MinuteCard
                minuta={minuta} // Compatible: Minute tiene superset de propiedades de MinuteCardData
                mode={cardMode as 'read' | 'owner'}
                onView={handleView}
                onEdit={isOwner && !isAdmin ? handleEdit : undefined}
                onDelete={isOwner && !isAdmin ? handleDeleteAsk : undefined}
              />
              {/* Badge visual del estado de la tarjeta */}
              <div className="mt-1">
                {cardMode === 'owner' ? (
                  <Badge bg="success">Propia</Badge>
                ) : (
                  <Badge bg="secondary">Solo lectura</Badge>
                )}
              </div>
            </Col>
          )
        })}
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
          <Button variant="danger" onClick={confirmDelete}>Eliminar</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
