// src/pages/minutas.tsx

import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import { supabase } from '@/lib/supabaseClient'
import {
  Container,
  Card,
  Row,
  Col,
  Spinner,
  Alert,
  Button,
  Stack
} from 'react-bootstrap'
import { AttachmentsList } from '@/components/AttachmentsList'

interface Minuta {
  id: string
  date: string
  start_time: string
  end_time: string
  description: string
  notes?: string | null
}

const fetcher = async (): Promise<Minuta[]> => {
  const { data, error } = await supabase
    .from<'minute', Minuta>('minute')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data ?? []
}

const MinutasPage: NextPage = () => {
  const { data: minutas, error } = useSWR<Minuta[]>('minutas', fetcher)

  const handleDelete = async (minuteId: string) => {
    if (!confirm('¿Seguro que quieres eliminar esta minuta y sus evidencias?')) return

    // 1) Borrar metadatos
    await supabase.from('attachment').delete().eq('minute_id', minuteId)

    // 2) Borrar archivos del bucket
    const { data: files } = await supabase
      .storage
      .from('attachments')
      .list(minuteId)
    if (files && files.length) {
      const paths = files.map(f => `${minuteId}/${f.name}`)
      await supabase.storage.from('attachments').remove(paths)
    }

    // 3) Borrar la minuta
    await supabase.from('minute').delete().eq('id', minuteId)

    mutate('minutas')
  }

  if (error) {
    return (
      <Container className="my-5">
        <Alert variant="danger">Error cargando minutas: {error.message}</Alert>
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
          {minutas.map(m => (
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

                  <Stack direction="horizontal" gap={2} className="mt-3">
                    <Link href={`/minutas/${m.id}`} passHref>
                      <Button as="a" variant="outline-secondary" size="sm">
                        Editar
                      </Button>
                    </Link>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                    >
                      Eliminar
                    </Button>
                  </Stack>
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
