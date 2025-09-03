/**
 * Detalle de minuta — con Pause/Resume basado en intervalos.
 * ============================================================================
 * Cambios clave (rol-admin + creador):
 * - Reemplaza el check por email por gating de **roles** usando `useRole`.
 * - Admin/SuperAdmin (isAdminRole=true) ven la minuta en **solo lectura** y
 *   se les muestra el **Creador** (minute.creator_display) en:
 *     1) La franja HERO (metadatos superiores).
 *     2) La tarjeta de "Información básica".
 * - Workers mantienen edición sólo si son dueños (isOwner && !isAdminRole).
 *
 * Buenas prácticas:
 * - SWR tipado con MinuteWithCreator para evitar divergencias.
 * - Mutación local del cache sin `description` (el tipo no la expone).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { Container, Row, Col, Spinner, Alert, Card, Button, Badge } from 'react-bootstrap'
import { FiHash, FiCalendar, FiClock, FiArrowLeft, FiPlay, FiPause, FiRotateCw, FiSquare, FiUser } from 'react-icons/fi'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import SessionGate from '@/components/SessionGate'
import AttachmentsList from '@/components/AttachmentsList'
import MinuteForm from '@/components/MinuteForm'
import { resolveFolio } from '@/lib/folio'
import ui from '@/styles/MinuteDetail.module.css'
import userUi from '@/styles/MinuteFormUser.module.css'
import LockTareaRealizada from '@/components/LockTareaRealizada'
import { getMinuteByIdWithCreator, type MinuteWithCreator } from '@/lib/minutes'
import { useRole } from '@/hooks/useRole'

type IntervalRow = {
  id: string
  minute_id: string
  started_at: string // ISO
  ended_at: string | null // ISO | null
}

/* ==================== Utils ==================== */

/** Normaliza a HH:mm tanto ‘HH:mm’, ‘HH:mm:ss’ como ISO. */
function toHHMM(value?: string | null): string {
  if (!value) return ''
  const s = String(value).trim()
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : ''
}

/** Hora actual en formato compatible con PG TIME. */
function nowAsPgTime(): string { return dayjs().format('HH:mm:ss') }

