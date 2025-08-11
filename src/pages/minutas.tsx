/**
 * /minutas
 * Vista de ADMIN (operaciones@multi-impresos.com) en modo SOLO LECTURA.
 * - Lista TODAS las minutas (policy SELECT para admin).
 * - Cada tarjeta navega a /minutas/[id].
 * - Muestra el autor en la card (user_name) usando created_by_*.
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Container, Row, Col, Button } from 'react-bootstrap'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import MinutesFilter from '@/components/MinutesFilter'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/Minutas.module.css'

type Filters = { desde?: string; hasta?: string }

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

/** Trae todas las minutas con autor y conteo de adjuntos */
const fetchMinutes = async (filters: Filters): Promise<MinuteCardData[]> => {
  let query = supabase
    .from('minute')
    .select(`
      id,
      date,
      start_time,
      end_time,
      description,
      notes,
      created_by_name,
      created_by_email,
      attachment(count)
    `)
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((m: any) => ({
    id: m.id,
    date: m.date,
    start_time: m.start_time,
    end_time: m.end_time,
    description: m.description,
    notes: m.notes ?? undefined,
    adjuntos: m?.attachment?.[0]?.count ?? 0,
    user_name: m.created_by_name || m.created_by_email || 'Sin nombre',
  }))
}

export default function MinutasPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>({})

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

  const { data: minutas, error, isLoading } = useSWR<MinuteCardData[]>(
    checkingAuth ? null : ['minutas', filters],
    () => fetchMinutes(filters)
  )

  if (checkingAuth) return <p className="mt-4">Verificando permisos…</p>

  // Navegar al detalle; devolvemos void (ignoramos Promise<boolean>)
  function handleView(id: string) {
    void router.push(`/minutas/${id}`)
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
        {minutas?.map((m) => (
          <Col key={m.id}>
            <MinuteCard
              minuta={m}
              mode="read"         // solo lectura
              onView={handleView} // (id: string) => void
            />
          </Col>
        ))}
      </Row>
    </Container>
  )
}
