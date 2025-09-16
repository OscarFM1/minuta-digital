/**
 * MinuteCard
 * Tarjeta compacta para listar minutas con acciones contextuales.
 */

import React from 'react'
import { Card, Button, Badge } from 'react-bootstrap'
import dayjs from 'dayjs'
import { resolveFolio } from '@/lib/folio'
import styles from '@/styles/Minutas.module.css' // ✅ CSS Module correcto

export type MinuteCardData = {
  id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
  description?: string | null
  notes?: string | null
  adjuntos?: number
  user_name?: string
  folio?: string | number | null
  folio_serial?: string | number | null
}

export type MinuteCardProps = {
  minuta: MinuteCardData
  mode?: 'read' | 'edit' | 'view-only'
  evidenceReadOnly?: boolean
  viewHref?: string
  onView?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  canDelete?: boolean
}

function toHHMM(value?: string | null): string | null {
  if (!value) return null
  const s = String(value).trim()
  const m = /^\d{2}:\d{2}/.exec(s)
  if (m) return m[0]
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : null
}

function timeRange(start?: string | null, end?: string | null): string {
  const s = toHHMM(start)
  const e = toHHMM(end)
  return s && e ? `${s} — ${e}` : '— — —'
}

function fmtDate(v?: string): string {
  if (!v) return 'Sin fecha'
  const d = dayjs(v)
  return d.isValid() ? d.format('DD/MM/YYYY') : 'Sin fecha'
}

const safe = (v: unknown) => String(v ?? '').trim()

export default function MinuteCard({
  minuta,
  mode = 'read',
  evidenceReadOnly = false,
  viewHref,
  onView,
  onEdit,
  onDelete,
  canDelete = true,
}: MinuteCardProps) {
  const fechaStr = fmtDate(minuta.date)
  const rango = timeRange(minuta.start_time, minuta.end_time)
  const countAdj = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0

  const titleText = safe(
    minuta.description ??
    (minuta as any)?.title ??
    (minuta as any)?.tarea_realizada ??
    (minuta as any)?.task_done
  )

  const taskText = safe(
    (minuta as any)?.tarea_realizada ??
    (minuta as any)?.task_done ??
    minuta.notes ??
    (minuta as any)?.novedades
  )

  const { display: folioText } = resolveFolio(minuta as any)

  const adjuntosAria = evidenceReadOnly
    ? `${countAdj} adjuntos (solo lectura)`
    : `${countAdj} adjunto${countAdj !== 1 ? 's' : ''}`

  return (
    <Card className="h-100 shadow-sm" data-testid="minute-card">
      <Card.Body>
        <Card.Title className="mb-1 d-flex flex-wrap align-items-center gap-2">
          <span>
            <strong>{fechaStr}</strong> · {rango}{' '}
            <span aria-label="Folio" title="Folio">· #{folioText}</span>
          </span>

          {evidenceReadOnly && (
            <Badge bg="secondary" title="Evidencias en solo lectura" data-testid="badge-readonly">
              Solo lectura
            </Badge>
          )}
        </Card.Title>

        {minuta.user_name && (
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            Registrado por: <strong>{minuta.user_name}</strong>
          </p>
        )}

        <div className={styles.fieldBlock}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Descripción / Título</div>
            <div className={styles.titleValue}>{titleText || '—'}</div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Tarea realizada</div>
            <div className={styles.taskValue}>{taskText || '—'}</div>
          </div>
        </div>

        <Badge
          bg="light"
          text="dark"
          aria-label={adjuntosAria}
          title={adjuntosAria}
          data-testid="badge-attachments"
          className="mt-2"
        >
          {countAdj} adjunto{countAdj !== 1 ? 's' : ''}{evidenceReadOnly ? ' · solo lectura' : ''}
        </Badge>
      </Card.Body>

      <Card.Footer className="bg-white border-top-0 d-flex flex-wrap gap-2">
        {mode !== 'view-only' && (
          <>
            {viewHref ? (
              <Button as="a" href={viewHref} variant="primary" size="sm" data-testid="btn-view">
                Ver detalles
              </Button>
            ) : (
              onView && (
                <Button variant="primary" size="sm" onClick={() => onView(minuta.id)} data-testid="btn-view">
                  Ver detalles
                </Button>
              )
            )}
          </>
        )}

        {mode === 'edit' && (
          <>
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(minuta.id)} data-testid="btn-edit">
                Editar
              </Button>
            )}
            {onDelete && canDelete && (
              <Button variant="danger" size="sm" onClick={() => onDelete(minuta.id)} data-testid="btn-delete">
                Eliminar
              </Button>
            )}
          </>
        )}
      </Card.Footer>
    </Card>
  )
}
