// src/pages/mis-minutas.tsx
/**
 * MIS MINUTAS — Carga condicionada por sesión + UI estable
 *
 * Objetivo:
 *  - Evitar cuelgues tipo “Verificando sesión…” y fetch prematuros.
 *  - Usar un ÚNICO estado de auth (AuthProvider) y proteger vía <SessionGate>.
 *  - Disparar SWR SOLO cuando status==='authenticated' y existe user.id.
 *  - Calcular totales reales (minutos) DESCONTANDO pausas vía RPC minute_totals_for.
 *
 * Claves técnicas:
 *  - <SessionGate requireAuth> maneja 'loading' y redirección a /login.
 *  - if (user.email === ADMIN_EMAIL) → redirige a /minutas (rol admin solo lectura global).
 *  - Realtime: canal postgres_changes limitado a las minutas del usuario.
 *  - Totales: SWR adicional que llama a supabase.rpc('minute_totals_for', { minute_ids })
 *             y cae a un fallback end-start si la RPC aún no está disponible.
 *
 * Requisitos:
 *  - Tener AuthProvider en _app.tsx.
 *  - Tener SessionGate en src/components/SessionGate.tsx.
 *  - Haber creado la función RPC SQL:
 *      create or replace function public.minute_totals_for(minute_ids uuid[])
 *      returns table(minute_id uuid, total_seconds bigint) ...
 */

import React, { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  Container, Row, Col, Button, Modal, Alert, Spinner,
} from 'react-bootstrap'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import SessionGate from '@/components/SessionGate'
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard'
import MinutesFilter from '@/components/MinutesFilter'
import StatsBar from '@/components/StatsBar'
import Skeletons from '@/components/Skeletons'
import styles from '@/styles/Minutas.module.css'
import { BsPlusLg } from 'react-icons/bs'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'
type Filters = { desde?: string; hasta?: string }

type MinuteRow = {
  id: string
  user_id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
  description?: string | null
  tarea_realizada?: string | null
  notes?: string | null
  created_by_name?: string | null
  created_by_email?: string | null
  folio?: string | null
  folio_serial?: number | null
  attachment?: { count: number }[]
}

/** Fetcher: lista solo las minutas del dueño (RLS debe reforzarlo en BD). */
const fetchMyMinutes = async (filters: Filters, userId: string): Promise<MinuteCardData[]> => {
  let query = supabase
    .from('minute')
    .select(`
      id,
      user_id,
      date,
      start_time,
      end_time,
      description,
      tarea_realizada,
      notes,
      created_by_name,
      created_by_email,
      folio,
      folio_serial,
      attachment(count)
    `)
    .eq('user_id', userId)

  // Ordenación estable: por fecha, luego por hora de inicio
  query = query.order('date', { ascending: false }).order('start_time', { ascending: false })

  if (filters?.desde) query = query.gte('date', filters.desde)
  if (filters?.hasta) query = query.lte('date', filters.hasta)

  const { data, error } = await query
  if (error) throw error

  return (data as MinuteRow[]).map((m) => ({
    id: m.id,
    date: m.date,
    start_time: m.start_time ?? null,
    end_time: m.end_time ?? null,
    description: m.description ?? m.tarea_realizada ?? null,
    notes: m.notes ?? undefined,
    adjuntos: m.attachment?.[0]?.count ?? 0,
    user_name: m.created_by_name || m.created_by_email || 'Sin nombre',
    folio: m.folio ?? null,
    folio_serial: typeof m.folio_serial === 'number' ? m.folio_serial : null,
  }))
}