/** Formato humano para segundos totales. */
function fmtDurationFromSeconds(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Fallback para mostrar tarea: prioriza `tarea_realizada` y cae a `description`. */
function tareaFrom(row?: MinuteWithCreator | null): string {
  if (!row) return ''
  return (row.tarea_realizada ?? (row as any).description ?? '') as string
}

/** Espeja al textarea interno del MinuteForm para pasar validaciones. */
function mirrorTareaToMinuteForm(text: string) {
  const nodes = document.querySelectorAll<HTMLTextAreaElement>(
    'textarea[name="tareaRealizada"], textarea[name="tarea_realizada"]'
  )
  nodes.forEach((el) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
    proto?.set?.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/* ==================== Data ==================== */

async function fetchIntervals(_key: string, minuteId: string): Promise<IntervalRow[]> {
  const { data, error } = await supabase
    .from('minute_interval')
    .select('id, minute_id, started_at, ended_at')
    .eq('minute_id', minuteId)
    .order('started_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as IntervalRow[]
}

function sumIntervalsSeconds(intervals: IntervalRow[]): number {
  return intervals.reduce((acc, it) => {
    const start = dayjs(it.started_at)
    const end = it.ended_at ? dayjs(it.ended_at) : dayjs()
    const secs = Math.max(0, end.diff(start, 'second'))
    return acc + secs
  }, 0)
}

/* ==================== Page ==================== */

export default function MinuteDetailPage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const { status, user } = useAuth()
  const userId = user?.id ?? null

  // 🔐 Roles: worker escribe; admin/super_admin solo lectura
  const { loading: roleLoading, canWriteMinutes } = useRole()
  const isAdminRole = !roleLoading && !canWriteMinutes

  // ⬇️ Minuta con creator_display (usa tipo correcto en SWR)
  const minuteKey = id && status === 'authenticated' ? (['minute-with-creator', id] as const) : null
  const { data: minute, isLoading: isMinuteLoading, error: minuteError, mutate: mutateMinute } =
    useSWR<MinuteWithCreator | null>(
      minuteKey,
      ([_tag, theId]) => getMinuteByIdWithCreator(String(theId)),
      { revalidateOnFocus: false }
    )

  // Intervals
  const intervalsKey = id && status === 'authenticated' ? (['intervals', id] as const) : null
  const { data: intervals, isLoading: isIntervalsLoading, error: intervalsError, mutate: mutateIntervals } =
    useSWR<IntervalRow[]>(
      intervalsKey,
      ([_tag, theId]) => fetchIntervals(String(_tag), String(theId)),
      { revalidateOnFocus: true }
    )

  // Estado derivado
  const isOwner = useMemo(() => !!minute && !!userId && minute.user_id === userId, [minute, userId])
  const hasStarted = useMemo(() => (intervals?.length ?? 0) > 0 || !!minute?.start_time, [intervals, minute?.start_time])
  const hasEnded = useMemo(() => !!minute?.end_time, [minute?.end_time])
  const activeInterval = useMemo(() => (intervals ?? []).find(it => it.ended_at === null) ?? null, [intervals])
  const isRunning = useMemo(() => !!activeInterval && !hasEnded, [activeInterval, hasEnded])
  const isPaused = useMemo(() => hasStarted && !isRunning && !hasEnded, [hasStarted, isRunning, hasEnded])

  const totalSeconds = useMemo(() => sumIntervalsSeconds(intervals ?? []), [intervals])
  const durationHuman = fmtDurationFromSeconds(totalSeconds)

  // Tarea realizada (igual que antes)
  const tareaValueServer = useMemo(() => tareaFrom(minute), [minute])
  const [tareaText, setTareaText] = useState<string>('')
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const saveTimer = useRef<number | null>(null)
  const [tareaLocked, setTareaLocked] = useState(false)

  useEffect(() => {
    const initial = tareaValueServer ?? ''
    setTareaText(initial)
    setSaveState('idle')
    mirrorTareaToMinuteForm(initial)
    setTareaLocked(false)
  }, [minute?.id, tareaValueServer])

  // Fallback: ocultar inputs time del MinuteForm
  useEffect(() => {
    const scope = document.querySelector(`.${userUi.userFormScope}`)
    if (!scope) return
    scope.querySelectorAll('input[type="time"]').forEach((el) => {
      const inp = el as HTMLInputElement
      inp.disabled = true
      inp.readOnly = true
      inp.setAttribute('aria-hidden', 'true')
      ;(inp.style as any).display = 'none'
    })
  }, [minute?.id])

  // Acciones Start/Pause/Resume/Stop
  const [opErr, setOpErr] = useState<string | null>(null)
  const [opLoading, setOpLoading] = useState<'start' | 'pause' | 'resume' | 'stop' | null>(null)

  async function doRefresh() {
    await Promise.all([mutateIntervals(), mutateMinute()])
  }

  function nowIso() { return new Date().toISOString() }

  async function handleStartOrResume(kind: 'start' | 'resume') {
    if (!id || !isOwner || hasEnded || opLoading) return
    setOpErr(null); setOpLoading(kind)
    try {
      await supabase
        .from('minute_interval')
        .update({ ended_at: nowIso() })
        .eq('minute_id', id)
        .is('ended_at', null)

      const ins = await supabase
        .from('minute_interval')
        .insert({ minute_id: id })
        .select('id')
        .single()

      if (ins.error && ins.error.code !== '23505') throw ins.error
      if (!minute?.start_time) {
        await supabase.from('minute')
          .update({ start_time: nowAsPgTime(), end_time: null })
          .eq('id', id)
      }
      await doRefresh()
    } catch (e: any) {
      setOpErr(e?.message || 'No se pudo iniciar/reanudar.')
    } finally {
      setOpLoading(null)
    }
  }

  async function handlePause() {
    if (!id || !isOwner || !isRunning || opLoading) return
    setOpErr(null); setOpLoading('pause')
    try {
      const { error } = await supabase
        .from('minute_interval')
        .update({ ended_at: nowIso() })
        .eq('minute_id', id)
        .is('ended_at', null)
      if (error) throw error
      await doRefresh()
    } catch (e: any) {
      setOpErr(e?.message || 'No se pudo pausar.')
    } finally {
      setOpLoading(null)
    }
  }

  async function handleStop() {
    if (!id || !isOwner || hasEnded || opLoading) return
    setOpErr(null); setOpLoading('stop')
    try {
      await supabase
        .from('minute_interval')
        .update({ ended_at: nowIso() })
        .eq('minute_id', id)
        .is('ended_at', null)

      const { error: updErr } = await supabase
        .from('minute')
        .update({ end_time: nowAsPgTime() })
        .eq('id', id)
      if (updErr) throw updErr

      await doRefresh()

      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          'textarea[name="tareaRealizada"], textarea[name="tarea_realizada"]'
        )
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus()
      }, 120)
    } catch (e: any) {
      setOpErr(e?.message || 'No se pudo detener.')
    } finally {
      setOpLoading(null)
    }
  }

  // Guardado “tarea realizada” (debounce)
  // Nota: en BD también seteamos description por compatibilidad con vistas antiguas,
  // pero en cache local sólo actualizamos tarea_realizada (el tipo no incluye description).
  async function persistTarea(text: string) {
    if (!id) return
    const { error } = await supabase
      .from('minute')
      .update({ tarea_realizada: text, description: text })
      .eq('id', id)
    if (error) throw error
    await mutateMinute(
      (curr) => (curr ? ({ ...curr, tarea_realizada: text } as MinuteWithCreator) : curr),
      { revalidate: false }
    )
  }

  function scheduleSave(text: string, delay = 800) {
    if (tareaLocked) return
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    // @ts-ignore
    saveTimer.current = window.setTimeout(async () => {
      try { await persistTarea(text); setSaveState('saved') }
      catch { setSaveState('error') }
    }, delay)
  }
  function onTareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (tareaLocked) return
    const v = e.target.value
    setTareaText(v)
    mirrorTareaToMinuteForm(v)
    scheduleSave(v)
  }
  async function onTareaBlur() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!tareaLocked && saveState === 'saving') {
      try { await persistTarea(tareaText); setSaveState('saved') } catch { setSaveState('error') }
    }
  }
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }, [])

  // Render de estados iniciales/errores
  if (!id) {
    return (
      <SessionGate requireAuth>
        <Container className="py-4"><Alert variant="warning">ID de minuta no especificado.</Alert></Container>
      </SessionGate>
    )
  }
  if (minuteError || intervalsError) {
    return (
      <SessionGate requireAuth>
        <Container className="py-4"><Alert variant="danger">No se pudo cargar la minuta: {String((minuteError as any)?.message || minuteError || intervalsError)}</Alert></Container>
      </SessionGate>
    )
  }

  const { display: folioText } = resolveFolio({
    id: minute?.id ?? '',
    folio: (minute as any)?.folio,
    folio_serial: (minute as any)?.folio_serial,
  })
  const dateStr = minute?.date ? dayjs(minute.date).format('DD/MM/YYYY') : '—'
  const timeStr = `${toHHMM(minute?.start_time) || '—'} — ${toHHMM(minute?.end_time) || '—'}`

  // 🔒 Sólo el dueño y que además sea worker (no admin) puede editar
  const showOwnerEdit = !!minute && !!userId && minute.user_id === userId && !isAdminRole
  const canEditTarea = showOwnerEdit && !!minute?.end_time && !tareaLocked

  const statusBadge = hasEnded
    ? { text: 'Finalizado', variant: 'secondary' as const }
    : isRunning
      ? { text: 'En curso', variant: 'warning' as const }
      : hasStarted
        ? { text: 'En pausa', variant: 'info' as const }
        : { text: 'Sin iniciar', variant: 'secondary' as const }

  return (
    <SessionGate requireAuth>
      <Container className={ui.wrapper}>
        {(status === 'loading' || isMinuteLoading || isIntervalsLoading || roleLoading) && (
          <div className="py-4 d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Cargando…</span></div>
        )}

        {minute && (
          <>
            {/* HERO */}
            <div className={ui.hero}>
              <div className={ui.heroContent}>
                <div className={ui.breadcrumb}>
                  <Button variant="link" size="sm" className={ui.backBtn} onClick={() => router.back()} aria-label="Volver">
                    <FiArrowLeft /> Volver
                  </Button>
                </div>

                <div className={ui.titleRow}>
                  <h1 className={ui.title}>Detalle de minuta</h1>
                  <span className={ui.folioPill}><FiHash /> {folioText}</span>
                </div>

                <div className={ui.meta}>
                  <span className={ui.metaItem}><FiCalendar /> {dateStr}</span>
                  <span className={ui.metaItem}><FiClock /> {timeStr}</span>

                  {/* ADMIN/SUPER_ADMIN: mostrar Creador resuelto */}
                  {isAdminRole && (
                    <span className={ui.metaItem} title="Creador de la minuta">
                      <FiUser /> {minute.creator_display ?? '—'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CONTENIDO */}
            <Row className={ui.grid}>
              <Col lg={7} className="d-flex flex-column gap-3">
                {/* === TIMER ========================================================= */}
                <Card className={ui.card} id="timer" aria-label="Cronómetro">
                  <Card.Header className={ui.cardHeader}>
                    <span>Tiempo</span>
                    <Badge bg={statusBadge.variant} className={ui.badgePill}>
                      {statusBadge.text}
                    </Badge>
                  </Card.Header>
                  <Card.Body className="d-flex flex-column gap-2">
                    <div className="d-flex align-items-center gap-3">
                      <div><FiClock /> <strong>Duración:</strong> {durationHuman}</div>
                      <div className="text-muted small">({timeStr})</div>
                    </div>

                    {/* Controles del tiempo */}
                    {showOwnerEdit ? (
                      <div className="d-flex flex-wrap gap-2">
                        {!hasStarted && !hasEnded && (
                          <Button id="timer-start-btn" variant="success" onClick={() => handleStartOrResume('start')} disabled={opLoading !== null}>
                            {opLoading === 'start' ? <Spinner animation="border" size="sm" /> : <><FiPlay /> Start</>}
                          </Button>
                        )}

                        {isRunning && !hasEnded && (
                          <Button variant="warning" onClick={handlePause} disabled={opLoading !== null}>
                            {opLoading === 'pause' ? <Spinner animation="border" size="sm" /> : <><FiPause /> Pause</>}
                          </Button>
                        )}

                        {isPaused && !hasEnded && (
                          <Button variant="success" onClick={() => handleStartOrResume('resume')} disabled={opLoading !== null}>
                            {opLoading === 'resume' ? <Spinner animation="border" size="sm" /> : <><FiRotateCw /> Resume</>}
                          </Button>
                        )}

                        {hasStarted && !hasEnded && (
                          <Button variant="danger" onClick={handleStop} disabled={opLoading !== null}>
                            {opLoading === 'stop' ? <Spinner animation="border" size="sm" /> : <><FiSquare /> Stop</>}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted small">Solo lectura.</div>
                    )}

                    {opErr && <Alert className="mt-2 mb-0" variant="danger">{opErr}</Alert>}
                  </Card.Body>
                </Card>
                {/* === FIN TIMER ===================================================== */}

                <Card className={ui.card}>
                  <Card.Header className={ui.cardHeader}>
                    <span>Información básica</span>
                    <Badge bg="light" text="dark" title="Folio">#{folioText}</Badge>
                  </Card.Header>

                  {showOwnerEdit ? (
                    <Card.Body className={`${userUi.userFormScope} ${minute.end_time ? userUi.unlockTarea : ''}`}>
                      {/* Lock visual del campo interno */}
                      <LockTareaRealizada />

                      {/* Editor propio (mínimo ruido; bloqueo tras guardar final) */}
                      {(!tareaLocked && !!minute.end_time) && (
                        <div className="mb-3">
                          <label className="form-label">Tarea realizada</label>
                          <textarea
                            name="tareaRealizada"
                            className="form-control"
                            rows={6}
                            placeholder="Describe lo que realizaste…"
                            value={tareaText}
                            onChange={onTareaChange}
                            onBlur={onTareaBlur}
                            disabled={!canEditTarea}
                          />
                          <div className="form-text">
                            {saveState === 'saving' && 'Guardando…'}
                            {saveState === 'saved' && 'Guardado ✓'}
                            {saveState === 'error' && 'No se pudo guardar. Reintenta.'}
                          </div>
                        </div>
                      )}

                      {tareaLocked && (
                        <Alert variant="secondary" className="mb-3">
                          La <strong>tarea realizada</strong> fue guardada y ahora está bloqueada.
                        </Alert>
                      )}

                      {/* MinuteForm para resto de campos (oculto tarea/horas) */}
                      <div className="mm-hide-tarea mm-hide-hours">
                        <MinuteForm
                          mode="edit"
                          minuteId={minute.id}
                          onCancel={() => router.back()}
                          requireAttachmentOnCreate={false}
                          enableAutosave={true}
                          autosaveDelayMs={800}
                          initialValues={{
                            tarea_realizada: tareaValueServer,
                            novedades: (minute as any).novedades ?? '',
                          }}
                          ignoreTareaValidation={true}
                          tareaMirrorValue={tareaText}
                          onSaved={async () => {
                            setTareaLocked(true)
                            try { await supabase.from('minute').update({ tarea_cerrada: true }).eq('id', minute.id) } catch {}
                            await mutateMinute(undefined, { revalidate: true })
                          }}
                        />
                      </div>

                      {/* CSS local para ocultar el campo duplicado del MinuteForm y horas */}
                      <style jsx>{`
                        .mm-hide-tarea :global(label[for="tarea"]),
                        .mm-hide-tarea :global(#tarea) { display: none !important; }
                        .mm-hide-hours :global(input[type="time"]) { display: none !important; }
                        .mm-hide-hours :global(label[for="start_time"]),
                        .mm-hide-hours :global(label[for="end_time"]) { display: none !important; }
                      `}</style>
                    </Card.Body>
                  ) : (
                    <Card.Body>
                      <div className={ui.kvGrid} aria-label="Resumen de campos">
                        <div className={ui.k}><FiCalendar /> Fecha</div>
                        <div className={ui.v}>{dateStr}</div>
                        <div className={ui.k}><FiClock /> Horario</div>
                        <div className={ui.v}>{timeStr}</div>

                        {/* ADMIN/SUPER_ADMIN: mostrar creador también en la tarjeta */}
                        {isAdminRole && (
                          <>
                            <div className={ui.k}><FiUser /> Creador</div>
                            <div className={ui.v}>{minute.creator_display ?? <span className={ui.muted}>—</span>}</div>
                          </>
                        )}

                        <div className={ui.k}>Tarea realizada</div>
                        <div className={ui.v}>{tareaValueServer || <span className={ui.muted}>—</span>}</div>
                        <div className={ui.k}>Novedades</div>
                        <div className={ui.v}>{(minute as any).novedades || <span className={ui.muted}>—</span>}</div>
                      </div>
                    </Card.Body>
                  )}
                </Card>
              </Col>

              <Col lg={5} className="d-flex flex-column gap-3">
                <Card className={ui.card}>
                  <Card.Header className={ui.cardHeader}>
                    <span>Evidencias</span>
                    {showOwnerEdit ? (
                      <Badge bg="primary" className={ui.badgePill}>Habilitadas</Badge>
                    ) : (
                      <Badge bg="secondary" className={ui.badgePill}>Solo lectura</Badge>
                    )}
                  </Card.Header>
                  <Card.Body>
                    <AttachmentsList minuteId={minute.id} readOnly={!showOwnerEdit} />
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Container>
    </SessionGate>
  )
}
