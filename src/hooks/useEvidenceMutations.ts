/**
 * useEvidenceMutations
 * --------------------
 * Hook centralizado para crear/eliminar evidencias (attachments) asociadas a una minuta.
 * Acepta una "capability" explícita para permitir/denegar acciones de mutación en cliente.
 * 
 * IMPORTANTE: La seguridad final recae en RLS (ver más abajo). Esta capa es un guardado extra de UX.
 */

import { useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type EvidenceCapabilities = {
  /** Si es false, TODO intento de crear/editar/eliminar evidencias desde UI debe fallar de inmediato. */
  canMutateEvidence: boolean;
};

export function useEvidenceMutations({ canMutateEvidence }: EvidenceCapabilities) {
  /**
   * Crea una evidencia (attachment) asociada a una minuta.
   * @param minuteId ID de la minuta dueña del attachment
   * @param file Archivo a subir a Storage
   * @throws Error si canMutateEvidence es false o si la operación de Supabase falla
   */
  const createEvidence = useCallback(async (minuteId: string, file: File) => {
    if (!canMutateEvidence) {
      throw new Error('Acción no permitida: esta vista es de solo lectura para evidencias.');
    }

    // 1) Subir a Storage (ruta: minutes/<minuteId>/<file.name>)
    const path = `minutes/${minuteId}/${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('evidences').upload(path, file, {
      upsert: false,
    });
    if (uploadErr) throw uploadErr;

    // 2) Crear registro en attachment (nota: RLS validará propiedad del minuto)
    const { error: insertErr } = await supabase.from('minute_attachment').insert({
      minute_id: minuteId,
      path, // o url si transformas posteriormente
    });
    if (insertErr) {
      // rollback voluntario del Storage si quieres evitar basura (best-effort)
      await supabase.storage.from('evidences').remove([path]).catch(() => {});
      throw insertErr;
    }
  }, [canMutateEvidence]);

  /**
   * Elimina una evidencia existente.
   * @param attachmentId ID del attachment
   * @param storagePath ruta del archivo en Storage
   */
  const deleteEvidence = useCallback(async (attachmentId: string, storagePath: string) => {
    if (!canMutateEvidence) {
      throw new Error('Acción no permitida: esta vista es de solo lectura para evidencias.');
    }

    // 1) Eliminar archivo de Storage
    const { error: delErr } = await supabase.storage.from('evidences').remove([storagePath]);
    if (delErr) throw delErr;

    // 2) Eliminar registro attachment
    const { error: sqlErr } = await supabase.from('minute_attachment').delete().eq('id', attachmentId);
    if (sqlErr) throw sqlErr;
  }, [canMutateEvidence]);

  return { createEvidence, deleteEvidence };
}
