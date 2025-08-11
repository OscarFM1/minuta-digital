// src/lib/minutes.ts
import { supabase } from './supabaseClient';
import type { Minute, MinuteId, MinuteFormValues, MinuteUpdate } from '@/types/minute';

/** Normaliza la respuesta de la RPC a { folio, folio_serial } o nulls. */
function extractFolioFromRpc(rpcData: any): { folio: string | null; folio_serial: number | null } {
  const row = Array.isArray(rpcData) ? rpcData?.[0] : rpcData;

  if (row == null) return { folio: null, folio_serial: null };

  // Caso: función devuelve un único valor (string/number) -> lo tratamos como next_folio
  if (typeof row === 'string' || typeof row === 'number') {
    const s = String(row);
    const serial = parseInt(s, 10);
    return {
      folio: s.padStart(4, '0'),
      folio_serial: Number.isNaN(serial) ? null : serial,
    };
  }

  // Caso: { folio, folio_serial }
  if (typeof row.folio === 'string' && typeof row.folio_serial === 'number') {
    return { folio: row.folio, folio_serial: row.folio_serial };
  }

  // Caso: { next_folio: '0012' }
  if (typeof row.next_folio === 'string') {
    const n = parseInt(row.next_folio, 10);
    return {
      folio: row.next_folio,
      folio_serial: Number.isNaN(n) ? null : n,
    };
  }

  return { folio: null, folio_serial: null };
}

/** Obtiene una minuta por ID (incluye folio y fecha). */
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
 * - Intenta obtener el folio por usuario vía RPC (tolerante a distintos "shapes").
 * - Envía strings seguros (sin null) para respetar NOT NULL de la tabla.
 */
export async function createMinute(values: MinuteFormValues): Promise<Minute> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(`No se pudo obtener el usuario: ${userErr.message}`);
  const user = userData.user;
  if (!user) throw new Error('No hay sesión activa.');

  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

  // Normaliza texto
  const tarea = (values.tarea_realizada ?? '').trim();
  const novedades = (values.novedades ?? '').trim();
  const novedadesValue = novedades.length ? novedades : null;

  // --- RPC de folio (defensivo: soporta {folio, folio_serial}, {next_folio} o escalar)
  let folio_serial: number | null = null;
  let folio: string | null = null;
  try {
    const { data: rpcData } = await supabase.rpc('next_minute_folio_for_user', {
      p_user_id: user.id,
    });
    const parsed = extractFolioFromRpc(rpcData);
    folio = parsed.folio;
    folio_serial = parsed.folio_serial;
  } catch {
    // Si la RPC no existe o falla, seguimos sin folio (el UI cae a fallback visible).
  }

  const { data, error } = await supabase
    .from('minute')
    .insert({
      user_id: user.id,
      folio_serial,
      folio,
      date: today,
      start_time: values.start_time,      // TIME "HH:MM"
      end_time: values.end_time,          // TIME "HH:MM"
      tarea_realizada: tarea,             // nunca null
      description: tarea,                 // espejo de tarea_realizada
      novedades: novedadesValue,          // null cuando está vacío
      created_by_name: user.user_metadata?.full_name ?? null,
      created_by_email: user.email ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`No fue posible crear la minuta: ${error.message}`);
  return data as Minute;
}

/** Actualiza campos editables (sincroniza description con tarea_realizada). */
export async function updateMinute(id: MinuteId, patch: MinuteUpdate): Promise<Minute> {
  const body: Record<string, any> = { ...patch };

  if (typeof patch.tarea_realizada === 'string') {
    const t = patch.tarea_realizada.trim();
    body.tarea_realizada = t;
    body.description = t; // mantener espejo
  }
  if (typeof patch.novedades === 'string') {
    const n = patch.novedades.trim();
    body.novedades = n.length ? n : null;
  }

  const { data, error } = await supabase
    .from('minute')
    .update(body)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`No fue posible actualizar la minuta: ${error.message}`);
  return data as Minute;
}

/** Sube un archivo al bucket 'attachments' y devuelve el storage path. */
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

/** Inserta registros en 'attachment' (envía created_by para evitar NULLs). */
export async function createAttachmentRecords(minuteId: MinuteId, paths: string[]) {
  if (!paths.length) return;

  const { data: userData, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw new Error(`No se pudo obtener el usuario: ${uErr.message}`);
  const userId = userData.user?.id;
  if (!userId) throw new Error('No hay sesión activa.');

  const payload = paths.map((p) => ({ minute_id: minuteId, path: p, created_by: userId }));

  const { error } = await supabase.from('attachment').insert(payload);
  if (error) throw new Error(`No fue posible registrar adjuntos: ${error.message}`);
}
