// src/pages/minutas.tsx

import type { NextPage } from 'next'
import Head from 'next/head'
import useSWR from 'swr'
import { supabase } from '@/lib/supabaseClient'
import {
  Container,
  Card,
  Row,
  Col,
  Spinner,
  Alert
} from 'react-bootstrap'
import { AttachmentsList } from '@/components/AttachmentsList'

/**
 * Interfaz que describe la estructura de una minuta.
 */
interface Minuta {
  id: string
  date: string
  start_time: string
  end_time: string
  description: string
  notes?: string | null
}

/**
 * Fetcher que carga todas las minutas desde Supabase.
 */
const fetcher = async (): Promise<Minuta[]> => {
  const { data, error } = await supabase
    .from<'minute', Minuta>('minute')
    .select('*')
    .order('date', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * MinutasPage
 *
 * Muestra un listado de todas las minutas en cards,
 * con lista dinámica de evidencias.
 */
const MinutasPage: NextPage = () => {
  const { data: minutas, error } = useSWR<Minuta[]>('minutas', fetcher)

  if (error) {
    return (
      <Container className="my-5">
        <Alert variant="danger">
          Error cargando minutas: {error.message}
        </Alert>
      </Container>
    )
  }

  if (!minutas) {
    return (
      <Container className="text-center my-5">
        <Spinner animation="border" />
      </Container>
    )
  }

  return (
    <>
      <Head>
        <title>Listado de Minutas</title>
      </Head>
      
      <Container className="my-4">
        <h2>Listado de Minutas</h2>
        <Row>
          {minutas.map((m: Minuta) => (
            <Col md={4} key={m.id} className="mb-3">
              <Card>
                <Card.Body>
                  <Card.Title>
                    {new Date(m.date).toLocaleDateString()}
                  </Card.Title>
                  <Card.Subtitle className="mb-2 text-muted">
                    {m.start_time.slice(11,16)} – {m.end_time.slice(11,16)}
                  </Card.Subtitle>
                  <Card.Text>{m.description}</Card.Text>
                  {m.notes && <Card.Text><em>{m.notes}</em></Card.Text>}

                  <h6 className="mt-3">Evidencias:</h6>
                  <AttachmentsList minuteId={m.id} />
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </>
  )
}

export default MinutasPage