export default function MisMinutasPage() {
  const router = useRouter()
  const { status, user } = useAuth()

  // Filtros de fecha
  const [filters, setFilters] = useState<Filters>({})

  // Redirección de ADMIN → /minutas (solo lectura global)
  useEffect(() => {
    if (status === 'authenticated' && user?.email === ADMIN_EMAIL) {
      router.replace('/minutas')
    }
  }, [status, user?.email, router])

  // SWR: key nula hasta que haya sesión lista + user.id
  const swrKey = useMemo(() => {
    if (status !== 'authenticated' || !user?.id) return null
    return ['mis-minutas', user.id, filters.desde ?? '', filters.hasta ?? '']
  }, [status, user?.id, filters])

  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    swrKey,
    () => fetchMyMinutes(filters, user!.id),
    { revalidateOnFocus: true }
  )

  // === Totales (DESCARTA pausas) via RPC ====================================
  // Tomamos IDs de las minutas cargadas para pedir sus totales en segundos
  const minuteIds = useMemo(() => (items ?? []).map(m => m.id), [items])

  type TotalsRow = { minute_id: string; total_seconds: number }

  const { data: totals, mutate: mutateTotals } = useSWR<TotalsRow[]>(
    minuteIds.length > 0 ? ['minute-totals', minuteIds.join(',')] : null,
    async () => {
      const { data, error } = await supabase.rpc('minute_totals_for', { minute_ids: minuteIds })
      if (error) {
        // No rompemos la UI; caemos a fallback end-start
        console.warn('RPC minute_totals_for error:', error.message)
        return []
      }
      return data ?? []
    },
    { revalidateOnFocus: true }
  )

  // Realtime (solo cuando hay user.id definitivo) → refresca listado y totales
  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return
    const ch = supabase
      .channel('minute-self')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'minute', filter: `user_id=eq.${user.id}` },
        () => { mutate(); mutateTotals() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [status, user?.id, mutate, mutateTotals])

  // Estados de eliminación (el botón está oculto; dejamos compatibilidad)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toDeleteId, setToDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const askDelete = (id: string) => { setToDeleteId(id); setShowDelete(true) }

  /** Borrado en cascada (Storage → attachments → minute) */
  const deleteMinuteCascade = async (minuteId: string) => {
    const { data: files, error: qErr } = await supabase
      .from('attachment').select('path').eq('minute_id', minuteId)
    if (qErr) throw qErr

    const paths = (files ?? []).map((f: any) => f.path).filter(Boolean)
    if (paths.length) {
      const { error: sErr } = await supabase.storage.from('minutes').remove(paths)
      if (sErr) console.warn('Error eliminando archivos de storage:', sErr.message)
    }
    const { error: aDelErr } = await supabase.from('attachment').delete().eq('minute_id', minuteId)
    if (aDelErr) throw aDelErr
    const { error: mDelErr } = await supabase.from('minute').delete().eq('id', minuteId)
    if (mDelErr) throw mDelErr
  }

  const confirmDelete = async () => {
    if (!toDeleteId) return
    try {
      setDeleting(true)
      await deleteMinuteCascade(toDeleteId)
      setShowDelete(false); setToDeleteId(null)
      setFeedback('Minuta eliminada correctamente.')
      await mutate(); await mutateTotals()
    } catch (e: any) {
      console.error('DELETE error', e)
      const msg = e?.message || e?.error_description || 'No se pudo eliminar la minuta.'
      setFeedback(`Error al eliminar: ${msg}. Si ves "row-level security", crea la policy de DELETE.`)
    } finally {
      setDeleting(false)
    }
  }

  // Logout simple (sin limpiar todo localStorage)
  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      // navegación clara post-logout
      window.location.assign('/login')
    }
  }

  // === Métricas: usa RPC (si disponible) y fallback end-start =================
  const stats = useMemo(() => {
    if (!items || items.length === 0) return { count: 0, minutes: 0, attachments: 0 }

    // Mapear totales por id (si la RPC ya respondió)
    const byId = new Map<string, number>()
    ;(totals ?? []).forEach(t => byId.set(t.minute_id, t.total_seconds || 0))

    // Sumar segundos trabajados para todas las minutas en pantalla
    const totalSeconds = items.reduce((acc, r) => {
      const fromRpc = byId.get(r.id)
      if (typeof fromRpc === 'number') return acc + fromRpc

      // Fallback: si no hay RPC, usa diferencia end-start (no descuenta pausas)
      if (!r.start_time || !r.end_time) return acc
      const start = new Date(`1970-01-01T${r.start_time}`)
      const end = new Date(`1970-01-01T${r.end_time}`)
      const secs = Math.max(0, (end.getTime() - start.getTime()) / 1000)
      return acc + secs
    }, 0)

    const attachments = items.reduce((a, r) => a + (r.adjuntos ?? 0), 0)
    return { count: items.length, minutes: Math.round(totalSeconds / 60), attachments }
  }, [items, totals])

  return (
    <SessionGate requireAuth>
      <Head><title>Mis minutas</title></Head>

      <Container fluid className={styles.bg}>
        <Row className={`${styles.header} align-items-center`}>
          <Col>
            <h1 className={styles.title}>Mis minutas</h1>
            <p className={styles.subtitle}>Gestiona tus registros y evidencias de trabajo.</p>
          </Col>
          <Col xs="auto" className="d-flex gap-2">
            {/* Anchor real a tu ruta existente */}
            <Button as="a" href="/minutas/nueva" className={styles.primaryBtn}>
              <BsPlusLg className="me-2" /> Nueva minuta
            </Button>
            <Button as="a" href="/login" variant="outline-secondary" onClick={logout}>
              Cerrar sesión
            </Button>
          </Col>
        </Row>

        <StatsBar count={stats.count} totalMinutes={stats.minutes} attachments={stats.attachments} />

        <section className={styles.filterSection}>
          <MinutesFilter value={filters} onChange={setFilters} />
        </section>

        {feedback && (
          <Alert variant="info" className="mt-3" onClose={() => setFeedback(null)} dismissible>
            {feedback}
          </Alert>
        )}
        {error && <Alert variant="danger" className="mt-3">Error al cargar minutas: {error.message}</Alert>}

        <section className={styles.listArea}>
          {(isLoading || status === 'loading') && <Skeletons count={6} />}

          {!isLoading && status === 'authenticated' && !error && (items?.length ?? 0) === 0 && (
            <div className="text-center py-5">
              <h2 className="mb-2">Aún no hay minutas en este rango</h2>
              <p style={{ color: '#cbd5e1', marginBottom: 16 }}>
                Crea tu primera minuta o ajusta las fechas para ver resultados.
              </p>
              <Button as="a" href="/minutas/nueva" className="btn btn-primary btn-lg">
                Crear minuta
              </Button>
            </div>
          )}

          {!isLoading && status === 'authenticated' && !error && (items?.length ?? 0) > 0 && (
            <Row xs={1} sm={2} md={3} lg={4} className="g-4">
              {items?.map((minuta) => (
                <Col key={minuta.id}>
                  <MinuteCard
                    minuta={minuta}
                    mode="edit"
                    canDelete={false}
                    /* 🧭 Ver detalles con anchor real (sin SPA) */
                    viewHref={`/minutas/${minuta.id}`}
                    /* ✏️ Editar con navegación dura (si lo mantienes) */
                    onEdit={() => window.location.assign(`/minutas/${minuta.id}?edit=1`)}
                    /* NO pasamos onDelete para ocultar el botón */
                  />
                </Col>
              ))}
            </Row>
          )}
        </section>

        {/* FAB: anchor real */}
        <Button
          as="a"
          href="/minutas/nueva"
          className={styles.fab}
          role="button"
          aria-label="Crear nueva minuta flotante"
        >
          <BsPlusLg />
        </Button>

        {/* Modal de eliminar (compatibilidad) */}
        <Modal show={showDelete} onHide={() => setShowDelete(false)}>
          <Modal.Header closeButton><Modal.Title>Eliminar minuta</Modal.Title></Modal.Header>
          <Modal.Body>¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDelete(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting} aria-busy={deleting}>
              {deleting ? (<><Spinner size="sm" animation="border" /> Eliminando…</>) : 'Eliminar'}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </SessionGate>
  )
}
