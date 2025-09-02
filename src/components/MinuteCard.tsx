// src/components/MinuteCard.tsx
/**
 * MinuteCard
 * ============================================================================
 * Tarjeta compacta para listar minutas con acciones contextuales.
 *
 * Objetivos (confirmados):
 * - PASO 2 (Admin): NO montar controles de evidencias. Solo muestra conteo.
 *   Si `evidenceReadOnly=true`, comunica “Solo lectura” en la UI.
 * - PASO 3 (Usuario): NO permitir eliminar si `canDelete=false` (aunque mode='edit').
 *
 * Accesibilidad:
 * - Badge de adjuntos con aria-label descriptivo y texto alterno cuando es solo lectura.
 *
 * Navegación:
 * - Si se pasa `viewHref`, el botón “Ver detalles” se renderiza como <a> (ancla real).
 * - Si NO hay `viewHref`, usa `onView(minuta.id)` (SPA).
 *
 * FOLIO:
 * - Usa resolveFolio(minuta).display para pintar siempre el valor correcto.
 * - Se tolera `folio_serial` como string|number (cast intencional "as any").
 *
 * Seguridad/UX:
 * - Este componente NO permite agregar evidencias (Admin). Solo muestra conteo.
 * - Botón “Eliminar” condicionado por `canDelete` (default true). Si es false, no se muestra.
 *
 * QA:
 * - Incluye data-testid en acciones clave para pruebas automáticas.
 */

import React from 'react'
import { Card, Button, Badge } from 'react-bootstrap'
import dayjs from 'dayjs'
import { resolveFolio } from '@/lib/folio'

/** Datos mínimos esperados por la tarjeta. */
export type MinuteCardData = {
  id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
  description?: string | null
  notes?: string | null
  adjuntos?: number
  user_name?: string
  // Tolerante: en históricos podría venir como string o number.
  folio?: string | number | null
  folio_serial?: string | number | null
}

/** Props del componente. */
export type MinuteCardProps = {
  /** Minuta a renderizar. */
  minuta: MinuteCardData

  /**
   * Modo de acciones:
   * - 'read': solo “Ver detalles”.
   * - 'edit': “Ver detalles” + “Editar” (+ “Eliminar” si canDelete=true).
   * - 'view-only': sin acciones (solo lectura).
   */
  mode?: 'read' | 'edit' | 'view-only'

  /**
   * Si TRUE, comunica que las evidencias son solo lectura (Admin).
   * Solo afecta presentación (no monta controles de evidencias).
   */
  evidenceReadOnly?: boolean

  /**
   * Href para abrir detalle con ancla real (recomendado en Admin).
   * Si no se provee, usa navegación SPA vía `onView`.
   */
  viewHref?: string

  /** Navegación SPA a detalle (si no hay viewHref). */
  onView?: (id: string) => void

  /** Editar (solo si mode==='edit'). */
  onEdit?: (id: string) => void

  /**
   * Eliminar (solo si mode==='edit').
   * Se omite visualmente si `canDelete=false` (PASO 3).
   */
  onDelete?: (id: string) => void

  /**
   * PASO 3: controla visibilidad de “Eliminar” cuando mode==='edit'.
   * - true (default): muestra “Eliminar” si existe `onDelete`.
   * - false: oculta “Eliminar” para impedirlo en vista de usuario.
   */
  canDelete?: boolean
}

/** Normaliza un valor “HH:mm:ss”/ISO a “HH:mm”; tolerante a strings comunes. */
function toHHMM(value?: string | null): string | null {
  if (!value) return null
  const s = String(value).trim()
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : null
}

/** Construye el rango “HH:mm — HH:mm” o placeholder accesible. */
function timeRange(start?: string | null, end?: string | null): string {
  const s = toHHMM(start)
  const e = toHHMM(end)
  return s && e ? `${s} — ${e}` : '— — —'
}

/** Formatea fecha a “DD/MM/YYYY” con fallback legible. */
function fmtDate(value?: string): string {
  if (!value) return 'Sin fecha'
  const d = dayjs(value)
  return d.isValid() ? d.format('DD/MM/YYYY') : 'Sin fecha'
}

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
  // Derivados de presentación
  const fechaStr = fmtDate(minuta.date)
  const rango = timeRange(minuta.start_time, minuta.end_time)
  const countAdj = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0
  const desc = (minuta.description ?? '').trim() || 'Sin descripción'

  // FOLIO SIEMPRE CORRECTO: usamos .display; cast “as any” tolera tipos mixtos.
  const { display: folioText } = resolveFolio(minuta as any)

  // Texto accesible para badge de adjuntos
  const adjuntosAria = evidenceReadOnly
    ? `${countAdj} adjuntos (solo lectura)`
    : `${countAdj} adjunto${countAdj !== 1 ? 's' : ''}`

  return (
    <Card className="h-100 shadow-sm" data-testid="minute-card">
      <Card.Body>
        {/* Encabezado: fecha + rango + folio + badge “solo lectura” si aplica */}
        <Card.Title className="mb-1 d-flex flex-wrap align-items-center gap-2">
          <span>
            <strong>{fechaStr}</strong> · {rango}{' '}
            <span aria-label="Folio" title="Folio">· #{folioText}</span>
          </span>

          {evidenceReadOnly && (
            <Badge
              bg="secondary"
              title="Evidencias en solo lectura"
              data-testid="badge-readonly"
            >
              Solo lectura
            </Badge>
          )}
        </Card.Title>

        {/* Autor (si viene) */}
        {minuta.user_name && (
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            Registrado por: <strong>{minuta.user_name}</strong>
          </p>
        )}

        {/* Descripción */}
        <Card.Text className="mb-2">{desc}</Card.Text>

        {/* Conteo de adjuntos (sin controles de evidencia) */}
        <Badge
          bg="light"
          text="dark"
          aria-label={adjuntosAria}
          title={adjuntosAria}
          data-testid="badge-attachments"
        >
          {countAdj} adjunto{countAdj !== 1 ? 's' : ''}{evidenceReadOnly ? ' · solo lectura' : ''}
        </Badge>
      </Card.Body>

      {/* Acciones */}
      <Card.Footer className="bg-white border-top-0 d-flex flex-wrap gap-2">
        {mode !== 'view-only' && (
          <>
            {viewHref ? (
              // Ancla real (recomendado en Admin para robustez de navegación)
              <Button
                as="a"
                href={viewHref}
                variant="primary"
                size="sm"
                aria-label={evidenceReadOnly ? 'Ver detalles (solo lectura de evidencias)' : 'Ver detalles'}
                data-testid="btn-view"
              >
                Ver detalles
              </Button>
            ) : (
              // Fallback SPA si no hay viewHref
              onView && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onView(minuta.id)}
                  aria-label={evidenceReadOnly ? 'Ver detalles (solo lectura de evidencias)' : 'Ver detalles'}
                  data-testid="btn-view"
                >
                  Ver detalles
                </Button>
              )
            )}
          </>
        )}

        {mode === 'edit' && (
          <>
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(minuta.id)}
                data-testid="btn-edit"
              >
                Editar
              </Button>
            )}

            {/* PASO 3: si canDelete=false, NO se renderiza el botón “Eliminar” */}
            {onDelete && canDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(minuta.id)}
                data-testid="btn-delete"
              >
                Eliminar
              </Button>
            )}
          </>
        )}
      </Card.Footer>
    </Card>
  )
}
