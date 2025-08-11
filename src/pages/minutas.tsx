/**
 * /minutas
 * Vista de ADMIN (operaciones@multi-impresos.com) en modo SOLO LECTURA.
 *
 * Comportamiento:
 *  - Lista TODAS las minutas (gracias a policy SELECT para admin).
 *  - No permite crear, editar ni eliminar desde esta vista.
 *  - Cada tarjeta solo muestra "Ver detalles", que navega a /minutas/[id].
 *
 * Seguridad:
 *  - UI guard: si no es admin → redirige a /mis-minutas.
 *  - RLS recomendado: policy SELECT para admin en minute/attachment.
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Container, Row, Col, Button } from 'react-bootstrap'
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
}

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

const fetchMinutes = async (filters: Filters): Promise<Minute[]> => {
  // Traemos columnas necesarias + count de attachments
  let query = supabase
    .from('minute')
    .select('id,date,start_time,end_time,description,notes,attachment(count)')
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

export default function MinutasPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>({})
  const { data: minutas, error, isLoading } = useSWR<Minute[]>(
    ['minutas', filters],
    () => fetchMinutes(filters)
  )

  // Guard: solo admin
  const [checkingAuth, setCheckingAuth] = useState(true)
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()
      const email = data?.user?.email
      if (email !== ADMIN_EMAIL) {
        router.replace('/mis-minutas')
        return
      }
      setCheckingAuth(false)
    }
    checkUser()
  }, [router])

  if (checkingAuth) return <p className="mt-4">Verificando permisos…</p>

  // Navegar al detalle en modo lectura
  function handleView(minuta: Minute) {
    router.push(`/minutas/${minuta.id}`)
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas</h1></Col>
        <Col xs="auto">
          {/* Admin SOLO LECTURA: sin botón de creación */}
          <Button variant="outline-secondary" onClick={logout}>Cerrar sesión</Button>
        </Col>
      </Row>

      <MinutesFilter onChange={setFilters} />

      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (minutas?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {minutas?.map((minuta) => (
          <Col key={minuta.id}>
            <MinuteCard
              minuta={minuta}
              mode="read"            // 👈 SOLO lectura (muestra “Ver detalles”)
              onView={handleView}    // 👈 navega al detalle
            />
          </Col>
        ))}
      </Row>
    </Container>
  )
}
