// src/components/MinuteForm.tsx
/**
 * Formulario de crear/editar Minuta
 * - Crear: "Título de tarea" + "Tarea a realizar" (+ Tipo de trabajo obligatorio)
 * - Editar: "Tarea realizada" + Novedades (opcional)
 *   - Si initialWorkType existe => select bloqueado (consistencia de reportes)
 *   - Si NO existe => select editable (legacy) y se PERSISTE en autosave/submit
 */

import { useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { createMinute, updateMinute } from '@/lib/minutes'
import { uploadAttachment, createAttachmentRecords } from '@/lib/uploadAttachment'
import type { Minute } from '@/types/minute'
import ui from '@/styles/NewMinute.module.css'

// Work type
import { WORK_TYPE_OPTIONS, WORK_TYPE_VALUES } from '@/types/minute'
export type WorkType = (typeof WORK_TYPE_VALUES)[number]

type FormValues = {
  tarea_realizada: string
  novedades: string
}
type MinuteId = string

export interface MinuteFormProps {
  mode: 'create' | 'edit'
  minuteId?: MinuteId
  initialValues?: Partial<FormValues>
  initialWorkType?: WorkType | null
  onSaved?: (minute: Minute) => void
  onCancel?: () => void
  requireAttachmentOnCreate?: boolean
  enableAutosave?: boolean
  autosaveDelayMs?: number
  allowNovedadesInCreate?: boolean
  ignoreTareaValidation?: boolean
  tareaMirrorValue?: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function MinuteForm({
  mode,
  minuteId,
  initialValues,
  initialWorkType = null,
  onSaved,
  onCancel,
  requireAttachmentOnCreate = false,
  enableAutosave,
  autosaveDelayMs = 800,
  allowNovedadesInCreate = false,
  ignoreTareaValidation = false,
  tareaMirrorValue,
}: MinuteFormProps) {
  // Valores iniciales
  const init = useMemo<FormValues>(
    () => ({
      tarea_realizada: initialValues?.tarea_realizada ?? '',
      novedades: initialValues?.novedades ?? '',
    }),
    [initialValues]
  )

  // Estado del form
  const [values, setValues] = useState<FormValues>(init)
  const [lastSaved, setLastSaved] = useState<FormValues>(init)

  const [title, setTitle] = useState<string>('') // create: description
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [autoStatus, setAutoStatus] =
    useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)

  // Work type
  const [workType, setWorkType] = useState<WorkType | ''>(
    mode === 'edit' ? (initialWorkType ?? '') : ''
  )

  // 🔒 Solo lectura en edición cuando YA existe un tipo guardado
  const workTypeReadOnly = mode === 'edit' && !!initialWorkType
  // Para saber si debemos persistir cambios del select en EDIT
  const shouldPersistWorkTypeInEdit = mode === 'edit' && !initialWorkType

  // Para saber si cambió el work type en EDIT (legacy)
  const [lastSavedWorkType, setLastSavedWorkType] = useState<string>(
    (initialWorkType ?? '') as string
  )

  const autosaveEnabled = enableAutosave ?? mode === 'edit'
  const showNovedades = mode === 'edit' || allowNovedadesInCreate

  useEffect(() => {
    setValues(init)
    setLastSaved(init)
  }, [init])

  // Si cambia initialWorkType asíncrono (carga), refresca select
  useEffect(() => {
    if (mode === 'edit') {
      setWorkType((initialWorkType ?? '') as WorkType | '')
      setLastSavedWorkType((initialWorkType ?? '') as string)
    }
  }, [initialWorkType, mode])

  /** Mirror de textarea externo (edición propia) */
  useEffect(() => {
    if (mode !== 'edit') return
    if (typeof tareaMirrorValue !== 'string') return
    if (tareaMirrorValue === values.tarea_realizada) return
    setValues((prev) => ({ ...prev, tarea_realizada: tareaMirrorValue }))
  }, [tareaMirrorValue, mode, values.tarea_realizada])

  // -------- Helpers --------
  const isSame = (a: FormValues, b: FormValues) =>
    a.tarea_realizada === b.tarea_realizada && a.novedades === b.novedades

  const validateForSubmit = (): string | null => {
    if (!ignoreTareaValidation && !values.tarea_realizada.trim())
      return 'La "tarea" no puede estar vacía.'
    if (mode === 'create' && !workType) {
      return 'Debes seleccionar el Tipo de trabajo.'
    }
    if (mode === 'create' && requireAttachmentOnCreate && files.length === 0) {
      return 'Debes adjuntar al menos un archivo como evidencia.'
    }
    return null
  }

  // --- AUTOGUARDADO (solo edit) ---
  const { debounced: debouncedAutosave } = useDebouncedCallback(
    async (snapshot: FormValues, currentWorkType: string) => {
      if (!autosaveEnabled || mode !== 'edit' || !minuteId) return
      const changedForm = !isSame(snapshot, lastSaved)
      const changedWorkType =
        shouldPersistWorkTypeInEdit && currentWorkType !== lastSavedWorkType

      if (!changedForm && !changedWorkType) {
        setAutoStatus('idle')
        return
      }

      try {
        setAutoStatus('saving')
        const payload: Record<string, any> = {
          tarea_realizada: snapshot.tarea_realizada.trim(),
          novedades: snapshot.novedades.trim() ? snapshot.novedades.trim() : null,
        }
        // 👇 Solo persistimos work_type en EDIT cuando el campo es editable (legacy)
        if (changedWorkType) {
          payload.work_type = currentWorkType || null
        }

        const updated = await updateMinute(minuteId, payload)

        setLastSaved({
          tarea_realizada: snapshot.tarea_realizada,
          novedades: snapshot.novedades,
        })
        if (changedWorkType) setLastSavedWorkType(currentWorkType)

        setAutoStatus('saved')
        onSaved?.(updated)
        setTimeout(() => setAutoStatus('idle'), 1200)
      } catch {
        setAutoStatus('error')
      }
    },
    autosaveDelayMs
  )

  useEffect(() => {
    if (mode !== 'edit' || !autosaveEnabled) return
    debouncedAutosave(values, (workType as string) || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.tarea_realizada, values.novedades, workType])

  // Submit manual (create o edit)
  const onSubmit = async () => {
    const err = validateForSubmit()
    if (err) {
      setErrorMsg(err)
      return
    }

    setSaving(true)
    setErrorMsg(null)

    try {
      if (mode === 'create') {
        const created = await createMinute({
          date: todayISO(),
          tarea_realizada: values.tarea_realizada.trim(),
          description: title.trim() ? title.trim() : undefined,
          novedades: null,
          work_type: workType || null,
        })

        // Adjuntos opcionales al crear
        if (files.length > 0) {
          const paths: string[] = []
          for (const f of files) {
            const path = await uploadAttachment(f, created.id)
            paths.push(path)
          }
          await createAttachmentRecords(created.id, paths)
        }
        setLastSaved(values)
        onSaved?.(created)
      } else if (mode === 'edit' && minuteId) {
        const payload: Record<string, any> = {
          tarea_realizada: values.tarea_realizada.trim(),
          novedades: values.novedades.trim() ? values.novedades.trim() : null,
        }
        // 👇 En EDIT, solo mandamos work_type si el select es editable (legacy) y cambió
        if (shouldPersistWorkTypeInEdit && (workType as string) !== lastSavedWorkType) {
          payload.work_type = (workType as string) || null
        }

        const updated = await updateMinute(minuteId, payload)
        setLastSaved(values)
        if (payload.work_type !== undefined) {
          setLastSavedWorkType((workType as string) || '')
        }
        onSaved?.(updated)
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'No fue posible guardar.')
    } finally {
      setSaving(false)
    }
  }

  // Files
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []))
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files ?? [])
    if (dropped.length) setFiles((prev) => [...prev, ...dropped])
  }
  const fileNames = files.map((f) => f.name).join(', ')

  return (
    <form
      className={`${ui.formGrid} ${saving ? ui.saving : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      noValidate
    >
      {/* Título (solo crear) */}
      {mode === 'create' && (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="title">Título de tarea</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej.: Inventario de bodega A"
            className={ui.input}
          />
        </div>
      )}

      {/* Tipo de trabajo */}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="work_type">
          Tipo de trabajo {mode === 'create' && <span aria-hidden="true">*</span>}
        </label>
        <div className="wt-wrap">
          <select
            id="work_type"
            className="wt-select"
            value={(workType as string) || ''}
            onChange={(e) => setWorkType(e.target.value as WorkType)}
            required={mode === 'create'}
            disabled={workTypeReadOnly}
          >
            {mode === 'create' && <option value="" disabled>Selecciona una opción…</option>}
            {WORK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tarea */}
      <div className={`${ui.field} ${ui.full}`}>
        <label className={ui.label} htmlFor="tarea">
          {mode === 'create' ? 'Tarea a realizar' : 'Tarea realizada'}
        </label>
        <textarea
          id="tarea"
          name="tarea_realizada"
          rows={6}
          placeholder={mode === 'create' ? 'Describe qué vas a realizar…' : 'Describe lo que realizaste…'}
          value={values.tarea_realizada}
          onChange={(e) =>
            setValues((prev: FormValues) => ({ ...prev, tarea_realizada: e.target.value }))
          }
          className={ui.textarea}
          required={mode === 'create' ? true : !ignoreTareaValidation}
        />
      </div>

      {/* Novedades */}
      {showNovedades && (
        <div className={`${ui.field} ${ui.full}`}>
          <label className={ui.label} htmlFor="novedades">Novedades (opcional)</label>
          <textarea
            id="novedades"
            rows={4}
            placeholder="Anota novedades, bloqueos o hallazgos…"
            value={values.novedades}
            onChange={(e) =>
              setValues((prev: FormValues) => ({ ...prev, novedades: e.target.value }))
            }
            className={ui.textarea}
          />
        </div>
      )}

      {/* Adjuntos (crear) */}
      {mode === 'create' && (
        <div className={`${ui.field} ${ui.full}`}>
          <label className={ui.label}>
            Adjuntos {requireAttachmentOnCreate ? '(al menos 1)' : ''}
          </label>

          <div className={ui.fileRow}>
            <label className={ui.fileBtn}>
              Elegir archivos
              <input type="file" multiple onChange={onFiles} />
            </label>
            <span className={ui.fileName}>
              {files.length > 0 ? `${files.length} archivo(s): ${fileNames}` : 'Ningún archivo seleccionado'}
            </span>
          </div>

          <div
            className={`${ui.dropzone} ${drag ? ui.drag : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDrag(true)}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { setDrag(false); handleDrop(e) }}
          >
            O arrastra y suelta aquí
          </div>
        </div>
      )}

      {/* Errores */}
      {errorMsg && (
        <div className={`${ui.error} ${ui.full}`} role="alert" aria-live="assertive">
          {errorMsg}
        </div>
      )}

      {/* Acciones */}
      <div className={`${ui.actions} ${ui.full}`}>
        {mode === 'edit' && autosaveEnabled && (
          <span aria-live="polite" className={ui.help}>
            {autoStatus === 'saving' && 'Guardando…'}
            {autoStatus === 'saved' && 'Guardado ✓'}
            {autoStatus === 'error' && 'Error al autoguardar'}
          </span>
        )}

        {onCancel && (
          <button type="button" className={ui.ghost} onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className={ui.primary} disabled={saving} aria-busy={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear minuta' : 'Guardar'}
        </button>
      </div>

      {/* Estilos del select */}
      <style jsx>{`
        .wt-wrap { position: relative; }
        .wt-select {
          width: 100%;
          padding: 12px 40px 12px 14px;
          border-radius: 14px;
          border: none;
          outline: none;
          background: #0c1626;
          color: #fff;
          font-size: 14px;
          line-height: 1.2;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        .wt-select:disabled { opacity: 0.9; cursor: not-allowed; }
        .wt-wrap::after {
          content: '▾';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          opacity: 0.75;
          font-size: 12px;
        }
      `}</style>
    </form>
  )
}
