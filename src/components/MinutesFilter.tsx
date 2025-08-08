/**
 * MinutesFilter.tsx
 * Filtro para listado de minutas (por fecha, usuario, etc).
 * Props: onChange (callback con los filtros activos)
 */
import { Form, Row, Col } from 'react-bootstrap'
import { useState } from 'react'

type Filters = {
  desde?: string
  hasta?: string
  usuario?: string
}

interface Props {
  onChange: (filters: Filters) => void
}

export default function MinutesFilter({ onChange }: Props) {
  const [filters, setFilters] = useState<Filters>({})

  function handleChange(e: React.ChangeEvent<any>) {
    const { name, value } = e.target
    const newFilters = { ...filters, [name]: value }
    setFilters(newFilters)
    onChange(newFilters)
  }

  return (
    <Form className="mb-4">
      <Row className="g-2">
        <Col xs={12} md={4}>
          <Form.Control
            type="date"
            name="desde"
            placeholder="Desde"
            onChange={handleChange}
          />
        </Col>
        <Col xs={12} md={4}>
          <Form.Control
            type="date"
            name="hasta"
            placeholder="Hasta"
            onChange={handleChange}
          />
        </Col>
        {/* Si tienes multiusuario, descomenta esto:
        <Col xs={12} md={4}>
          <Form.Select name="usuario" onChange={handleChange}>
            <option value="">Todos los usuarios</option>
            <option value="usuario1">Usuario 1</option>
            <option value="usuario2">Usuario 2</option>
          </Form.Select>
        </Col>
        */}
      </Row>
    </Form>
  )
}
