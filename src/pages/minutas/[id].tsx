// src/pages/minutas/[id].tsx
/**
 * Detalle de minuta (ADMIN vs USUARIO)
 * - ADMIN: solo lectura + evidencias RO.
 * - USUARIO (dueño): puede adjuntar evidencias y editar Novedades.
 *
 * ✅ “Tarea realizada”:
 *   - Editor propio y controlado cuando end_time existe.
 *   - Guardado con debounce a ambas columnas (tarea_realizada/description).
 *   - Mirroring al MinuteForm para que su validación no falle.
 *   - 🚫 Tras pulsar Guardar, el campo queda BLOQUEADO.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { Container, Row, Col, Spinner, Alert, Card, Button, Badge } from 'react-bootstrap'
import { FiHash, FiCalendar, FiClock, FiArrowLeft, FiPlay, FiSquare } from 'react-icons/fi'
import { supabase } from '@/lib/supabaseClient'
import AttachmentsList from '@/components/AttachmentsList'
import MinuteForm from '@/components/MinuteForm'
import { resolveFolio } from '@/lib/folio'
import ui from '@/styles/MinuteDetail.module.css'
import userUi from '@/styles/MinuteFormUser.module.css'
import LockTareaRealizada from '@/components/LockTareaRealizada'

const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

type MinuteRow = {
  id: string
  date?: string | null
  start_time?: string | null // TIME
  end_time?: string | null   // TIME
  tarea_realizada?: string | null
  novedades?: string | null
  description?: string | null
  notes?: string | null
  user_id: string
  folio?: string | number | null
  folio_serial?: string | number | null
}

/* ==================== Utils tiempo ==================== */
function toHHMM(value?: string | null): string {
  if (!value) return ''
  const s = String(value).trim()
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : ''
}
function nowAsPgTime(): string { return dayjs().format('HH:mm:ss') }
function normalizePgTime(t?: string | null): string | null {
  if (!t) return null
  const s = String(t).trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  const d = dayjs(s); return d.isValid() ? d.format('HH:mm:ss') : null
}
function humanDiff(dateISO?: string | null, start?: string | null, end?: string | null): string {
  const nS = normalizePgTime(start); if (!dateISO || !nS) return '—'
  const nE = normalizePgTime(end)
  const sDT = dayjs(`${dateISO}T${nS}`)
  let eDT = nE ? dayjs(`${dateISO}T${nE}`) : dayjs()
  if (eDT.isBefore(sDT)) eDT = eDT.add(1, 'day')
  const mins = Math.max(0, eDT.diff(sDT, 'minute'))
  const h = Math.floor(mins / 60), m = mins % 60
  return h === 0 ? `${m}m` : `${h}h ${m}m`
}

/* ==================== Data ==================== */
async function fetchMinuteById(_key: string, id: string): Promise<MinuteRow> {
  const { data: row, error } = await supabase
    .from('minute')
    .select('id,date,start_time,end_time,tarea_realizada,novedades,description,notes,user_id,folio,folio_serial')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('Minuta no encontrada')
  return row as unknown as MinuteRow
}

/* ==================== UX helpers ==================== */
function useFocusTimerOnHash() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#timer') return
    const t = window.setTimeout(() => {
      const root = document.getElementById('timer')
      root?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const startBtn = document.getElementById('timer-start-btn') as HTMLButtonElement | null
      startBtn?.focus()
    }, 60)
    return () => window.clearTimeout(t)
  }, [])
}
function tareaFrom(row?: MinuteRow | null): string {
  if (!row) return ''
  return (row.tarea_realizada ?? row.description ?? '') as string
}
/** Espeja al textarea interno del MinuteForm para pasar validaciones */
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

