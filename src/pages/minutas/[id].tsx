// src/pages/minutas/[id].tsx
/**
 * Detalle de minuta (ADMIN vs USUARIO)
 * - ADMIN (operaciones@multi-impresos.com): solo lectura + evidencias readOnly.
 * - USUARIO (dueño de la minuta): puede adjuntar evidencias y editar "Novedades";
 *   "Tarea realizada" BLOQUEADA (readonly) usando LockTareaRealizada + tu CSS.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { Container, Row, Col, Spinner, Alert, Card, Button, Badge } from 'react-bootstrap'
import { FiHash, FiCalendar, FiClock, FiArrowLeft } from 'react-icons/fi'
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
  start_time?: string | null
  end_time?: string | null
  tarea_realizada?: string | null
  novedades?: string | null
  description?: string | null
  notes?: string | null
  user_id: string
  folio?: string | number | null
  folio_serial?: string | number | null
}

/** Normaliza a "HH:mm" (acepta "HH:mm", "HH:mm:ss" o ISO) */
function toHHMM(value?: string | null): string {
  if (!value) return ''
  const s = String(value).trim()
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : ''
}

async function fetchMinuteById(_key: string, id: string): Promise<MinuteRow> {
  const { data: row, error: pgErr } = await supabase
    .from('minute')
    .select([
      'id',
      'date',
      'start_time',
      'end_time',
      'tarea_realizada',
      'novedades',
      'description',
      'notes',
      'user_id',
      'folio',
      'folio_serial',
    ].join(', '))
    .eq('id', id)
    .single()

  if (pgErr) throw new Error(pgErr.message)
  if (!row) throw new Error('Minuta no encontrada')
  return row as unknown as MinuteRow
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

  // Sesión actual para decidir ADMIN vs USUARIO (dueño)
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

  // Branches
  const showOwnerEdit = isOwner && !isAdmin
  const showReadOnly = !showOwnerEdit // Admin u otro → solo lectura

  return (
    <Container className={ui.wrapper}>
      {/* HERO con branding en #009ada, ID original oculto */}
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
          <Card className={ui.card}>
            <Card.Header className={ui.cardHeader}>
              <span>Información básica</span>
              <Badge bg="light" text="dark" title="Folio">#{folioText}</Badge>
            </Card.Header>
            {showOwnerEdit ? (
              <Card.Body className={userUi.userFormScope}>
                {/* 🔒 Bloquea "Tarea realizada" visual/funcionalmente */}
                <LockTareaRealizada />

                <MinuteForm
                  mode="edit"
                  minuteId={minute.id}
                  onCancel={() => router.back()}
                  requireAttachmentOnCreate={false}
                  enableAutosave={true}
                  autosaveDelayMs={800}
                  initialValues={
                    ({
                      startTime: toHHMM(minute.start_time),
                      endTime: toHHMM(minute.end_time),
                      tareaRealizada: minute.tarea_realizada ?? '',
                      novedades: minute.novedades ?? '',
                    } as any)
                  }
                  onSaved={(updated: any) => mutate(updated, { revalidate: false })}
                />

                {/* Datos de referencia bajo el form */}
                <div className="small text-muted mt-2">
                  <div><strong>Fecha:</strong> {dateStr}</div>
                  <div><strong>Horario:</strong> {timeStr}</div>
                </div>
              </Card.Body>
            ) : (
              <Card.Body>
                {/* SOLO LECTURA (Admin / no dueño) */}
                <div className={ui.kvGrid} aria-label="Resumen de campos">
                  <div className={ui.k}><FiCalendar /> Fecha</div><div className={ui.v}>{dateStr}</div>
                  <div className={ui.k}><FiClock /> Horario</div><div className={ui.v}>{timeStr}</div>
                  <div className={ui.k}>Tarea realizada</div><div className={ui.v}>{minute.tarea_realizada || <span className={ui.muted}>—</span>}</div>
                  <div className={ui.k}>Novedades</div><div className={ui.v}>{minute.novedades || <span className={ui.muted}>—</span>}</div>
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
              {/* Usuario dueño puede adjuntar; admin/otros solo ver */}
              <AttachmentsList minuteId={minute.id} readOnly={!showOwnerEdit} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
