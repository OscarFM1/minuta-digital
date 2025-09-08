// src/lib/minute/create.ts
/**
 * Crear Minute (cliente)
 * - Envía solo campos de negocio.
 * - El trigger completa user_id y metadatos del creador.
 */
import { supabase } from '@/lib/supabaseClient'

export type CreateMinuteInput = {
  date: string;                 // 'YYYY-MM-DD' (NOT NULL en schema)
  start_time?: string | null;   // 'HH:mm'
  end_time?: string | null;     // 'HH:mm'
  description?: string;         // default '' en BD, pero envía algo útil
  notes?: string | null;
  work_type?: 'gran_formato' | 'publicomercial' | 'editorial' | 'empaques';
}

export async function createMinute(input: CreateMinuteInput) {
  if (!input?.date) throw new Error('La fecha es obligatoria')

  // Asegura sesión lista
  const { data: { session }, error: sErr } = await supabase.auth.getSession()
  if (sErr) throw sErr
  if (!session?.user?.id) throw new Error('No hay sesión')

  // Validar work_type si se envía
  if (input.work_type && !['gran_formato','publicomercial','editorial','empaques'].includes(input.work_type)) {
    throw new Error('work_type inválido')
  }

  const payload = {
    date: input.date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    description: input.description ?? '',
    notes: input.notes ?? null,
    work_type: input.work_type ?? null,
    // user_id, folio, folio_serial → los pone el trigger/otros triggers
  }

  const { data, error } = await supabase
    .from('minute')
    .insert(payload)
    .select('id, created_at, date, start_time, end_time, description, notes, work_type, folio, folio_serial, user_id, created_by_name, created_by_email')
    .single()

  if (error) {
    console.error('[createMinute] error:', JSON.stringify(error, null, 2))
    // Errores comunes: 42501 (RLS), 23502 (NOT NULL), 23514 (CHECK work_type)
    throw new Error(`No se pudo crear la minuta. Código: ${error.code ?? 'N/A'}`)
  }
  return data
}
