// /src/pages/api/minutes/create.ts
/**
 * API centralizada para crear MINUTAS
 * ============================================================================
 * - Obtiene el usuario real desde cookies (via createServerClient).
 * - Usa service_role solo para ejecutar la RPC, pero forzando p_user_id del usuario.
 * - Intenta primero minute_create_rpc; fallback a create_minute_safe_v2.
 * - Manejo de errores: 23505 (concurrencia), 42883 (función no encontrada),
 *   sobrecargas antiguas, etc.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// -----------------------------
// Cookie adapter (para @supabase/ssr)
// -----------------------------
function cookieAdapter(req: NextApiRequest, res: NextApiResponse) {
  return {
    get(name: string) {
      return req.cookies[name]
    },
    set(name: string, value: string, options: any) {
      res.setHeader('Set-Cookie', serialize(name, value, options))
    },
    remove(name: string, options: any) {
      res.setHeader('Set-Cookie', serialize(name, '', { ...options, maxAge: 0 }))
    },
  }
}

// -----------------------------
// Helpers de normalización
// -----------------------------
const VALID_WORK_TYPES = new Set(['gran_formato', 'publicomercial', 'editorial', 'empaques'])

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function normalizeWorkType(v?: string | null) {
  if (!v) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_')
  return VALID_WORK_TYPES.has(s) ? s : null
}

// -----------------------------
// Handler principal
// -----------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1) Usuario real (para p_user_id) desde cookies del navegador
  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieAdapter(req, res) },
  )

  const { data: userData, error: userErr } = await s.auth.getUser()
  const user = userData?.user

  if (userErr) return res.status(401).json({ error: userErr.message })
  if (!user) return res.status(401).json({ error: 'No authenticated user' })

  // 2) Payload (normalizado)
  const body = (req.body ?? {}) as {
    date?: string | null
    description?: string
    task_done?: string | null
    notes?: string | null
    work_type?: string | null
    is_protected?: boolean
  }

  const description = (body.description ?? '').trim()
  if (!description) {
    return res.status(400).json({ error: 'description is required' })
  }

  const payload = {
    p_date: emptyToNull(body.date),
    p_description: description,
    p_tarea: emptyToNull(body.task_done) ?? '',
    p_novedades: emptyToNull(body.notes),
    p_work_type: normalizeWorkType(body.work_type),
    p_is_protected: !!body.is_protected,
    p_user_id: user.id, // clave: asegura usuario aunque el JWT no llegue a PostgREST
  }

  // 3) Intento 1: wrapper limpio minute_create_rpc
  let rpcName = 'minute_create_rpc'
  let result = await supabaseAdmin.rpc(rpcName, payload as any)

  // 3.1) Fallback si la RPC no existe o el esquema está cacheado
  if (
    result.error &&
    (result.error.code === '42883' ||
      /not found|No function matches/i.test(result.error.message))
  ) {
    rpcName = 'create_minute_safe_v2'
    result = await supabaseAdmin.rpc(rpcName, payload as any)
  }

  // 4) Manejo de errores
  if (result.error) {
    const err = result.error

    if (err.code === '23505' || /reintentos/i.test(err.message)) {
      return res.status(409).json({
        error: 'Se está asignando el número de minuta. Intenta nuevamente.',
      })
    }

    if (err.code === '42883') {
      return res.status(500).json({
        error: `RPC ${rpcName} no encontrada. Aplica la migración SQL y recarga el esquema (pg_notify 'pgrst','reload schema').`,
      })
    }

    if (/Could not choose the best candidate function/i.test(err.message)) {
      return res.status(500).json({
        error:
          'RPC ambigua por sobrecargas antiguas. Elimina sobrecargas y deja una sola firma con p_user_id (7 args).',
      })
    }

    return res
      .status(400)
      .json({ error: err.message || 'No fue posible crear la minuta.' })
  }

  // 5) OK
  return res.status(200).json({ ok: true, minute: result.data })
}
