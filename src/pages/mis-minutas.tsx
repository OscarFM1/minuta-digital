import React, { useEffect, useMemo, useState } from 'react'
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate'
import { useRouter } from 'next/router'
import {
  Container, Row, Col, Button, Modal, Alert, Spinner,
} from 'react-bootstrap'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
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

export default function MisMinutasPage() {
  useFirstLoginGate()

  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const check = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) { router.replace('/login'); return }
      const email = data.user.email ?? null
      if (email === ADMIN_EMAIL) { router.replace('/minutas'); return }
      if (active) { setUserId(data.user.id); setCheckingAuth(false) }
    }
    check()
    return () => { active = false }
  }, [router])

  const [filters, setFilters] = useState<Filters>({})

  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    checkingAuth || !userId ? null : ['mis-minutas', filters, userId],
    () => fetchMyMinutes(filters, userId as string)
  )

  // Realtime: auto-refresh del listado propio
  useEffect(() => {
    if (!userId || checkingAuth) return
    const ch = supabase
      .channel('minute-self')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'minute', filter: `user_id=eq.${userId}` },
        () => { mutate() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, checkingAuth, mutate])

  // Estados de eliminación (el botón está oculto, se deja por compatibilidad)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toDeleteId, setToDeleteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const askDelete = (id: string) => { setToDeleteId(id); setShowDelete(true) }

  // Borrado en cascada
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
      await mutate()
    } catch (e: any) {
      console.error('DELETE error', e)
      const msg = e?.message || e?.error_description || 'No se pudo eliminar la minuta.'
      setFeedback(`Error al eliminar: ${msg}. Si ves "row-level security", crea la policy de DELETE.`)
    } finally {
      setDeleting(false)
    }
  }

  // Logout robusto + navegación dura
  const logout = async () => {
    try {
      void supabase.auth.signOut()
      localStorage.clear()
    } finally {
      window.location.href = '/login'
    }
  }

  // ⚙️ Navegación robusta (hard navigation) para evitar problemas de SPA/estado viejo
  const hardNav = (href: string) => { window.location.href = href }

  // Ver detalle (anchor real vía viewHref abajo)
  const handleEdit = (id: string) => { hardNav(`/minutas/${id}?edit=1`) }

  const stats = useMemo(() => {
    if (!items || items.length === 0) return { count: 0, minutes: 0, attachments: 0 }
    const minutes = items.reduce((acc, r) => {
      if (!r.start_time || !r.end_time) return acc
      const start = new Date(`1970-01-01T${r.start_time}`)
      const end = new Date(`1970-01-01T${r.end_time}`)
      return acc + Math.max(0, (end.getTime() - start.getTime()) / 60000)
    }, 0)
    const attachments = items.reduce((a, r) => a + (r.adjuntos ?? 0), 0)
    return { count: items.length, minutes: Math.round(minutes), attachments }
  }, [items])

  if (checkingAuth) {
    return (
      <Container fluid className={styles.bg}>
        <p className="mt-4">Verificando sesión…</p>
      </Container>
    )
  }

  return (
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
        <MinutesFilter onChange={(f) => { setFilters(f) }} />
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
                  mode="edit"
                  canDelete={false}
                  /* 🧭 Ver detalles con anchor real (sin SPA) */
                  viewHref={`/minutas/${minuta.id}`}
                  /* ✏️ Editar con navegación dura (sin SPA) */
                  onEdit={() => handleEdit(minuta.id)}
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

      {/* Modal de eliminar (se deja por compatibilidad, aunque no se muestra el botón) */}
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
  )
}
