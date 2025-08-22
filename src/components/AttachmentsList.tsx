// src/components/AttachmentsList.tsx
/**
 * AttachmentsList — UI elegante + validaciones
 * - Límite duro: 8 archivos por carga (bloquea y limpia input)
 * - Límite por archivo: 1 MB (imágenes se comprimen ~300KB)
 * - Chequeo de cuota: public.storage_quota() antes de subir
 * - Inserta fila en public.attachment tras subir
 * - Lista archivos en un grid con iconos y chips por tipo
 *
 * NUEVO:
 * - Prop `readOnly?: boolean` (default false).
 *   Si `true`, NO se muestra el toolbar (botón + input de archivos) ni la barra de progreso,
 *   y el handler de selección NO hace nada. Úsalo en la vista de Admin.
 *
 * Requiere:
 *   - styles: src/styles/Attachments.module.css
 *   - react-icons (ya en el proyecto)
 *   - función RPC public.storage_quota() creada antes
 */

import { useState, useEffect, useRef } from 'react'
import { Button, Spinner, Alert, ProgressBar } from 'react-bootstrap'
import imageCompression from 'browser-image-compression'
import { supabase } from '@/lib/supabaseClient'
import { FiFileText, FiImage, FiFile, FiExternalLink } from 'react-icons/fi'
import styles from '@/styles/Attachments.module.css'

type FileItem = { name: string; url: string }

type Props = {
  /** ID de la minuta (carpeta en el bucket) */
  minuteId: string
  /**
   * Si true, oculta por completo el uploader y cualquier acción de carga/borrado.
   * Se mantiene la lectura (listado y links).
   */
  readOnly?: boolean
}

const BUCKET = 'attachments'
const MAX_FILES_PER_UPLOAD = 8
const MAX_IMAGE_BYTES = 1_000_000
const MAX_DOC_BYTES   = 1_000_000

const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  // 'application/zip',
])