export default function MinuteDetailPage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const swrKey = id ? (['minute', id] as const) : null

  const { data: minute, isLoading, error, mutate } = useSWR<MinuteRow>(
    swrKey,
    ([_tag, theId]) => fetchMinuteById(String(_tag), String(theId)),
    { revalidateOnFocus: false }
  )

  // sesión
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSessionEmail(data?.user?.email ?? null)
      setSessionUserId(data?.user?.id ?? null)
    })
  }, [])

  const isAdmin = useMemo(() => sessionEmail === ADMIN_EMAIL, [sessionEmail])
  const isOwner = useMemo(
    () => !!minute && !!sessionUserId && minute.user_id === sessionUserId,
    [minute, sessionUserId]
  )

  const tareaValueServer = useMemo(() => tareaFrom(minute), [minute])
  const [tareaText, setTareaText] = useState<string>('')
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const saveTimer = useRef<number | null>(null)
  const [tareaLocked, setTareaLocked] = useState(false) // bloquear tras guardar

  // init editor
  useEffect(() => {
    const initial = tareaValueServer ?? ''
    setTareaText(initial)
    setSaveState('idle')
    mirrorTareaToMinuteForm(initial)
    setTareaLocked(false)
  }, [minute?.id])

  useFocusTimerOnHash()

  // 🚫 Fallback extra: deshabilitar/ocultar cualquier input[type="time"] dentro del form
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

  // Start/Stop
  const [opErr, setOpErr] = useState<string | null>(null)
  const [opLoading, setOpLoading] = useState<'start' | 'stop' | null>(null)

  async function handleStart() {
    if (!id || !isOwner || opLoading) return
    setOpErr(null); setOpLoading('start')
    try {
      const { error: updErr } = await supabase.from('minute')
        .update({ start_time: nowAsPgTime(), end_time: null })
        .eq('id', id)
      if (updErr) throw updErr
      await mutate()
    } catch (e: any) {
      setOpErr(e?.message || 'No se pudo iniciar el tiempo.')
    } finally {
      setOpLoading(null)
    }
  }

  async function handleStop() {
    if (!id || !isOwner || opLoading) return
    setOpErr(null); setOpLoading('stop')
    try {
      const { error: updErr } = await supabase.from('minute')
        .update({ end_time: nowAsPgTime() })
        .eq('id', id)
      if (updErr) throw updErr
      await mutate()
      // focus al editor
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          'textarea[name="tareaRealizada"], textarea[name="tarea_realizada"]'
        )
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus()
      }, 100)
    } catch (e: any) {
      setOpErr(e?.message || 'No se pudo detener el tiempo.')
    } finally {
      setOpLoading(null)
    }
  }

  // guardar tarea (debounced)
  async function persistTarea(text: string) {
    if (!id) return
    const { error } = await supabase
      .from('minute')
      .update({ tarea_realizada: text, description: text })
      .eq('id', id)
    if (error) throw error
    await mutate({ ...(minute as MinuteRow), tarea_realizada: text, description: text }, { revalidate: false })
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

  if (!id) return <Container className="py-4"><Alert variant="warning">ID de minuta no especificado.</Alert></Container>
  if (isLoading) return <Container className="py-5 d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Cargando minuta…</span></Container>
  if (error) return <Container className="py-4"><Alert variant="danger">No se pudo cargar la minuta: {String((error as any)?.message || error)}</Alert></Container>
  if (!minute) return <Container className="py-4"><Alert variant="secondary">Minuta no encontrada.</Alert></Container>

  const { display: folioText } = resolveFolio({
    id: minute.id,
    folio: minute.folio as any,
    folio_serial: minute.folio_serial as any,
  })
  const dateStr = minute.date ? dayjs(minute.date).format('DD/MM/YYYY') : '—'
  const timeStr = `${toHHMM(minute.start_time) || '—'} — ${toHHMM(minute.end_time) || '—'}`
  const durStr = humanDiff(minute.date ?? null, minute.start_time, minute.end_time)

  const showOwnerEdit = isOwner && !isAdmin
  const canEditTarea = showOwnerEdit && !!minute.end_time && !tareaLocked

  return (
    <Container className={ui.wrapper}>
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
              <Badge bg={minute.start_time && !minute.end_time ? 'warning' : 'secondary'} className={ui.badgePill}>
                {minute.start_time ? (minute.end_time ? 'Finalizado' : 'En curso') : 'Sin iniciar'}
              </Badge>
            </Card.Header>
            <Card.Body className="d-flex flex-column gap-2">
              <div className="d-flex align-items-center gap-3">
                <div><FiClock /> <strong>Duración:</strong> {durStr}</div>
                <div className="text-muted small">({timeStr})</div>
              </div>

              {/* ⏯️ Controles Start/Stop (solo dueño) */}
              {showOwnerEdit ? (
                <div className="d-flex gap-2">
                  {!minute.start_time && (
                    <Button id="timer-start-btn" variant="success" onClick={handleStart} disabled={opLoading !== null}>
                      {opLoading === 'start' ? <Spinner animation="border" size="sm" /> : <><FiPlay /> Start</>}
                    </Button>
                  )}
                  {!!minute.start_time && !minute.end_time && (
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

                {/* ✅ Editor propio (único visible) */}
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

                {/* MinuteForm para el resto de campos
                    (ocultamos su campo "tarea" y CUALQUIER input de hora) */}
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
                      novedades: minute.novedades ?? '',
                    }}
                    ignoreTareaValidation={true}
                    tareaMirrorValue={tareaText}
                    onSaved={async () => {
                      setTareaLocked(true)
                      try { await supabase.from('minute').update({ tarea_cerrada: true }).eq('id', minute.id) } catch {}
                      await mutate(undefined, { revalidate: true })
                    }}
                  />
                </div>

                {/* CSS local para ocultar el campo duplicado del MinuteForm
                   y cualquier input/label de hora */}
                <style jsx>{`
                  /* Oculta el campo "tarea" del MinuteForm */
                  .mm-hide-tarea :global(label[for="tarea"]),
                  .mm-hide-tarea :global(#tarea) {
                    display: none !important;
                  }

                  /* 🚫 Oculta inputs de hora (start/end) que el MinuteForm pudiera renderizar */
                  .mm-hide-hours :global(input[type="time"]) {
                    display: none !important;
                  }
                  /* Oculta labels típicos de hora (tolerante a ids/for comunes) */
                  .mm-hide-hours :global(label[for="start_time"]),
                  .mm-hide-hours :global(label[for="end_time"]) {
                    display: none !important;
                  }
                `}</style>
              </Card.Body>
            ) : (
              <Card.Body>
                <div className={ui.kvGrid} aria-label="Resumen de campos">
                  <div className={ui.k}><FiCalendar /> Fecha</div><div className={ui.v}>{dateStr}</div>
                  <div className={ui.k}><FiClock /> Horario</div><div className={ui.v}>{timeStr}</div>
                  <div className={ui.k}>Tarea realizada</div>
                  <div className={ui.v}>{tareaValueServer || <span className={ui.muted}>—</span>}</div>
                  <div className={ui.k}>Novedades</div>
                  <div className={ui.v}>{minute.novedades || <span className={ui.muted}>—</span>}</div>
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
    </Container>
  )
}
