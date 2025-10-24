/**
 * /minutas — Vista GLOBAL para ADMIN / SUPER_ADMIN (solo lectura)
 * -----------------------------------------------------------------------------
 * - Gating por rol con <RequireRole allow={['admin','super_admin']}>.
 * - Misma UI para TODOS los administradores (Esteban, operaciones, etc.).
 * - Filtros: usuario (datalist) + rango de fechas.
 * - Realtime: refresca al cambiar 'minute'.
 * - Listado con MinuteCard en mode="read" (evidencias en RO).
 * - Bloque "Reset de contraseña (ADMIN)" (usa /api/admin/password-reset).
 *
 * NOTAS DE INGENIERÍA
 * - Esta vista es GLOBAL (admin); por eso aquí se consulta directamente la tabla
 *   `public.minute` y NO la RPC `my_minutes_page` (que filtra por auth.uid()).
 * - Si más adelante quieres “totales + lista” del mismo conjunto para admin,
 *   crea una RPC `admin_minutes_page(p_from,p_to,p_user,p_limit,p_offset)` con
 *   SECURITY DEFINER y aplica el mismo patrón de “page” (lista + totales).
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  Container, Row, Col, Button, Form, InputGroup, Accordion,
} from 'react-bootstrap'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import styles from '@/styles/Minutas.module.css'
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate'
import AdminResetPassword from '@/components/AdminResetPassword'
import RequireRole from '@/components/RequireRole'

type Filters = { desde?: string; hasta?: string; user?: string }
type UserOption = { value: string; label: string }

/* =============================================================================
 * Fetchers
 * ========================================================================== */

/**
 * Trae minutas globales para admin con filtros de rango y usuario.
 *
 * Diseño:
 * - Orden estable: primero por `date` DESC, luego `started_at` DESC, luego `start_time` DESC.
 *   Esto evita “saltos” por registros sin `started_at` (históricos) y deja un orden
 *   consistente entre datos antiguos y nuevos.
 * - Adjuntos: usamos `attachment(count)` y blindamos lectura ante estructuras nulas.
 * - Atajo: incluimos `started_at`/`ended_at` en select para futuras métricas o
 *   para renderizar duración por fila si lo necesitas después.
 */
async function fetchMinutes(filters: Filters): Promise<MinuteCardData[]> {
  const dateCol = 'date'

  // Base query
  let q = supabase
    .from('minute')
    .select(`
      id,
      ${dateCol},
      start_time,
      end_time,
      started_at,
      ended_at,
      description,
      tarea_realizada,
      created_by_name,
      created_by_email,
      folio,
      folio_serial,
      attachment(count)
    `)
    // Orden estable para todo tipo de registros
    .order(dateCol, { ascending: false })
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('start_time', { ascending: false, nullsFirst: false })

  // Filtros por rango de fechas (inclusive)
  if (filters.desde) q = q.gte(dateCol, filters.desde)
  if (filters.hasta) q = q.lte(dateCol, filters.hasta)

  // Filtro por usuario (nombre o correo, ilike) – robusto contra espacios
  if (filters.user?.trim()) {
    const term = filters.user.trim().replace(/\s+/g, ' ')
    // Usamos OR para buscar tanto en name como en email.
    q = q.or(`created_by_name.ilike.%${term}%,created_by_email.ilike.%${term}%`)
  }

  const { data, error } = await q
  if (error) throw error

  // Mapeo a MinuteCardData (componente existente)
  return (data ?? []).map((m: any) => {
    const attachmentsCount =
      (Array.isArray(m?.attachment) && m.attachment[0]?.count != null)
        ? Number(m.attachment[0].count)
        : 0

    return {
      id: m.id as string,
      date: m.date as string,
      start_time: m.start_time ?? null,
      end_time: m.end_time ?? null,
      // Si tu MinuteCard usa `description` para el título, prioriza description y
      // usa tarea_realizada como respaldo.
      description: (m.description as string) ?? (m.tarea_realizada as string) ?? null,
      adjuntos: attachmentsCount,
      user_name: (m.created_by_name as string) || (m.created_by_email as string) || 'Sin nombre',
      folio: (m.folio as string) ?? null,
      folio_serial: typeof m.folio_serial === 'number' ? m.folio_serial : null,
    } as MinuteCardData
  })
}

/**
 * Lista las opciones de usuario (nombre/correo) para el datalist de búsqueda.
 * - Deduplica por email/nombre (normalizados a lower-case).
 */
