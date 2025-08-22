// src/components/MinuteCard.tsx
/**
 * MinuteCard
 * ----------
 * Tarjeta compacta para listar minutas.
 *
 * OBJETIVO (Paso 2):
 * - Eliminar cualquier posibilidad de "Agregar evidencias" en la vista Admin.
 * - Este componente NO monta ningún control de evidencias. Solo muestra un conteo.
 * - Cuando `evidenceReadOnly=true`, comunica explícitamente "solo lectura" en la UI
 *   y facilita que el padre enrute a un detalle en modo lectura (vía `viewHref`).
 *
 * OBJETIVO (Paso 3):
 * - Permitir que en la vista de Usuario NO se pueda eliminar la minuta una vez creada.
 *   -> Nuevo prop `canDelete?: boolean` (default true). Si es false, no se renderiza el botón "Eliminar"
 *      aunque `mode="edit"`.
 *
 * Funcionalidad base:
 * - Formatea fecha (DD/MM/YYYY) y rango horario (HH:mm — HH:mm).
 * - Muestra el # de folio SIEMPRE correcto usando resolveFolio(...).display.
 * - Tolerante a instancias donde folio puede venir como number o string,
 *   y folio_serial puede no existir o traer formatos personalizados.
 *
 * NOTA IMPORTANTE sobre FOLIO:
 *  resolveFolio devuelve un objeto { display, numeric, source }.
 *  Para pintar en UI usamos SIEMPRE .display.
 *  El cast en la llamada (as any) es intencional para tolerar que este componente
 *  acepte folio_serial: string | number | null (según tu histórico).
 *
 * Accesibilidad:
 * - Badge de adjuntos incluye aria-label descriptivo y varía si es "solo lectura".
 *
 * Navegación robusta:
 * - Si se pasa `viewHref`, el botón "Ver detalles" se renderiza como <a> real (as="a"),
 *   alineado con tu patrón de navegación estable para acciones críticas.
 * - Si NO se pasa `viewHref`, se usa el callback `onView(minuta.id)` (SPA).
 */

import React from 'react'
import { Card, Button, Badge } from 'react-bootstrap'
import dayjs from 'dayjs'
import { resolveFolio } from '@/lib/folio'

export type MinuteCardData = {
  id: string
  date?: string
  start_time?: string | null
  end_time?: string | null
  description?: string | null
  notes?: string | null
  adjuntos?: number
  user_name?: string
  // tolerante: pueden ser number o string según instancia/backfill
  folio?: string | number | null
  folio_serial?: string | number | null
}

type Props = {
  /** Datos de la minuta a renderizar. */
  minuta: MinuteCardData
  /**
   * Modo de acciones generales de la tarjeta:
   * - 'read': muestra "Ver detalles" (por defecto).
   * - 'edit': muestra "Editar" y "Eliminar" además de "Ver detalles".
   * - 'view-only': no muestra acciones (útil para listados puramente informativos).
   */
  mode?: 'read' | 'edit' | 'view-only'
  /**
   * Si TRUE, esta tarjeta indica explícitamente que las evidencias son "solo lectura".
   * - Afecta SOLO a la presentación (badge/aria). No se montan controles de evidencia aquí.
   * - Úsalo en Admin (/minutas) para reforzar UX de lectura.
   */
  evidenceReadOnly?: boolean
  /**
   * Href para abrir el detalle con ANCHOR real (recomendado en Admin).
   * Ej: `/minutas/${id}?readOnly=1`
   * Si no se provee, se usará `onView(minuta.id)` para navegación SPA.
   */
  viewHref?: string
  /** Callback SPA para ver detalle (se usa si NO hay viewHref). */
  onView?: (id: string) => void
  /** Callback SPA para editar (solo cuando mode==='edit'). */
  onEdit?: (id: string) => void
  /**
   * Callback SPA para eliminar (solo cuando mode==='edit').
   * NOTA Paso 3: si `canDelete=false`, el botón "Eliminar" no se muestra.
   */
  onDelete?: (id: string) => void
  /**
   * Paso 3: controla si se muestra el botón "Eliminar" cuando mode==='edit'.
   * - true (default): comportamiento actual.
   * - false: oculta "Eliminar" (útil en vista Usuario).
   */
  canDelete?: boolean
}

