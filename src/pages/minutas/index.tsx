/**
 * /minutas (ADMIN, solo lectura)
 * ---------------------------------------------------------------------------
 * Funcionalidad:
 * - Vista de ADMIN (operaciones@multi-impresos.com) con:
 *   1) Bloque seguro para "Reset de contraseña (ADMIN)" (email o link manual).
 *   2) Filtros por Usuario (autocomplete) y rango de fechas (desde/hasta).
 *   3) Realtime: refresca lista en INSERT/UPDATE/DELETE sobre 'minute'.
 *   4) Listado de minutas con MinuteCard en mode="read" y evidencias en RO.
 *
 * Seguridad:
 * - Guard por email: si no es ADMIN, redirige a /mis-minutas.
 * - El bloque de reset usa /api/admin/password-reset que valida:
 *   - Origin === NEXT_PUBLIC_SITE_URL
 *   - Token Bearer del ADMIN (getSession)
 *   - service_role solo en server
 *
 * UX:
 * - Bloque de Reset de contraseña en un Accordion colapsable para no saturar la UI.
 * - Filtros nativos (<datalist>) sin dependencias externas (free).
 * - Botones de "Ir a estadísticas", "Actualizar" y "Cerrar sesión".
 *
 * Nota:
 * - Mantén RLS en BD; esto es UI/UX. La seguridad real está en policies/servidor.
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Container,
  Row,
  Col,
  Button,
  Form,
  InputGroup,
  Accordion,
} from 'react-bootstrap'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import styles from '@/styles/Minutas.module.css'
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate'
import AdminResetPassword from '@/components/AdminResetPassword' // << NUEVO: bloque de reset

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'operaciones@multi-impresos.com'

type Filters = {
  desde?: string  // YYYY-MM-DD
  hasta?: string  // YYYY-MM-DD
  user?: string   // nombre o correo (texto libre / sugerencias del datalist)
}

type UserOption = { value: string; label: string }

/* ============================================================================
 * Data fetchers (SWR)
 * ==========================================================================*/

/**
 * fetchMinutes
 * Obtiene minutas aplicando filtros (fecha y usuario) y mapea a MinuteCardData.
 * - Orden: date DESC, luego start_time DESC.
 * - El campo description utiliza tarea_realizada como fallback.
 * - adjuntos proviene de un count en la relación attachment.
 */
async function fetchMinutes(filters: Filters): Promise<MinuteCardData[]> {
  const col = 'date'

  let q = supabase
    .from('minute')
    .select(`
      id,
      date,
      start_time,
      end_time,
      description,
      tarea_realizada,
      created_by_name,
      created_by_email,
      folio,
      folio_serial,
      attachment(count)
    `)
    .order(col, { ascending: false })
    .order('start_time', { ascending: false })

  if (filters.desde) q = q.gte(col, filters.desde)
  if (filters.hasta) q = q.lte(col, filters.hasta)

  if (filters.user && filters.user.trim()) {
    const term = filters.user.trim()
    q = q.or(`created_by_name.ilike.%${term}%,created_by_email.ilike.%${term}%`)
  }

  const { data, error } = await q
  if (error) throw error

  return (data ?? []).map((m: any) => ({
    id: m.id,
    date: m.date,
    start_time: m.start_time,
    end_time: m.end_time,
    description: m.description ?? m.tarea_realizada ?? null,
    adjuntos: m?.attachment?.[0]?.count ?? 0,
    user_name: m.created_by_name || m.created_by_email || 'Sin nombre',
    folio: m.folio ?? null,
    folio_serial: typeof m.folio_serial === 'number' ? m.folio_serial : null,
  }))
}

/**
 * fetchUserOptions
 * Devuelve opciones únicas (por email o nombre) para el <datalist> de usuario.
 */
async function fetchUserOptions(): Promise<UserOption[]> {
  const { data, error } = await supabase
    .from('minute')
    .select('created_by_name, created_by_email')
    .order('created_by_name', { ascending: true })
  // Si la tabla crece mucho, puedes paginar o usar DISTINCT en una view materializada.

  if (error) throw error

  const seen = new Set<string>()
  const out: UserOption[] = []

  for (const row of (data ?? [])) {
    const email = (row as any).created_by_email as string | null
    const name = (row as any).created_by_name as string | null

    const value = email?.trim() || name?.trim()
    if (!value) continue

    const key = (email || name)!.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const label =
      email && name ? `${name} <${email}>`
      : email ? email
      : name!

    out.push({ value, label })
  }

  return out
}

