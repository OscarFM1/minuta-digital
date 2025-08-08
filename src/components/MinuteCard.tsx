/**
 * MinuteCard.tsx
 * Tarjeta visual de una minuta individual.
 * Props: minuta (objeto), onEdit (callback), onDelete (callback)
 * Accesible y con estilos corporativos.
 */
import { Card, Button } from 'react-bootstrap'
import styles from '@/styles/Minutas.module.css'

type Minute = {
  id: string
  date?: string           // fecha (YYYY-MM-DD)
  start_time?: string     // hora inicio (ISO string)
  end_time?: string       // hora fin (ISO string)
  description?: string    // lo usamos como título
  notes?: string          // lo usamos como resumen
  responsable?: string    // si más adelante lo tienes en tu tabla
  attachments?: { id: string }[]  // opcional: si traes el array desde la query
  adjuntos?: number       // si sólo traes el count
}

interface MinuteCardProps {
  minuta: Minute
  onEdit: (minuta: Minute) => void
  onDelete: (minuta: Minute) => void
}

export default function MinuteCard({ minuta, onEdit, onDelete }: MinuteCardProps) {
  // Mapeo de campos y formatos bonitos:
  const titulo = minuta.description || 'Sin título'
  // Fecha formateada legible (español):
  const fecha = minuta.date
    ? new Date(minuta.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Sin fecha'
  // Hora inicio/fin (opcional)
  const horaInicio = minuta.start_time
    ? new Date(minuta.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '--:--'
  const horaFin = minuta.end_time
    ? new Date(minuta.end_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '--:--'
  // Responsable (si lo implementas)
  const responsable = minuta.responsable || 'Sin responsable'
  // Resumen/notas
  const resumen = minuta.notes || 'Sin resumen'
  // Conteo de adjuntos (según cómo traigas el dato)
  const adjuntos =
    typeof minuta.adjuntos === 'number'
      ? minuta.adjuntos
      : Array.isArray(minuta.attachments)
      ? minuta.attachments.length
      : 0

  return (
    <Card className={styles.card} role="article" tabIndex={0} aria-label={`Minuta ${titulo}`}>
      <Card.Body>
        <Card.Title>{titulo}</Card.Title>
        <Card.Subtitle className="mb-2 text-muted">
          {fecha} ({horaInicio} - {horaFin}) | {responsable}
        </Card.Subtitle>
        <Card.Text>
          {resumen.length > 100 ? resumen.slice(0, 100) + '...' : resumen}
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
          <small>{adjuntos} adjuntos</small>
          <div>
            <Button size="sm" variant="outline-primary" onClick={() => onEdit(minuta)} aria-label="Editar minuta">
              Editar
            </Button>
            <Button size="sm" variant="outline-danger" className="ms-2" onClick={() => onDelete(minuta)} aria-label="Eliminar minuta">
              Eliminar
            </Button>
          </div>
        </div>
      </Card.Body>
    </Card>
  )
}
