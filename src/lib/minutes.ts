// src/lib/minutes.ts
import { supabase } from './supabaseClient';
import type { Minute, MinuteId, MinuteFormValues, MinuteUpdate } from '@/types/minute';

/**
 * Obtiene una minuta por ID (incluye folio y fecha).
 */
export async function getMinuteById(id: MinuteId): Promise<Minute> {
  const { data, error } = await supabase
    .from('minute')
    .select(`
      id, user_id,
      folio, folio_serial, date,
      start_time, end_time, tarea_realizada, novedades, description,
      created_by_name, created_by_email, created_at, updated_at
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(`Error al cargar la minuta: ${error.message}`);
  return data as Minute;
}

/**
 * Crea una minuta.
 * - Folio por usuario (RPC) con fallback seguro.
 * - Siempre manda strings seguros (sin null) para campos NOT NULL.
 */
export async function createMinute(values: MinuteFormValues): Promise<Minute> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(`No se pudo obtener el usuario: ${userErr.message}`);
  const user = userData.user;
  if (!user) throw new Error('No hay sesión activa.');

  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

  // Normaliza strings (evita undefined/null)
  const tarea = (values.tarea_realizada ?? '').trim();
  const novedades = (values.novedades ?? '').trim();
  const novedadesValue = novedades.length ? novedades : null;

  // --- RPC folio (robusta) ---
  let folio_serial: number | null = null;
  let folio: string | null = null;
  try {
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('next_minute_folio_for_user', { p_user_id: user.id });

    if (!rpcErr && rpcData) {
      const row: any = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (row && typeof row.folio_serial === 'number' && typeof row.folio === 'string') {
        folio_serial = row.folio_serial;
        folio = row.folio;
      } else if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[folio RPC] formato inesperado:', rpcData);
      }
    } else if (rpcErr && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[folio RPC] error:', rpcErr);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[folio RPC] excepción:', e);
    }
  }

  // --- INSERT ---
  const { data, error } = await supabase
    .from('minute')
    .insert({
      user_id: user.id,
      folio_serial,
      folio,
      date: today,
      start_time: values.start_time,      // TIME
      end_time: values.end_time,          // TIME
      tarea_realizada: tarea,             // nunca null
      description: tarea,                 // mantener NOT NULL en DB
      novedades: novedadesValue,          // null solo si vacío
      created_by_name: user.user_metadata?.full_name ?? null,
      created_by_email: user.email ?? null
      // updated_at lo maneja trigger en BD (si lo configuraste)
    })
    .select('*')
    .single();

  if (error) throw new Error(`No fue posible crear la minuta: ${error.message}`);
  return data as Minute;
}

/**
 * Actualiza campos editables.
 * - Mantiene description sincronizada con tarea_realizada y evita nulls.
 */
export async function updateMinute(id: MinuteId, patch: MinuteUpdate): Promise<Minute> {
  const patchToSend: Record<string, any> = { ...patch };

  if (typeof patch.tarea_realizada === 'string') {
    const tarea = patch.tarea_realizada.trim();
    patchToSend.tarea_realizada = tarea;
    patchToSend.description = tarea; // sync
  }
  if (typeof patch.novedades === 'string') {
    const nov = patch.novedades.trim();
    patchToSend.novedades = nov.length ? nov : null;
  }

  const { data, error } = await supabase
    .from('minute')
    .update(patchToSend)
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
  const sanitizedName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${minuteId}/${Date.now()}_${sanitizedName}`;

  const { error: upErr } = await supabase.storage
    .from('attachments')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (upErr) throw new Error(`No fue posible subir el archivo ${file.name}: ${upErr.message}`);
  return path;
}

/**
 * Crea registros en la tabla 'attachment' asociados a la minuta.
 * Enviamos created_by explícito para no depender del DEFAULT si el schema cache
 * de PostgREST aún no se actualiza.
 */
export async function createAttachmentRecords(minuteId: MinuteId, paths: string[]) {
  if (!paths.length) return;

  // Usuario actual para setear created_by
  const { data: userData, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw new Error(`No se pudo obtener el usuario: ${uErr.message}`);
  const userId = userData.user?.id;
  if (!userId) throw new Error('No hay sesión activa.');

  const payload = paths.map((p) => ({
    minute_id: minuteId,
    path: p,
    created_by: userId, // clave para evitar NULL
  }));

  const { error } = await supabase.from('attachment').insert(payload);

  if (error) {
    // ayuda en depuración si alguna policy/columna falla
    // eslint-disable-next-line no-console
    console.error('[attachment insert] error:', error);
    throw new Error(`No fue posible registrar adjuntos: ${error.message}`);
  }
}
