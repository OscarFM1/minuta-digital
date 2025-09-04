// src/components/MinuteForm.tsx
/**
 * Formulario de crear/editar Minuta
 * - Crear: "Título de tarea" + "Tarea a realizar" (+ Tipo de trabajo obligatorio)
 * - Editar: "Tarea realizada" + Novedades (opcional) + Tipo de trabajo bloqueado (solo lectura)
 * - Start/Stop son la fuente de verdad para horas (no se editan aquí)
 */

import { useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { createMinute, updateMinute } from '@/lib/minutes'
import { uploadAttachment, createAttachmentRecords } from '@/lib/uploadAttachment'
import type { Minute } from '@/types/minute'
import ui from '@/styles/NewMinute.module.css'

// Work type: usamos las opciones y derivamos el tipo del array de valores
import { WORK_TYPE_OPTIONS, WORK_TYPE_VALUES } from '@/types/minute'
export type WorkType = (typeof WORK_TYPE_VALUES)[number] // ← exportado para uso externo si se requiere

/** Valores que este form maneja (sin horas) */
type FormValues = {
  tarea_realizada: string
  novedades: string
}

type MinuteId = string

export interface MinuteFormProps {
  mode: 'create' | 'edit'
  minuteId?: MinuteId
  /** Para editar: valores iniciales */
  initialValues?: Partial<FormValues>
  /**
   * Para visualizar en edición el tipo de trabajo ya guardado.
   * - En "edit", si viene con valor => el select queda bloqueado.
   * - Si no viene, el select queda habilitado (permite corregir data antigua).
   */
  initialWorkType?: WorkType | null
  onSaved?: (minute: Minute) => void
  onCancel?: () => void
  /** En crear ya no pedimos adjuntos; déjalo en false */
  requireAttachmentOnCreate?: boolean
  /** Autoguardado solo en edit */
  enableAutosave?: boolean
  autosaveDelayMs?: number
  /** Si algún día quisieras permitir novedades en create, actívalo */
  allowNovedadesInCreate?: boolean

  /** Desactiva la validación requerida del campo "tarea" cuando usas editor externo */
  ignoreTareaValidation?: boolean
  /** Valor espejo desde editor externo para mantener el estado interno consistente */
  tareaMirrorValue?: string
}

/** Util: hoy en YYYY-MM-DD (para que date NUNCA sea null en inserts) */
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
  const [title, setTitle] = useState<string>('') // "Título de tarea" -> description
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [autoStatus, setAutoStatus] =
    useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)

  // Tipo de trabajo:
  // - En "create": obligatorio y editable
  // - En "edit": bloqueado SOLO si hay valor inicial (evita dejarlo vacío y bloqueado)
  const [workType, setWorkType] = useState<WorkType | ''>(
    mode === 'edit' ? (initialWorkType ?? '') : ''
  )
  const workTypeReadOnly = mode === 'edit' && !!initialWorkType

  const autosaveEnabled = enableAutosave ?? mode === 'edit'
  const showNovedades = mode === 'edit' || allowNovedadesInCreate

  // Sincroniza valores iniciales cuando cambian (navegación entre minutas, etc.)
  useEffect(() => {
    setValues(init)
    setLastSaved(init)
  }, [init])

  // Si cambia el initialWorkType (p. ej. al cargar asíncrono), refresca el select en edición
  useEffect(() => {
    if (mode === 'edit') {
      setWorkType((initialWorkType ?? '') as WorkType | '')
    }
  }, [initialWorkType, mode])

  /** Mirror: si llega texto externo (editor propio), actualiza el estado interno */
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
    async (snapshot: FormValues) => {
      if (!autosaveEnabled || mode !== 'edit' || !minuteId) return
      if (isSame(snapshot, lastSaved)) {
        setAutoStatus('idle')
        return
      }

      try {
        setAutoStatus('saving')
        const updated = await updateMinute(minuteId, {
          tarea_realizada: snapshot.tarea_realizada.trim(),
          novedades: snapshot.novedades.trim() ? snapshot.novedades.trim() : null,
        })
        setLastSaved({
          tarea_realizada: snapshot.tarea_realizada,
          novedades: snapshot.novedades,
        })
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
    debouncedAutosave(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.tarea_realizada, values.novedades])

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
        // Novedades se completan luego del Stop; aquí van como null
        // ✅ Siempre enviamos date = hoy para evitar NOT NULL en BD
        const created = await createMinute({
          date: todayISO(),
          tarea_realizada: values.tarea_realizada.trim(),
          description: title.trim() ? title.trim() : undefined,
          novedades: null,
          work_type: workType || null,
          // start_time / end_time se manejan por Start/Stop fuera del form
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
        const updated = await updateMinute(minuteId, {
          tarea_realizada: values.tarea_realizada.trim(),
          novedades: values.novedades.trim() ? values.novedades.trim() : null,
        })
        setLastSaved(values)
        onSaved?.(updated)
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'No fue posible guardar.')
    } finally {
      setSaving(false)
    }
  }

  // Helpers UI archivos (compatibilidad; en /minutas/nueva se ocultan hasta tener minuteId)
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
          <label className={ui.label} htmlFor="title">
            Título de tarea
          </label>
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
            {/* Placeholder solo en create */}
            {mode === 'create' && <option value="" disabled>Selecciona una opción…</option>}
            {WORK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tarea (create: a realizar / edit: realizada) */}
      <div className={`${ui.field} ${ui.full}`}>
        <label className={ui.label} htmlFor="tarea">
          {mode === 'create' ? 'Tarea a realizar' : 'Tarea realizada'}
        </label>
        <textarea
          id="tarea"
          name="tarea_realizada"
          rows={6}
          placeholder={
            mode === 'create'
              ? 'Describe qué vas a realizar…'
              : 'Describe lo que realizaste…'
          }
          value={values.tarea_realizada}
          onChange={(e) =>
            setValues((prev: FormValues) => ({
              ...prev,
              tarea_realizada: e.target.value,
            }))
          }
          className={ui.textarea}
          required={mode === 'create' ? true : !ignoreTareaValidation}
        />
      </div>

      {/* Novedades (solo en edit por defecto) */}
      {showNovedades && (
        <div className={`${ui.field} ${ui.full}`}>
          <label className={ui.label} htmlFor="novedades">
            Novedades (opcional)
          </label>
          <textarea
            id="novedades"
            rows={4}
            placeholder="Anota novedades, bloqueos o hallazgos…"
            value={values.novedades}
            onChange={(e) =>
              setValues((prev: FormValues) => ({
                ...prev,
                novedades: e.target.value,
              }))
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
              {files.length > 0
                ? `${files.length} archivo(s): ${fileNames}`
                : 'Ningún archivo seleccionado'}
            </span>
          </div>

          <div
            className={`${ui.dropzone} ${drag ? ui.drag : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDrag(true)}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              setDrag(false)
              handleDrop(e)
            }}
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

      {/* --- Estilos del select (mejora UX / sin borde gris) --- */}
      <style jsx>{`
        .wt-wrap {
          position: relative;
        }
        .wt-select {
          width: 100%;
          padding: 12px 40px 12px 14px;
          border-radius: 14px;
          border: none;
          outline: none;
          background: #0c1626; /* mismo tono que inputs oscuros */
          color: #fff;
          font-size: 14px;
          line-height: 1.2;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        .wt-select:disabled {
          opacity: 0.9;          /* leve diferencia para indicar lectura */
          cursor: not-allowed;
        }
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
