/**
 * Formulario de crear/editar Minuta
 * - Crear: "Título de tarea" + "Tarea a realizar" (sin Novedades)
 * - Editar: "Tarea realizada" + Novedades (opcional)
 * - Start/Stop son la fuente de verdad para horas (no se editan aquí)
 * - Normaliza '' -> null/undefined antes de persistir
 *
 * Nuevas props:
 * - ignoreTareaValidation?: boolean  -> desactiva la validación requerida del campo "tarea".
 * - tareaMirrorValue?: string        -> espejo desde un editor externo para poblar el estado interno y pasar validaciones.
 *
 * ⚠️ Workers: al crear solo pueden crear la minuta y adjuntar evidencias.
 *   No hay edición de tiempos ni asignación manual de fechas en este form.
 */

import { useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { createMinute, updateMinute } from '@/lib/minutes'
import { uploadAttachment, createAttachmentRecords } from '@/lib/uploadAttachment'
import type { Minute } from '@/types/minute'
import ui from '@/styles/NewMinute.module.css'
import { WORK_TYPE_OPTIONS } from '@/types/minute'

/** Valores que este form maneja (sin horas) */
type FormValues = {
  tarea_realizada: string
  novedades: string
  /** Nuevo: tipo de trabajo ('' = sin seleccionar) */
  work_type: string
}

type MinuteId = string

interface MinuteFormProps {
  mode: 'create' | 'edit'
  minuteId?: MinuteId
  /** Para editar: valores iniciales */
  initialValues?: Partial<FormValues>
  onSaved?: (minute: Minute) => void
  onCancel?: () => void
  /** En crear ya no pedimos adjuntos; déjalo en false */
  requireAttachmentOnCreate?: boolean
  /** Autoguardado solo en edit */
  enableAutosave?: boolean
  autosaveDelayMs?: number
  /** Si algún día quisieras permitir novedades en create, actívalo */
  allowNovedadesInCreate?: boolean

  /** ✅ NUEVO: desactiva el "required" de tarea_realizada (cuando usas editor externo) */
  ignoreTareaValidation?: boolean
  /** ✅ NUEVO: valor espejo desde editor externo para mantener el estado interno consistente */
  tareaMirrorValue?: string
}

/** Util: hoy en YYYY-MM-DD (para que date NUNCA sea null en inserts) */
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function MinuteForm({
  mode,
  minuteId,
  initialValues,
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
      work_type: initialValues?.work_type ?? '', // '' = sin seleccionar
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

  const autosaveEnabled = enableAutosave ?? mode === 'edit'
  const showNovedades = mode === 'edit' || allowNovedadesInCreate

  useEffect(() => {
    setValues(init)
    setLastSaved(init)
  }, [init])

  /** ✅ Mirror: si llega texto externo (editor propio), actualiza el estado interno */
  useEffect(() => {
    if (mode !== 'edit') return
    if (typeof tareaMirrorValue !== 'string') return
    if (tareaMirrorValue === values.tarea_realizada) return
    setValues((prev) => ({ ...prev, tarea_realizada: tareaMirrorValue }))
  }, [tareaMirrorValue, mode, values.tarea_realizada])

  // -------- Helpers --------
  const isSame = (a: FormValues, b: FormValues) =>
    a.tarea_realizada === b.tarea_realizada &&
    a.novedades === b.novedades &&
    a.work_type === b.work_type

  const validateForSubmit = (): string | null => {
    if (!ignoreTareaValidation && !values.tarea_realizada.trim())
      return 'La "tarea" no puede estar vacía.'
    if (mode === 'create' && !values.work_type)
      return 'Selecciona el tipo de trabajo.'
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
          work_type: snapshot.work_type || null,
        })
        setLastSaved({
          tarea_realizada: snapshot.tarea_realizada,
          novedades: snapshot.novedades,
          work_type: snapshot.work_type,
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
  }, [values.tarea_realizada, values.novedades, values.work_type])

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
          work_type: values.work_type || null,
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
          work_type: values.work_type || null,
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

  // Guardado inmediato del tipo (evita que “parezca” que recarga)
  const onWorkTypeChange = async (v: string) => {
    setValues(prev => ({ ...prev, work_type: v }))
    if (mode === 'edit' && minuteId) {
      try {
        setAutoStatus('saving')
        const updated = await updateMinute(minuteId, { work_type: v || null })
        setLastSaved(prev => ({ ...prev, work_type: v }))
        setAutoStatus('saved')
        onSaved?.(updated)
        setTimeout(() => setAutoStatus('idle'), 800)
      } catch {
        setAutoStatus('error')
      }
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
          Tipo de trabajo
        </label>
        <select
          id="work_type"
          value={values.work_type}
          onChange={(e) => onWorkTypeChange(e.target.value)}
          className={ui.select}
          // Obligatorio en create, opcional en edit
          required={mode === 'create'}
        >
          <option value="">Selecciona un tipo…</option>
          {WORK_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
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
    </form>
  )
}
