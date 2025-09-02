// src/pages/mis-minutas.tsx
/**
 * MIS MINUTAS — SOLO para 'worker'
 *
 * Fix: Evitar “Rendered fewer hooks than expected”.
 * - El componente de página usa solo hooks estables (useAuth/useRole/useEffect).
 * - La UI con SWR/estados/realtime vive en <WorkerScreen />, que se monta SOLO
 *   cuando el usuario es 'worker'. Montar/desmontar hijos no rompe la regla de hooks.
 *
 * Política de roles:
 * - admin / super_admin -> redirect a /minutas (vista global de Operaciones).
 * - worker -> ve su propia vista con crear/editar (CTAs y FAB).
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
import { useRole } from '@/hooks/useRole'

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
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

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

/* ---------------------------- PÁGINA (parent) ---------------------------- */

export default function MisMinutasPage() {
  const router = useRouter()
  const { status, user } = useAuth()
  const { loading: roleLoading, canWriteMinutes } = useRole() // worker => true

  // Redirigir admins a la vista global
  useEffect(() => {
    if (status === 'authenticated' && !roleLoading && !canWriteMinutes) {
      router.replace('/minutas')
    }
  }, [status, roleLoading, canWriteMinutes, router])

  return (
    <SessionGate requireAuth>
      <Head><title>Mis minutas</title></Head>

      {/* Mientras determinamos rol o redirigimos, evita parpadeos */}
      {status !== 'authenticated' || roleLoading ? (
        <div style={{ padding: 24 }}>Cargando…</div>
      ) : !canWriteMinutes ? (
        // Admin/SuperAdmin: ya se lanzó replace('/minutas'), dejamos un placeholder
        <div style={{ padding: 24 }}>Redirigiendo…</div>
      ) : user?.id ? (
        <WorkerScreen userId={user.id} />
      ) : null}
    </SessionGate>
  )
}

/* ---------------------------- CONTENIDO worker --------------------------- */

function WorkerScreen({ userId }: { userId: string }) {
  // Filtros de fecha
  const [filters, setFilters] = useState<Filters>({})

  // SWR: key nula hasta que haya userId
  const swrKey = useMemo(() => ['mis-minutas', userId, filters.desde ?? '', filters.hasta ?? ''], [userId, filters])

  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    swrKey,
    () => fetchMyMinutes(filters, userId),
    { revalidateOnFocus: true }
  )

  // Totales (DESCARTA pausas) via RPC
  const minuteIds = useMemo(() => (items ?? []).map(m => m.id), [items])
  type TotalsRow = { minute_id: string; total_seconds: number }

  const { data: totals, mutate: mutateTotals } = useSWR<TotalsRow[]>(
    minuteIds.length > 0 ? ['minute-totals', minuteIds.join(',')] : null,
    async () => {
      const { data, error } = await supabase.rpc('minute_totals_for', { minute_ids: minuteIds })
      if (error) { console.warn('RPC minute_totals_for error:', error.message); return [] }
      return data ?? []
    },
    { revalidateOnFocus: true }
  )

  // Realtime (solo minutas del usuario)
  useEffect(() => {
    const ch = supabase
      .channel('minute-self')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'minute', filter: `user_id=eq.${userId}` },
        () => { mutate(); mutateTotals() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, mutate, mutateTotals])

  // Estados de eliminación (compatibilidad)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toDeleteId, setToDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const askDelete = (id: string) => { setToDeleteId(id); setShowDelete(true) }

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

  const logout = async () => {
    try { await supabase.auth.signOut() } finally { window.location.assign('/login') }
  }

  // Métricas (RPC + fallback)
  const stats = useMemo(() => {
    if (!items || items.length === 0) return { count: 0, minutes: 0, attachments: 0 }
    const byId = new Map<string, number>()
    ;(totals ?? []).forEach(t => byId.set(t.minute_id, t.total_seconds || 0))
    const totalSeconds = items.reduce((acc, r) => {
      const fromRpc = byId.get(r.id)
      if (typeof fromRpc === 'number') return acc + fromRpc
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
    <Container fluid className={styles.bg}>
      <Row className={`${styles.header} align-items-center`}>
        <Col>
          <h1 className={styles.title}>Mis minutas</h1>
          <p className={styles.subtitle}>Gestiona tus registros y evidencias de trabajo.</p>
        </Col>
        <Col xs="auto" className="d-flex gap-2">
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
        {isLoading && <Skeletons count={6} />}

        {!isLoading && !error && (items?.length ?? 0) === 0 && (
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

        {!isLoading && !error && (items?.length ?? 0) > 0 && (
          <Row xs={1} sm={2} md={3} lg={4} className="g-4">
            {items?.map((minuta) => (
              <Col key={minuta.id}>
                <MinuteCard
                  minuta={minuta}
                  mode="edit"                 // Worker puede editar
                  canDelete={false}
                  viewHref={`/minutas/${minuta.id}`}
                  onEdit={() => window.location.assign(`/minutas/${minuta.id}?edit=1`)}
                />
              </Col>
            ))}
          </Row>
        )}
      </section>

      {/* FAB */}
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
      <DeleteModal
        show={showDelete}
        onHide={() => setShowDelete(false)}
        onConfirm={confirmDelete}
        deleting={deleting}
      />
    </Container>
  )
}

/* ---------------------------- UI auxiliar --------------------------- */

function DeleteModal({
  show, onHide, onConfirm, deleting,
}: { show: boolean; onHide: () => void; onConfirm: () => void; deleting: boolean }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton><Modal.Title>Eliminar minuta</Modal.Title></Modal.Header>
      <Modal.Body>¿Seguro que deseas eliminar esta minuta? Esta acción no se puede deshacer.</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={deleting}>Cancelar</Button>
        <Button variant="danger" onClick={onConfirm} disabled={deleting} aria-busy={deleting}>
          {deleting ? (<><Spinner size="sm" animation="border" /> Eliminando…</>) : 'Eliminar'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
