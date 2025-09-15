// /src/pages/api/minutes/create.ts
/**
 * Crear MINUTA vía RPC (API Route) con reintentos + MODO DEBUG opcional
 * ============================================================================
 * - Dual auth: Authorization: Bearer <token> o cookies (getServerSupabase).
 * - Reintenta ante 23505/40001 con backoff.
 * - minute_create_rpc → fallback create_minute_safe_v2 (42883).
 * - DEBUG opcional: ?debug=1 o header x-debug: 1 → devuelve code/details/hint/constraint.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSupabase } from '@/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const VALID_WORK_TYPES = new Set(['gran_formato', 'publicomercial', 'editorial', 'empaques'])
const emptyToNull = (v?: string | null) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const normalizeWorkType = (v?: string | null) => {
  if (!v) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_')
  return VALID_WORK_TYPES.has(s) ? s : null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms + Math.floor(Math.random() * 50)))

/** Extrae nombre de constraint de un details típico de Postgres. */
function extractConstraint(details?: string | null): string | null {
  if (!details) return null
  const m = details.match(/constraint\s+"([^"]+)"/i)
  return m?.[1] ?? null
}

/** Ejecuta la RPC con reintentos ante 23505/40001 */
async function callCreateRPC(payload: any, maxRetries = 6) {
  let rpc = 'minute_create_rpc'
  let lastErr: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let { data, error } = await supabaseAdmin.rpc(rpc, payload as any)

    if (error && (error.code === '42883' || /No function matches|not found/i.test(error.message))) {
      rpc = 'create_minute_safe_v2'
      const r2 = await supabaseAdmin.rpc(rpc, payload as any)
      data = r2.data; error = r2.error
    }

    if (!error) return { data, rpc }

    lastErr = { ...error, rpc }
    const code = error.code
    const msg = String(error.message || '')

    const isUnique = code === '23505' || /duplicate key value/i.test(msg)
    const isSerialization = code === '40001' || /could not serialize/i.test(msg)

    if (isUnique || isSerialization) {
      await sleep(150 + attempt * 100)
      continue
    }
    break
  }

  return { error: lastErr }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const isDebug =
    req.query.debug === '1' ||
    String(req.headers['x-debug'] || '').toLowerCase() === '1'

  // 1) Resolver usuario: Authorization: Bearer ... (preferido) o cookies
  let userId: string | null = null
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    const accessToken = auth.slice(7)
    const supaFromHeader = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )
    const { data, error } = await supaFromHeader.auth.getUser()
    if (error) return res.status(401).json({ error: 'not_authenticated', detail: error.message })
    userId = data.user?.id ?? null
  } else {
    const s = getServerSupabase(req, res)
    const { data: { user }, error } = await s.auth.getUser()
    if (error) return res.status(401).json({ error: 'not_authenticated', detail: error.message })
    userId = user?.id ?? null
  }

  if (!userId) return res.status(401).json({ error: 'not_authenticated', detail: 'No user in session' })

  // 2) Payload normalizado
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    date?: string | null
    description?: string
    task_done?: string | null
    notes?: string | null
    work_type?: string | null
    is_protected?: boolean
  }

  const description = (body?.description ?? '').trim()
  if (!description) return res.status(400).json({ error: 'description is required' })

  const payload = {
    p_date: emptyToNull(body.date),
    p_description: description,
    p_tarea: emptyToNull(body.task_done) ?? '',
    p_novedades: emptyToNull(body.notes),
    p_work_type: normalizeWorkType(body.work_type),
    p_is_protected: !!body.is_protected,
    p_user_id: userId,
  }

  // 3) Llamada con reintentos
  const { data, error } = await callCreateRPC(payload, 6)

  // 4) Manejo de errores (+ DEBUG opcional)
  if (error) {
    const code = error.code as string | undefined
    const rpc = error.rpc as string | undefined
    const details = error.details as string | undefined
    const hint = error.hint as string | undefined
    const constraint = extractConstraint(details)

    // Log server para Vercel
    // eslint-disable-next-line no-console
    console.error('[minutes/create] RPC error', {
      rpc, code,
      message: error.message,
      details, hint, constraint,
      payload_dbg: { p_date: payload.p_date, p_user_id: `${userId?.slice(0,8)}…` }
    })

    // Status apropiado
    if (code === '23505' || /duplicate key value/i.test(String(error.message || ''))) {
      const bodyResp: any = { error: 'Se está asignando el número de minuta. Intenta nuevamente.' }
      if (isDebug) bodyResp.debug = { code, rpc, details, hint, constraint }
      return res.status(409).json(bodyResp)
    }
    if (code === '40001') {
      const bodyResp: any = { error: 'Conflicto de serialización. Intenta nuevamente.' }
      if (isDebug) bodyResp.debug = { code, rpc, details, hint, constraint }
      return res.status(409).json(bodyResp)
    }
    if (code === '42883') {
      const bodyResp: any = {
        error: 'RPC no encontrada. Aplica la migración SQL y recarga el esquema.'
      }
      if (isDebug) bodyResp.debug = { code, rpc, details, hint, constraint }
      return res.status(500).json(bodyResp)
    }
    if (/Could not choose the best candidate function/i.test(String(error.message || ''))) {
      const bodyResp: any = {
        error: 'RPC ambigua por sobrecargas antiguas. Deja una sola firma con p_user_id (7 args).'
      }
      if (isDebug) bodyResp.debug = { code, rpc, details, hint, constraint }
      return res.status(500).json(bodyResp)
    }

    const bodyResp: any = { error: error.message || 'No fue posible crear la minuta.' }
    if (isDebug) bodyResp.debug = { code, rpc, details, hint, constraint }
    return res.status(400).json(bodyResp)
  }

  // 5) OK
  return res.status(200).json({ ok: true, minute: data })
}
