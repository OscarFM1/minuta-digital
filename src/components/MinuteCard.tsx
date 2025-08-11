/**
 * MinuteCard.tsx
 * Tarjeta visual de una minuta individual, reutilizable en diferentes contextos.
 *
 * Modos de acción:
 *  - mode="read":    Solo muestra botón "Ver detalles" (ideal para vista admin SOLO LECTURA).
 *  - mode="owner":   Muestra "Editar" y "Eliminar" (ideal para el dueño, p.ej. /mis-minutas).
 *
 * Props:
 *  - minuta:  datos mínimos de la minuta (MinuteCardData)
 *  - mode?:   'read' | 'owner'  (default: 'owner')
 *  - onView?:   (minuta) => void
 *  - onEdit?:   (minuta) => void
 *  - onDelete?: (minuta) => void
 *
 * Nota de tipos:
 *  - Usamos un tipo “de presentación” (MinuteCardData) con `user_id?` opcional para
 *    evitar conflictos cuando una página define un tipo más rico (con user_id obligatorio).
 *  - Las páginas pueden castear de vuelta si necesitan `user_id` requerido.
 */

import { Card, Button } from 'react-bootstrap'
import styles from '@/styles/Minutas.module.css'

/** Tipo mínimo que la card necesita para renderizar. */
export type MinuteCardData = {
  id: string
  user_id?: string               // opcional para no chocar con páginas que no lo tengan
  date?: string
  start_time?: string
  end_time?: string
  description?: string
  notes?: string
  adjuntos?: number
}

interface MinuteCardProps {
  minuta: MinuteCardData
  mode?: 'read' | 'owner'
  onView?: (minuta: MinuteCardData) => void
  onEdit?: (minuta: MinuteCardData) => void
  onDelete?: (minuta: MinuteCardData) => void
}

export default function MinuteCard({
  minuta,
  mode = 'owner',
  onView,
  onEdit,
  onDelete,
}: MinuteCardProps) {
  // Formatos amigables
  const titulo = minuta.description || 'Sin título'
  const fecha = minuta.date
    ? new Date(minuta.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Sin fecha'
  const hora = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  const resumen = minuta.notes || 'Sin resumen'
  const adjuntos = typeof minuta.adjuntos === 'number' ? minuta.adjuntos : 0

  return (
    <Card className={styles.card} role="article" tabIndex={0} aria-label={`Minuta ${titulo}`}>
      <Card.Body>
        <Card.Title>{titulo}</Card.Title>
        <Card.Subtitle className="mb-2 text-muted">
          {fecha} ({hora(minuta.start_time)} - {hora(minuta.end_time)})
        </Card.Subtitle>

        <Card.Text>
          {resumen.length > 100 ? `${resumen.slice(0, 100)}…` : resumen}
        </Card.Text>

        <div className="d-flex justify-content-between align-items-center">
          <small>{adjuntos} adjunto{adjuntos === 1 ? '' : 's'}</small>

          {mode === 'read' ? (
            <div>
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => onView?.(minuta)}
                aria-label="Ver detalles de la minuta"
              >
                Ver detalles
              </Button>
            </div>
          ) : (
            <div>
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => onEdit?.(minuta)}
                aria-label="Editar minuta"
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline-danger"
                className="ms-2"
                onClick={() => onDelete?.(minuta)}
                aria-label="Eliminar minuta"
              >
                Eliminar
              </Button>
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  )
}