async function fetchUserOptions(): Promise<UserOption[]> {
  const { data, error } = await supabase
    .from('minute')
    .select('created_by_name, created_by_email')
    .order('created_by_name', { ascending: true })

  if (error) throw error

  const seen = new Set<string>()
  const out: UserOption[] = []

  for (const row of (data ?? [])) {
    const email = (row as any).created_by_email as string | null
    const name  = (row as any).created_by_name  as string | null
    const value = email?.trim() || name?.trim()
    if (!value) continue
    const key = (email || name)!.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const label = email && name ? `${name} <${email}>` : (email || name!)!
    out.push({ value, label })
  }

  return out
}

/* =============================================================================
 * Page Wrapper
 * ========================================================================== */

export default function MinutasGlobalPage() {
  return (
    <>
      <Head><title>Minutas — Administración</title></Head>
      <RequireRole allow={['admin', 'super_admin']}>
        <AdminMinutasView />
      </RequireRole>
    </>
  )
}

/* =============================================================================
 * AdminMinutasView
 * ========================================================================== */

function AdminMinutasView() {
  useFirstLoginGate()
  const router = useRouter()

  const [filters, setFilters] = useState<Filters>({})
  const [forceKey, setForceKey] = useState<number>(0)

  /**
   * SWR: usamos una key compuesta para que revalide al cambiar cualquier filtro
   * o al forzar un refresh (forceKey).
   */
  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    ['admin-minutes', filters, forceKey],
    () => fetchMinutes(filters),
    {
      revalidateIfStale: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: false,
      dedupingInterval: 0,
    }
  )

  const { data: userOptions } = useSWR<UserOption[]>(
    'admin-minute-users',
    fetchUserOptions,
    { revalidateOnFocus: false }
  )

  // Realtime: refrescamos la lista ante cualquier cambio en 'minute'
  useEffect(() => {
    const ch = supabase
      .channel('minute-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'minute' }, () => { mutate() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [mutate])

  // Navegación a detalle
  const onView = (id: string) => { void router.push(`/minutas/${id}`) }

  // Refresh manual (además de SWR)
  const handleHardRefresh = () => { setForceKey(Date.now()); void mutate() }

  // Handlers de filtros
  const handleUser  = (e: React.ChangeEvent<HTMLInputElement>) => setFilters(f => ({ ...f, user:  e.target.value || undefined }))
  const handleDesde = (e: React.ChangeEvent<HTMLInputElement>) => setFilters(f => ({ ...f, desde: e.target.value || undefined }))
  const handleHasta = (e: React.ChangeEvent<HTMLInputElement>) => setFilters(f => ({ ...f, hasta: e.target.value || undefined }))
  const clearFilters = () => setFilters({})

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas (Admin)</h1></Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => router.push('/minutas/estadisticas')}>
            Ir a estadísticas
          </Button>
          <Button variant="outline-secondary" onClick={handleHardRefresh}>
            Actualizar
          </Button>
          {/* 🔒 Navegación DURA: página /logout cierra sesión y redirige */}
          <Button as="a" href="/logout" variant="outline-secondary">
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col lg={8} xl={7}>
          <Accordion defaultActiveKey={undefined} alwaysOpen={false}>
            <Accordion.Item eventKey="reset">
              <Accordion.Header>Reset de contraseña (ADMIN)</Accordion.Header>
              <Accordion.Body>
                <AdminResetPassword />
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>

      <Row className="g-3 align-items-end mb-4">
        <Col md={5} lg={4}>
          <Form.Label>Usuario</Form.Label>
          <InputGroup>
            <Form.Control
              type="text"
              placeholder="Nombre o correo"
              value={filters.user ?? ''}
              onChange={handleUser}
              list="admin-users-datalist"
              aria-label="Filtrar por usuario (nombre o correo)"
            />
            <datalist id="admin-users-datalist">
              {userOptions?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </datalist>
          </InputGroup>
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Desde</Form.Label>
          <Form.Control type="date" value={filters.desde ?? ''} onChange={handleDesde} />
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Hasta</Form.Label>
          <Form.Control type="date" value={filters.hasta ?? ''} onChange={handleHasta} />
        </Col>

        <Col md={1} lg={2} className="d-flex">
          <Button variant="outline-secondary" className="ms-auto" onClick={clearFilters}>
            Limpiar
          </Button>
        </Col>
      </Row>

      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {items?.map(m => (
          <Col key={m.id}>
            <MinuteCard
              minuta={m}
              mode="read"
              evidenceReadOnly
              onView={onView}
              viewHref={`/minutas/${m.id}`}
            />
          </Col>
        ))}
      </Row>
    </Container>
  )
}
