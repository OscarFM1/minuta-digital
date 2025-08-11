// src/lib/minutes.ts
import { supabase } from './supabaseClient';
import type { Minute, MinuteId, MinuteFormValues, MinuteUpdate } from '@/types/minute';

export async function getMinuteById(id: MinuteId): Promise<Minute> {
  const { data, error } = await supabase
    .from('minute')
    .select(`
      id, user_id, start_time, end_time, tarea_realizada, novedades,
      created_by_name, created_by_email, created_at, updated_at
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(`Error al cargar la minuta: ${error.message}`);
  return data as Minute;
}

/**
 * Crea una minuta y retorna el registro creado.
 * Capa de seguridad: RLS owner en 'minute' debe permitir INSERT al usuario logueado.
 * Los adjuntos se suben después, usando el id de la minuta.
 */
export async function createMinute(values: MinuteFormValues): Promise<Minute> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(`No se pudo obtener el usuario: ${userErr.message}`);
  const user = userData.user;
  if (!user) throw new Error('No hay sesión activa.');

  const { data, error } = await supabase
    .from('minute')
    .insert({
      user_id: user.id,
      start_time: values.start_time,
      end_time: values.end_time,
      tarea_realizada: values.tarea_realizada,
      novedades: values.novedades || null,
      created_by_name: user.user_metadata?.full_name ?? null,
      created_by_email: user.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(`No fue posible crear la minuta: ${error.message}`);
  return data as Minute;
}

/**
 * Actualiza campos editables de una minuta.
 * RLS owner en 'minute' debe permitir UPDATE al dueño; admin solo lectura -> recibirá error.
 */
export async function updateMinute(id: MinuteId, patch: MinuteUpdate): Promise<Minute> {
  const { data, error } = await supabase
    .from('minute')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`No fue posible actualizar la minuta: ${error.message}`);
  return data as Minute;
}

/**
 * Sube un archivo al bucket 'attachments' dentro de la carpeta de la minuta.
 * Retorna la ruta almacenada en el Storage (storage path).
 */
export async function uploadAttachment(file: File, minuteId: MinuteId): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const sanitizedName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${minuteId}/${Date.now()}_${sanitizedName}`;

  const { error: upErr } = await supabase.storage
    .from('attachments')
    .upload(path, file, {
      contentType: file.type || `application/octet-stream`,
      upsert: false,
    });

  if (upErr) throw new Error(`No fue posible subir el archivo ${file.name}: ${upErr.message}`);
  return path;
}

/**
 * Crea registros en la tabla 'attachment' asociados a la minuta.
 * Asume que RLS owner en 'attachment' permite INSERT al dueño de la minuta.
 */
export async function createAttachmentRecords(minuteId: MinuteId, paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase
    .from('attachment')
    .insert(paths.map((p) => ({ minute_id: minuteId, path: p })));

  if (error) throw new Error(`No fue posible registrar adjuntos: ${error.message}`);
}
