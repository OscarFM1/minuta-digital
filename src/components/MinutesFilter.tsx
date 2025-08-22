import React, { useEffect, useState } from 'react'
import { Row, Col, Form, Button } from 'react-bootstrap'

export type MinutesFilterValues = {
  desde?: string
  hasta?: string
  /** Campo por el que filtrar: día de la minuta (date) o fecha de creación (created_at) */
  by?: 'date' | 'created_at'
}

type Props = {
  value?: MinutesFilterValues
  onChange: (f: MinutesFilterValues) => void
}

export default function MinutesFilter({ value, onChange }: Props) {
  const [by, setBy] = useState<MinutesFilterValues['by']>(value?.by ?? 'date')
  const [desde, setDesde] = useState<string>(value?.desde ?? '')
  const [hasta, setHasta] = useState<string>(value?.hasta ?? '')

  useEffect(() => {
    onChange({
      by,
      desde: desde || undefined,
      hasta: hasta || undefined,
    })
  }, [by, desde, hasta, onChange])

  const clear = () => {
    setBy('date')
    setDesde('')
    setHasta('')
  }

  return (
    <Row className="g-2 align-items-end my-3">
      <Col xs={12} md="auto">
        <Form.Label>Buscar por</Form.Label>
        <Form.Select
          aria-label="Campo de filtrado"
          value={by}
          onChange={(e) => setBy(e.target.value as 'date' | 'created_at')}
        >
          <option value="date">Día de la minuta</option>
          <option value="created_at">Fecha de creación</option>
        </Form.Select>
      </Col>
      <Col xs={6} md={3}>
        <Form.Label>Desde</Form.Label>
        <Form.Control
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
      </Col>
      <Col xs={6} md={3}>
        <Form.Label>Hasta</Form.Label>
        <Form.Control
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
        />
      </Col>
      <Col xs="auto">
        <Button
          className="mt-2 mt-md-0"
          variant="outline-secondary"
          onClick={clear}
        >
          Limpiar
        </Button>
      </Col>
    </Row>
  )
}
