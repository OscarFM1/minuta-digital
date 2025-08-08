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
  titulo?: string
  fecha?: string
  resumen?: string
  responsable?: string
  adjuntos?: number
}

interface MinuteCardProps {
  minuta: Minute
  onEdit: (minuta: Minute) => void
  onDelete: (minuta: Minute) => void
}

export default function MinuteCard({ minuta, onEdit, onDelete }: MinuteCardProps) {
  return (
    <Card className={styles.card} role="article" tabIndex={0} aria-label={`Minuta ${minuta.titulo ?? ''}`}>
      <Card.Body>
        <Card.Title>{minuta.titulo ?? 'Sin título'}</Card.Title>
        <Card.Subtitle className="mb-2 text-muted">
          {minuta.fecha ?? 'Sin fecha'} | {minuta.responsable ?? 'Sin responsable'}
        </Card.Subtitle>
        <Card.Text>
          {minuta.resumen?.slice(0, 100) ?? 'Sin resumen'}{minuta.resumen && minuta.resumen.length > 100 ? '...' : ''}
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
          <small>{minuta.adjuntos ?? 0} adjuntos</small>
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
