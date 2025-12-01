// src/pages/minutas/[id].tsx
/**
 * Detalle de minuta — con Pause/Resume basado en intervalos.
 * ============================================================================ 
 * Se añade suscripción realtime para refrescar detalle automáticamente
 * cuando cambien los datos de esa minuta en la tabla `minute`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
  Container,
  Row,
  Col,
  Spinner,
  Alert,
  Card,
  Button,
  Badge,
} from 'react-bootstrap'
import {
  FiHash,
  FiCalendar,
  FiClock,
  FiArrowLeft,
  FiPlay,
  FiPause,
  FiRotateCw,
  FiSquare,
  FiUser,
} from 'react-icons/fi'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import SessionGate from '@/components/SessionGate'
import AttachmentsList from '@/components/AttachmentsList'
import MinuteForm from '@/components/MinuteForm'
import { resolveFolio } from '@/lib/folio'
import ui from '@/styles/MinuteDetail.module.css'
import userUi from '@/styles/MinuteFormUser.module.css'
import LockTareaRealizada from '@/components/LockTareaRealizada'
import {
  getMinuteByIdWithCreator,
  type MinuteWithCreator,
} from '@/lib/minutes'
import { useRole } from '@/hooks/useRole'
import { WORK_TYPE_LABEL } from '@/types/minute'

type IntervalRow = {
  id: string
  minute_id: string
  started_at: string
  ended_at: string | null
}

/** Extensión local del tipo para incluir campos opcionales usados en UI. */
type MinuteForUI = MinuteWithCreator & {
  description?: string | null
  novedades?: string | null
  tarea_realizada?: string | null
  task_done?: string | null
  work_type?: string | null
}

/* ==================== Helpers ==================== */

function toHHMM(value?: string | null): string {
  if (!value) return ''
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(value)
  return d.isValid() ? d.format('HH:mm') : ''
}
function nowAsPgTime() {
  return dayjs().format('HH:mm:ss')
}
function fmtDurationFromSeconds(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${secs}s`
}
function mirrorTareaToMinuteForm(text: string) {
  document
    .querySelectorAll<HTMLTextAreaElement>(
      'textarea[name="tareaRealizada"], textarea[name="tarea_realizada"]'
    )
    .forEach((el) => {
      const pd = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )
      pd?.set?.call(el, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

/* ==================== Data Fetch ==================== */

async function fetchIntervals(
  _tag: string,
  minuteId: string
): Promise<IntervalRow[]> {
  const { data, error } = await supabase
    .from('minute_interval')
    .select('id, minute_id, started_at, ended_at')
    .eq('minute_id', minuteId)
    .order('started_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
function sumIntervalsSeconds(intervals: IntervalRow[]): number {
  return intervals.reduce((acc, it) => {
    const start = dayjs(it.started_at)
    const end = it.ended_at ? dayjs(it.ended_at) : dayjs()
    return acc + Math.max(0, end.diff(start, 'second'))
  }, 0)
}

/* ==================== Page Component ==================== */

export default function MinuteDetailPage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const { status, user } = useAuth()
  const userId = user?.id ?? null

  // Roles
  const { loading: roleLoading, canWriteMinutes } = useRole()
  const isAdminRole = !roleLoading && !canWriteMinutes

// SWR: minute + intervals
const minuteKey =
  id && status === 'authenticated'
    ? (['minute-with-creator', id] as const)
    : null

const {
  data: minuteRaw,
  isLoading: isMinuteLoading,
  error: minuteError,
  mutate: mutateMinute,
} = useSWR<MinuteWithCreator | null>(
  minuteKey,
  // forzamos que key sea [string, string]
  ([, theId]: [string, string]) => getMinuteByIdWithCreator(theId),
  { revalidateOnFocus: false }
)

const minute = (minuteRaw ?? undefined) as MinuteForUI | undefined

const intervalsKey =
  id && status === 'authenticated'
    ? (['intervals', id] as const)
    : null

const {
  data: intervals,
  isLoading: isIntervalsLoading,
  error: intervalsError,
  mutate: mutateIntervals,
} = useSWR<IntervalRow[]>(
  intervalsKey,
  // idem: le decimos que key es [string, string]
  ([_tag, theId]: [string, string]) => fetchIntervals(_tag, theId),
  { revalidateOnFocus: true }
)



  // === NUEVO: suscripción realtime solo para esta minuta ===
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`minute-detail-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'minute',
          filter: `id=eq.${id}`,
        },
        () => {
          // refresca ambos SWR
          mutateMinute()
          mutateIntervals()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, mutateMinute, mutateIntervals])
  // ==========================================================

  // Derivados de estado
  const isOwner = !!minute && minute.user_id === userId
  const hasStarted =
    (intervals?.length ?? 0) > 0 || !!minute?.start_time
  const hasEnded = !!minute?.end_time
  const activeInterval =
    intervals?.find((it) => it.ended_at === null) ?? null
  const isRunning = !!activeInterval && !hasEnded
  const isPaused = hasStarted && !isRunning && !hasEnded

  const totalSeconds = sumIntervalsSeconds(intervals ?? [])
  const durationHuman = fmtDurationFromSeconds(totalSeconds)

  // Tarea realizada (debounce + mirror)
  const tareaValueServer = minute?.tarea_realizada ?? ''
  const [tareaText, setTareaText] = useState(tareaValueServer)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const saveTimer = useRef<number | null>(null)
  const [tareaLocked, setTareaLocked] = useState(false)

  useEffect(() => {
    setTareaText(tareaValueServer)
    setSaveState('idle')
    mirrorTareaToMinuteForm(tareaValueServer)
    setTareaLocked(false)
  }, [minute?.id])

  // Oculta inputs de hora en el formulario embebido
  useEffect(() => {
    const scope = document.querySelector(`.${userUi.userFormScope}`)
    scope?.querySelectorAll('input[type="time"]').forEach((el) => {
      const inp = el as HTMLInputElement
      inp.disabled = true
      inp.readOnly = true
      inp.style.display = 'none'
    })
  }, [minute?.id])

  // Operaciones start/pause/resume/stop (igual que antes) …
  // …
  // (se omiten aquí por brevedad, no cambian)

  // Guardado tarea (igual que antes) …

  // Render estados iniciales/errores
  if (!id) {
    return (
      <SessionGate requireAuth>
        <Container className="py-4">
          <Alert variant="warning">ID de minuta no especificado.</Alert>
        </Container>
      </SessionGate>
    )
  }
  if (minuteError || intervalsError) {
    return (
      <SessionGate requireAuth>
        <Container className="py-4">
          <Alert variant="danger">
            No se pudo cargar la minuta:{' '}
            {String((minuteError as any)?.message ?? intervalsError)}
          </Alert>
        </Container>
      </SessionGate>
    )
  }

  // (Resto del JSX queda igual que antes, sin cambios)
  // …

  return (
    <SessionGate requireAuth>
      <Container className={ui.wrapper}>
        {/* loading spinner */}
        {(status === 'loading' ||
          isMinuteLoading ||
          isIntervalsLoading ||
          roleLoading) && (
          <div className="py-4 d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" />
            <span>Cargando…</span>
          </div>
        )}

        {/* contenido */}
        {/* … */}
      </Container>
    </SessionGate>
  )
}