function sanitizeName(name: string) {
  return name.normalize('NFKD').replace(/[^\w.\-]+/g,'_').replace(/_+/g,'_').toLowerCase()
}
function fmtBytes(n: number) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024*1024) return `${Math.round(n/1024)} KB`
  return `${(n/1024/1024).toFixed(2)} MB`
}
async function getSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (!error && data?.signedUrl) return data.signedUrl
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export default function AttachmentsList({ minuteId, readOnly = false }: Props) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)
  const [progress, setProgress] = useState(0)
  const [info, setInfo] = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // --- listar actuales ---
  const load = async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: listErr } = await supabase.storage.from(BUCKET)
        .list(minuteId, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
      if (listErr) throw listErr
      const items: FileItem[] = []
      for (const f of data) {
        const url = await getSignedUrl(`${minuteId}/${f.name}`)
        items.push({ name: f.name, url })
      }
      setFiles(items)
    } catch (e:any) { setError(e?.message || String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [minuteId])

  // --- cuota ---
  async function getQuota() {
    const { data, error } = await supabase.rpc('storage_quota')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return {
      used_bytes: Number(row?.used_bytes ?? 0),
      limit_mb: Number(row?.limit_mb ?? 950),
      remaining_bytes: Number(row?.remaining_bytes ?? 0),
    }
  }

  // --- bloqueo duro de 8 por carga ---
  function blockTooMany(input: HTMLInputElement, count: number) {
    const m = `Seleccionaste ${count} archivos. Máximo por carga: ${MAX_FILES_PER_UPLOAD}.`
    setInfo(m)
    input.setCustomValidity(m)
    input.reportValidity()
    input.value = ''
    setTimeout(() => input.setCustomValidity(''), 2000)
  }

  // --- selección ---
  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 🔒 Bloqueo total en modo solo lectura (defensa de UI)
    if (readOnly) {
      e.currentTarget.value = ''
      return
    }

    const input = e.currentTarget
    const selected = Array.from(input.files || [])
    if (selected.length === 0) return

    if (selected.length > MAX_FILES_PER_UPLOAD) {
      blockTooMany(input, selected.length)
      return
    } else {
      setInfo(null)
    }

    setBusy(true); setMsg('Verificando espacio disponible…'); setError(null); setProgress(0)

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userData?.user) throw new Error('No hay sesión válida')
      const userId = userData.user.id

      const quota = await getQuota()
      let remaining = quota.remaining_bytes
      if (remaining <= 0) {
        setError(`No queda espacio en el bucket (límite ${quota.limit_mb} MB). Libera espacio o espera la limpieza automática (35 días).`)
        input.value = ''
        return
      }

      const rejected: string[] = []
      let done = 0

      for (const file of selected) {
        if (!ALLOWED_MIME.has(file.type)) {
          rejected.push(`Tipo no permitido: ${file.name} (${file.type || 'desconocido'})`)
          continue
        }

        let toUpload: File | Blob = file
        const isImage = file.type.startsWith('image/')
        if (isImage) {
          setMsg(`Comprimiendo: ${file.name}`)
          toUpload = await imageCompression(file, {
            maxSizeMB: 0.3, maxWidthOrHeight: 1600, initialQuality: 0.75, useWebWorker: true
          })
          if (toUpload.size > MAX_IMAGE_BYTES) {
            rejected.push(`Imagen muy pesada (${fmtBytes(toUpload.size)}): ${file.name}. Límite ${fmtBytes(MAX_IMAGE_BYTES)}.`)
            continue
          }
        } else {
          if (file.size > MAX_DOC_BYTES) {
            rejected.push(`Archivo muy pesado (${fmtBytes(file.size)}): ${file.name}. Límite ${fmtBytes(MAX_DOC_BYTES)}.`)
            continue
          }
        }

        const projected = isImage ? toUpload.size : file.size
        if (projected > remaining) {
          rejected.push(`Sin espacio para ${file.name}. Restante: ${fmtBytes(remaining)}. Límite ${quota.limit_mb} MB.`)
          break
        }

        const filename = sanitizeName(file.name)
        const path = `${minuteId}/${filename}`
        setMsg(`Subiendo: ${filename}`)

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, toUpload, {
          cacheControl: '3600', upsert: false,
          contentType: isImage ? (toUpload.type || file.type) : file.type,
        })
        if (upErr) {
          const byQuota = /limit|quota|exceed|space/i.test(upErr.message || '')
          rejected.push(byQuota
            ? `No hay espacio suficiente para ${file.name}.`
            : `Error al subir ${file.name}: ${upErr.message || 'desconocido'}`)
          break
        }

        const { error: attErr } = await supabase.from('attachment').insert({
          minute_id: minuteId, path, created_by: userId
        })
        if (attErr) {
          await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined)
          rejected.push(`Error registrando ${file.name} en DB: ${attErr.message}`)
          break
        }

        remaining -= projected
        done += 1
        setProgress(Math.round((done / selected.length) * 100))
      }

      if (rejected.length > 0) {
        setError(`Se subieron ${done} archivo(s). Rechazados:\n• ` + rejected.join('\n• '))
      } else if (done === 0) {
        setError('No se subió ningún archivo (ver límites de cantidad o espacio).')
      } else {
        setMsg('✅ Adjuntos subidos correctamente')
      }

      input.value = ''
      await load()
    } catch (ex:any) {
      setMsg(null); setError(ex?.message || String(ex))
    } finally {
      setBusy(false)
    }
  }

  // Helpers UI
  function extInfo(name: string) {
    const ext = (name.split('.').pop() || '').toLowerCase()
    if (['jpg','jpeg','png','webp','gif'].includes(ext)) return { type: 'image', label: ext.toUpperCase() }
    if (ext === 'pdf') return { type: 'pdf', label: 'PDF' }
    if (['doc','docx'].includes(ext)) return { type: 'doc', label: 'DOC' }
    if (['xls','xlsx'].includes(ext)) return { type: 'xls', label: 'XLS' }
    if (['zip','rar'].includes(ext)) return { type: 'zip', label: ext.toUpperCase() }
    return { type: 'other', label: ext || 'file' }
  }
  function iconFor(type: string) {
    if (type === 'image') return <FiImage className={styles.icon} aria-hidden />
    if (['pdf','doc','xls'].includes(type)) return <FiFileText className={styles.icon} aria-hidden />
    return <FiFile className={styles.icon} aria-hidden />
  }

  return (
    <div aria-live="polite">
      {/* Título con indicador de solo lectura cuando aplique */}
      <h3 id="evidencias-title" className="mb-2">
        Evidencias {readOnly && <span className="badge bg-secondary ms-2">Solo lectura</span>}
      </h3>

      {/* Toolbar: input nativo oculto + botón visible (SOLO si !readOnly) */}
      {!readOnly && (
        <div className={`${styles.toolbar} mb-2`} data-testid="attachments-toolbar">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            disabled={busy}
            onChange={handleSelect}
            aria-describedby="uploader-help"
            className={styles.inputHidden}
          />
          {busy ? (
            <Spinner animation="border" size="sm" role="status" aria-live="polite" />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Agregar evidencias
            </Button>
          )}
          <span className={styles.placeholder}>Ningún archivo seleccionado</span>
          <span id="uploader-help" className={styles.helpRow}>
            Máx. <strong>{MAX_FILES_PER_UPLOAD}</strong> archivos por carga. Límite por archivo: <strong>1&nbsp;MB</strong> (imágenes se comprimen).
          </span>
        </div>
      )}

      {/* Progreso SOLO cuando hay carga en curso y !readOnly */}
      {!readOnly && busy && (
        <div className="mb-2">
          {msg && <div style={{ fontSize: 12, marginBottom: 6 }}>{msg}</div>}
          <ProgressBar now={progress} label={`${progress}%`} animated striped />
        </div>
      )}

      {info && <Alert variant="info" className="py-1">{info}</Alert>}
      {error && <Alert variant="danger" className="py-1" style={{ whiteSpace: 'pre-wrap' }}>{error}</Alert>}

      {/* Grid elegante (lectura siempre permitida) */}
      {loading ? (
        <Spinner animation="border" size="sm" />
      ) : files.length === 0 ? (
        <div className={styles.empty}>No hay evidencias</div>
      ) : (
        <ul className={styles.grid}>
          {files.map((f) => {
            const { type, label } = extInfo(f.name)
            return (
              <li className={styles.item} key={f.name}>
                <span className={styles.iconWrap}>{iconFor(type)}</span>
                <div className={styles.text}>
                  <a className={styles.name} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}>
                    {f.name}
                  </a>
                  <div className={styles.meta}>
                    <span className={`${styles.chip} ${styles[`t-${type}`]}`}>{label}</span>
                  </div>
                </div>
                <a className={styles.action} href={f.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en nueva pestaña">
                  <FiExternalLink />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
