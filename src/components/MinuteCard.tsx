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
 * Notas de implementación:
 * - Usamos dayjs (sin dependencias nuevas).
 * - Formateo robusto: si `start_time` o `end_time` vienen como "HH:mm" o como ISO,
 *   igual los mostramos bien.
 */

import React from 'react'
import { Card, Button, Badge } from 'react-bootstrap'
import dayjs from 'dayjs'

/** Estructura de datos que recibe la card */
export type MinuteCardData = {
  id: string
  date?: string            // Ej. "2025-08-09"
  start_time?: string      // Puede ser "HH:mm" o "YYYY-MM-DDTHH:mm"
  end_time?: string        // Puede ser "HH:mm" o "YYYY-MM-DDTHH:mm"
  description?: string
  notes?: string
  adjuntos?: number
  user_name?: string       // Nombre de quien registró la minuta
}

/** Props del componente */
type Props = {
  minuta: MinuteCardData
  mode?: 'read' | 'edit' | 'view-only'
  onView?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

/** Helper: formatea "HH:mm" o ISO → "hh:mm a" (10:30 a. m.) */
function fmtTime(value?: string): string {
  if (!value) return '—'

  // Si viene solo "HH:mm", lo parseamos como hoy a esa hora
  if (value.length <= 5) {
    const parsed = dayjs(`2000-01-01T${value}`)
    return parsed.isValid() ? parsed.format('hh:mm a') : '—'
  }

  // Si viene ISO (o fecha+hora), lo formateamos directo
  const d = dayjs(value)
  return d.isValid() ? d.format('hh:mm a') : '—'
}

/** Helper: formatea "YYYY-MM-DD" → "DD/MM/YYYY" */
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
  const horaIni  = fmtTime(minuta.start_time)
  const horaFin  = fmtTime(minuta.end_time)
  const countAdj = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        {/* Fecha y horas */}
        <Card.Title className="mb-1">
          <strong>{fechaStr}</strong> · {horaIni} – {horaFin}
        </Card.Title>

        {/* Nombre de quien registró (si existe) */}
        {minuta.user_name && (
          <p className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
            Registrado por: <strong>{minuta.user_name}</strong>
          </p>
        )}

        {/* Descripción */}
        <Card.Text className="mb-2">
          {minuta.description || 'Sin descripción'}
        </Card.Text>

        {/* Adjuntos */}
        <Badge bg="light" text="dark">
          {countAdj} adjunto{countAdj !== 1 ? 's' : ''}
        </Badge>
      </Card.Body>

      {/* Acciones según modo */}
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
