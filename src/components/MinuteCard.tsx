/**
 * src/components/MinuteCard.tsx
 *
 * Tarjeta para mostrar una minuta.
 * - Muestra: fecha, rango de horas, descripción y # de adjuntos.
 * - Siempre pinta el nombre del usuario (user_name) si está disponible.
 * - Acciones según `mode`:
 *      "read"      → solo Ver detalles
 *      "edit"      → Ver, Editar, Eliminar
 *      "view-only" → sin acciones, solo info
 *
 * Notas:
 * - Formateo robusto de TIME: acepta "HH:mm", "HH:mm:ss" o ISO con hora.
 * - Mostramos hora en 24h: "HH:mm". Si falta alguna → "— — —".
 */

import React from 'react'
import { Card, Button, Badge } from 'react-bootstrap'
import dayjs from 'dayjs'

/** Estructura de datos que recibe la card */
export type MinuteCardData = {
  id: string
  date?: string              // Ej. "2025-08-09"
  start_time?: string | null // "HH:mm" | "HH:mm:ss" | ISO
  end_time?: string | null   // "HH:mm" | "HH:mm:ss" | ISO
  description?: string | null
  notes?: string | null
  adjuntos?: number
  user_name?: string
  folio?: string | null
}

/** Props del componente */
type Props = {
  minuta: MinuteCardData
  mode?: 'read' | 'edit' | 'view-only'
  onView?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

/** "HH:mm" o "HH:mm:ss" o ISO → "HH:mm" */
function toHHMM(value?: string | null): string | null {
  if (!value) return null
  const s = value.trim()

  // TIME puro
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (m) return `${m[1]}:${m[2]}`

  // Intento ISO/fecha+hora
  const d = dayjs(s)
  return d.isValid() ? d.format('HH:mm') : null
}

/** Rango de horas presentable */
function timeRange(start?: string | null, end?: string | null): string {
  const s = toHHMM(start)
  const e = toHHMM(end)
  return s && e ? `${s} — ${e}` : '— — —'
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (si no es válida: "Sin fecha") */
function fmtDate(value?: string): string {
  if (!value) return 'Sin fecha'
  const d = dayjs(value)
  return d.isValid() ? d.format('DD/MM/YYYY') : 'Sin fecha'
}

export default function MinuteCard({
  minuta,
  mode = 'read',
  onView,
  onEdit,
  onDelete,
}: Props) {
  const fechaStr = fmtDate(minuta.date)
  const rango = timeRange(minuta.start_time, minuta.end_time)
  const countAdj = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0
  const desc = (minuta.description ?? '').trim() || 'Sin descripción'

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        {/* Fecha + horas (y opcional folio si existe) */}
        <Card.Title className="mb-1">
          <strong>{fechaStr}</strong>
          {' · '}
          {rango}
          {minuta.folio ? ` · #${minuta.folio}` : null}
        </Card.Title>

        {/* Registrado por */}
        {minuta.user_name && (
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            Registrado por: <strong>{minuta.user_name}</strong>
          </p>
        )}

        {/* Descripción */}
        <Card.Text className="mb-2">{desc}</Card.Text>

        {/* Adjuntos */}
        <Badge bg="light" text="dark">
          {countAdj} adjunto{countAdj !== 1 ? 's' : ''}
        </Badge>
      </Card.Body>

      {/* Acciones */}
      <Card.Footer className="bg-white border-top-0 d-flex flex-wrap gap-2">
        {mode !== 'view-only' && onView && (
          <Button variant="primary" size="sm" onClick={() => onView(minuta.id)}>
            Ver detalles
          </Button>
        )}
        {mode === 'edit' && (
          <>
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(minuta.id)}>
                Editar
              </Button>
            )}
            {onDelete && (
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
