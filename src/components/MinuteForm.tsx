// src/components/MinuteForm.tsx
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { createAttachmentRecords, createMinute, updateMinute, uploadAttachment } from '@/lib/minutes';
import type { Minute, MinuteFormValues, MinuteId } from '@/types/minute';
import styles from '@/styles/Minutas.module.css';

interface MinuteFormProps {
  mode: 'create' | 'edit';
  minuteId?: MinuteId;
  initialValues?: MinuteFormValues;
  onSaved?: (minute: Minute) => void;
  onCancel?: () => void;
  requireAttachmentOnCreate?: boolean;
  enableAutosave?: boolean;
  autosaveDelayMs?: number;
}

export default function MinuteForm({
  mode,
  minuteId,
  initialValues,
  onSaved,
  onCancel,
  requireAttachmentOnCreate = true,
  enableAutosave,
  autosaveDelayMs = 800,
}: MinuteFormProps) {
  const init = useMemo<MinuteFormValues>(
    () =>
      initialValues ?? {
        start_time: '',
        end_time: '',
        tarea_realizada: '',
        novedades: '',
      },
    [initialValues]
  );

  const [values, setValues] = useState<MinuteFormValues>(init);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoStatus, setAutoStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const autosaveEnabled = enableAutosave ?? (mode === 'edit');

  useEffect(() => {
    setValues(init);
  }, [init]);

  const validate = (v: MinuteFormValues): string | null => {
    if (!v.tarea_realizada.trim()) return 'La "tarea realizada" no puede estar vacía.';
    if (v.start_time && v.end_time && v.end_time < v.start_time) {
      return 'La hora fin no puede ser menor que la hora inicio.';
    }
    if (mode === 'create' && requireAttachmentOnCreate && files.length === 0) {
      return 'Debes adjuntar al menos un archivo como evidencia.';
    }
    return null;
  };

  const onChangeField = (key: keyof MinuteFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const { debounced: debouncedAutosave } = useDebouncedCallback(async (snapshot: MinuteFormValues) => {
    if (!autosaveEnabled || mode !== 'edit' || !minuteId) return;
    const err = validate(snapshot);
    if (err) {
      setErrorMsg(err);
      setAutoStatus('error');
      return;
    }
    try {
      setAutoStatus('saving');
      const updated = await updateMinute(minuteId, {
        start_time: snapshot.start_time,
        end_time: snapshot.end_time,
        tarea_realizada: snapshot.tarea_realizada,
        novedades: snapshot.novedades,
      });
      setAutoStatus('saved');
      setErrorMsg(null);
      onSaved?.(updated);
      setTimeout(() => setAutoStatus('idle'), 1200);
    } catch (e: any) {
      setAutoStatus('error');
      setErrorMsg(e.message ?? 'No fue posible autoguardar.');
    }
  }, autosaveDelayMs);

  useEffect(() => {
    if (mode !== 'edit' || !autosaveEnabled) return;
    debouncedAutosave(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.start_time, values.end_time, values.tarea_realizada, values.novedades]);

  const onSubmit = async () => {
    const err = validate(values);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      if (mode === 'create') {
        const created = await createMinute(values);
        if (files.length > 0) {
          const paths: string[] = [];
          for (const f of files) {
            const path = await uploadAttachment(f, created.id);
            paths.push(path);
          }
          await createAttachmentRecords(created.id, paths);
        }
        onSaved?.(created);
      } else if (mode === 'edit' && minuteId) {
        const updated = await updateMinute(minuteId, {
          start_time: values.start_time,
          end_time: values.end_time,
          tarea_realizada: values.tarea_realizada,
          novedades: values.novedades,
        });
        onSaved?.(updated);
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'No fue posible guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={styles.editForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.formRow}>
        <label>Hora inicio</label>
        <input
          type="time"
          step={300}
          value={values.start_time}
          onChange={(e) => onChangeField('start_time', e.target.value)}
          required
        />
      </div>

      <div className={styles.formRow}>
        <label>Hora fin</label>
        <input
          type="time"
          step={300}
          value={values.end_time}
          onChange={(e) => onChangeField('end_time', e.target.value)}
          required
        />
      </div>

      <div className={styles.formCol}>
        <label>Tarea realizada</label>
        <textarea
          rows={6}
          placeholder="Describe la tarea realizada…"
          value={values.tarea_realizada}
          onChange={(e) => onChangeField('tarea_realizada', e.target.value)}
          required
        />
      </div>

      <div className={styles.formCol}>
        <label>Novedades (opcional)</label>
        <textarea
          rows={4}
          placeholder="Anota novedades, bloqueos o hallazgos…"
          value={values.novedades}
          onChange={(e) => onChangeField('novedades', e.target.value)}
        />
      </div>

      {mode === 'create' && (
        <div className={styles.formCol}>
          <label>Adjuntos {requireAttachmentOnCreate ? '(al menos 1)' : ''}</label>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <div className={styles.hint}>
              {files.length} archivo(s) seleccionado(s)
            </div>
          )}
        </div>
      )}

      {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

      <div className={styles.actions}>
        {mode === 'edit' && autosaveEnabled && (
          <span className={styles.autosaveBadge}>
            {autoStatus === 'saving' && 'Guardando…'}
            {autoStatus === 'saved' && 'Guardado ✓'}
            {autoStatus === 'error' && 'Error al autoguardar'}
            {autoStatus === 'idle' && ' '}
          </span>
        )}
        {onCancel && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={saving}
        >
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear minuta' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
