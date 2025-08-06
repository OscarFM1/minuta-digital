// src/components/AttachmentsList.tsx

import { useState, useEffect } from 'react'
import { Button, Spinner, ListGroup, Alert } from 'react-bootstrap'
import { supabase } from '@/lib/supabaseClient'

interface FileItem {
  name: string
  url: string
}

interface AttachmentsListProps {
  minuteId: string
}

export function AttachmentsList({ minuteId }: AttachmentsListProps) {
  const [files, setFiles]       = useState<FileItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string|null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        // 1) Listar objetos en el bucket bajo minuteId
        const { data, error: listErr } = await supabase
          .storage
          .from('attachments')
          .list(minuteId)
        if (listErr) throw listErr

        // 2) Mapear a URL pública
        const items: FileItem[] = data.map(f => {
          const { data: { publicUrl } } = supabase
            .storage
            .from('attachments')
            .getPublicUrl(`${minuteId}/${f.name}`)
          return { name: f.name, url: publicUrl }
        })

        setFiles(items)
      } catch (err: any) {
        console.error(err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [minuteId])

  if (loading) return <Spinner animation="border" size="sm" />
  if (error)   return <Alert variant="warning">Error: {error}</Alert>
  if (files.length === 0) return <div>No hay evidencias</div>

  return (
    <ListGroup variant="flush">
      {files.map(f => (
        <ListGroup.Item key={f.name} className="p-1 border-0">
          <Button
            variant="link"
            size="sm"
            href={f.url}
            target="_blank"
          >
            {f.name}
          </Button>
        </ListGroup.Item>
      ))}
    </ListGroup>
  )
}