/* ============================================================================
 * Page Component
 * ==========================================================================*/

export default function MinutasIndexPage() {
  useFirstLoginGate()

  const router = useRouter()
  const [filters, setFilters] = useState<Filters>({})
  const [checking, setChecking] = useState(true)
  const [forceKey, setForceKey] = useState<number>(0)

  // Guard de admin por email (simple y suficiente en tu contexto actual)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const email = data?.user?.email ?? ''
      if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.replace('/mis-minutas')
        return
      }
      setChecking(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SWR: minutas filtradas
  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    checking ? null : ['admin-minutes', filters, forceKey],
    () => fetchMinutes(filters),
    {
      revalidateIfStale: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: false,
      dedupingInterval: 0,
    }
  )

  // SWR: opciones de usuario para autocompletar (datalist)
  const { data: userOptions } = useSWR<UserOption[]>(
    checking ? null : 'admin-minute-users',
    fetchUserOptions,
    { revalidateOnFocus: false }
  )

  // Realtime: refresca al detectar cambios en 'minute'
  useEffect(() => {
    if (checking) return
    const channel = supabase
      .channel('minute-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'minute' }, () => {
        mutate()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [checking, mutate])

  if (checking) return <p className="mt-4">Verificando permisos…</p>

  // Navegación / helpers
  const onView = (id: string) => { void router.push(`/minutas/${id}`) }
  const logout = async () => { await supabase.auth.signOut(); router.replace('/login') }
  const handleHardRefresh = () => { setForceKey(Date.now()); void mutate() }

  // Handlers filtros
  const handleUser = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, user: e.target.value || undefined }))

  const handleDesde = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, desde: e.target.value || undefined }))

  const handleHasta = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, hasta: e.target.value || undefined }))

  const clearFilters = () => setFilters({})

  return (
    <Container fluid className={styles.bg}>
      {/* Header con acciones administrativas */}
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas (Admin)</h1></Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => router.push('/minutas/estadisticas')}>
            Ir a estadísticas
          </Button>
          <Button variant="outline-secondary" onClick={handleHardRefresh}>
            Actualizar
          </Button>
          <Button variant="outline-secondary" onClick={logout}>
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      {/* Bloque: Reset de contraseña (ADMIN) en accordion colapsable */}
      <Row className="mb-4">
        <Col lg={8} xl={7}>
          <Accordion defaultActiveKey={undefined} alwaysOpen={false}>
            <Accordion.Item eventKey="reset">
              <Accordion.Header>Reset de contraseña (ADMIN)</Accordion.Header>
              <Accordion.Body>
                {/*
                  AdminResetPassword:
                  - Modo "Enviar enlace" (correo de recuperación)
                  - Modo "Generar enlace (manual)" para compartir por WhatsApp/Teams
                  - Usa /api/admin/password-reset (server) con validaciones fuertes
                */}
                <AdminResetPassword />
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>

      {/* === Filtros: Usuario (autocomplete) + Rango de fechas === */}
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
            {/* Datalist nativo: sin dependencias y con autocompletado */}
            <datalist id="admin-users-datalist">
              {userOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </datalist>
          </InputGroup>
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Desde</Form.Label>
          <Form.Control
            type="date"
            value={filters.desde ?? ''}
            onChange={handleDesde}
            aria-label="Fecha desde (YYYY-MM-DD)"
          />
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Hasta</Form.Label>
          <Form.Control
            type="date"
            value={filters.hasta ?? ''}
            onChange={handleHasta}
            aria-label="Fecha hasta (YYYY-MM-DD)"
          />
        </Col>

        <Col md={1} lg={2} className="d-flex">
          <Button variant="outline-secondary" className="ms-auto" onClick={clearFilters}>
            Limpiar
          </Button>
        </Col>
      </Row>

      {/* Estados de carga/errores vacíos */}
      {error && <p className="text-danger mt-3">Error al cargar minutas: {error.message}</p>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      {/* Grid de minutas (solo lectura) */}
      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {items?.map(m => (
          <Col key={m.id}>
            <MinuteCard
              minuta={m}
              mode="read"
              evidenceReadOnly
              onView={onView}
              viewHref={`/minutas/${m.id}`} // anchor real opcional
            />
          </Col>
        ))}
      </Row>
    </Container>
  )
}
