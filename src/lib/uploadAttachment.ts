// src/lib/uploadAttachment.ts
/**
 * Utilidades de subida e inserción de adjuntos.
 * - Sube el archivo al bucket de Storage bajo un prefijo <minuteId>/...
 * - Inserta los registros en la tabla public.attachment después de subir.
 * - Mantiene el contrato usado por MinuteForm.
 *
 * Requisitos previos:
 * - Storage bucket: "attachments"
 * - Tabla public.attachment con columnas: minute_id, path, (opc) created_by, is_protected, timestamps...
 */

import { supabase } from '@/lib/supabaseClient'

const ATTACHMENTS_BUCKET = 'attachments'

/** Limpia el nombre para evitar caracteres raros en la ruta */
function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
}

/**
 * Sube un archivo al bucket y devuelve la ruta generada.
 * @param file Archivo (Blob)
 * @param minuteId id de la minuta (prefijo de carpeta)
 */
export async function uploadAttachment(file: File, minuteId: string): Promise<string> {
  const parts = file.name.split('.')
  const ext = parts.length > 1 ? parts.pop()! : 'bin'
  const base = sanitizeFileName(parts.join('.')) || 'file'

  const path = `${minuteId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${base}.${ext}`

  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error
  return path
}

/**
 * Inserta filas en public.attachment para las rutas subidas.
 * @param minuteId id de la minuta
 * @param paths rutas devueltas por uploadAttachment()
 */
export async function createAttachmentRecords(minuteId: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  const rows = paths.map((p) => ({ minute_id: minuteId, path: p }))
  const { error } = await supabase.from('attachment').insert(rows)
  if (error) throw error
}
