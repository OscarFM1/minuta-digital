// src/lib/api/adminMinutes.ts
// ----------------------------------------------------------------------------
// Listado Admin vía RPC SECURITY DEFINER. Sin genéricos en rpc() para evitar
// conflictos con los Database types generados; casteamos el resultado.
// ----------------------------------------------------------------------------

import { supabase } from '@/lib/supabaseClient'

export type AdminMinuteRow = {
  id: string
  date: string | null
  folio: string | null
  folio_serial: number | null
  description: string | null
  created_at: string | null
  created_by_name: string | null
  created_by_email: string | null
  total_count: number
}

export type AdminListMinutesArgs = {
  p_page?: number
  p_page_size?: number
  p_user_q?: string | null
  p_from?: string | null // 'YYYY-MM-DD'
  p_to?: string | null   // 'YYYY-MM-DD'
}

export async function fetchAdminMinutesRPC(
  page = 1,
  pageSize = 50,
  userQuery?: string,
  from?: string, // 'YYYY-MM-DD'
  to?: string    // 'YYYY-MM-DD'
) {
  const args: AdminListMinutesArgs = {
    p_page: Math.max(1, page),
    p_page_size: Math.max(1, pageSize),
    p_user_q: userQuery && userQuery.trim() ? userQuery.trim() : null,
    p_from: from ?? null,
    p_to: to ?? null,
  }

  // ✅ sin genéricos; casteamos data al tipo esperado
  const { data, error } = await supabase.rpc('admin_list_minutes', args)

  if (error) {
    // Propaga con contexto para que la UI lo muestre
    throw new Error(`admin_list_minutes RPC failed: ${error.message}`)
  }

  const rows = (data as unknown as AdminMinuteRow[]) ?? []
  const total = rows[0]?.total_count ?? 0

  return { rows, total }
}