/** Normaliza un valor de tiempo a "HH:mm"; soporta "HH:mm:ss" e ISO. */
function toHHMM(value?: string | null): string | null {
  if (!value) return null
  const s = value.trim()
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : null
}

/** Construye el rango "HH:mm — HH:mm" o un placeholder accesible. */
function timeRange(start?: string | null, end?: string | null): string {
  const s = toHHMM(start)
  const e = toHHMM(end)
  return s && e ? `${s} — ${e}` : '— — —'
}

/** Formatea fecha a "DD/MM/YYYY" con fallback. */
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
}: Props) {
  const fechaStr = fmtDate(minuta.date)
  const rango = timeRange(minuta.start_time, minuta.end_time)
  const countAdj = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0
  const desc = (minuta.description ?? '').trim() || 'Sin descripción'

  // 🧠 FOLIO SIEMPRE CORRECTO:
  // Usamos .display. El cast "as any" permite pasar folio_serial numérico o string sin
  // pelear con la firma estricta del helper (Pick<Minute, 'id'|'folio'|'folio_serial'>).
  const { display: folioText } = resolveFolio(minuta as any)

  // Texto accesible para el badge de adjuntos.
  const adjuntosAria = evidenceReadOnly
    ? `${countAdj} adjuntos (solo lectura)`
    : `${countAdj} adjunto${countAdj !== 1 ? 's' : ''}`

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        <Card.Title className="mb-1 d-flex flex-wrap align-items-center gap-2">
          <span>
            <strong>{fechaStr}</strong> · {rango}{' '}
            <span aria-label="Folio" title="Folio">· #{folioText}</span>
          </span>

          {evidenceReadOnly && (
            <Badge bg="secondary" title="Evidencias en solo lectura">
              Solo lectura
            </Badge>
          )}
        </Card.Title>

        {minuta.user_name && (
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            Registrado por: <strong>{minuta.user_name}</strong>
          </p>
        )}

        <Card.Text className="mb-2">{desc}</Card.Text>

        <Badge
          bg="light"
          text="dark"
          aria-label={adjuntosAria}
          title={adjuntosAria}
        >
          {countAdj} adjunto{countAdj !== 1 ? 's' : ''}{evidenceReadOnly ? ' · solo lectura' : ''}
        </Badge>
      </Card.Body>

      <Card.Footer className="bg-white border-top-0 d-flex flex-wrap gap-2">
        {mode !== 'view-only' && (
          <>
            {viewHref ? (
              // ✅ Navegación robusta con anchor real (recomendado para Admin).
              <Button
                as="a"
                href={viewHref}
                variant="primary"
                size="sm"
                aria-label={evidenceReadOnly ? 'Ver detalles (solo lectura de evidencias)' : 'Ver detalles'}
              >
                Ver detalles
              </Button>
            ) : (
              // SPA fallback si no se proporciona viewHref.
              onView && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onView(minuta.id)}
                  aria-label={evidenceReadOnly ? 'Ver detalles (solo lectura de evidencias)' : 'Ver detalles'}
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
              <Button variant="secondary" size="sm" onClick={() => onEdit(minuta.id)}>
                Editar
              </Button>
            )}
            {/* Paso 3: oculta "Eliminar" si canDelete=false */}
            {onDelete && canDelete && (
              <Button variant="danger" size="sm" onClick={() => onDelete(minuta.id)}>
                Eliminar
              </Button>
            )}
          </>
        )}
      </Card.Footer>
    </Card>
  )
}
