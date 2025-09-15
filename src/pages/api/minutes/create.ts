// /src/pages/api/minutes/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSupabase } from '@/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// ----------------------------- Helpers ---------------------------------------
const VALID_WORK_TYPES = new Set(['gran_formato', 'publicomercial', 'editorial', 'empaques'])
const emptyToNull = (v?: string | null) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const normalizeWorkType = (v?: string | null) => {
  if (!v) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '_')
  return VALID_WORK_TYPES.has(s) ? s : null
}

// ----------------------------- Handler ---------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1) Resolver usuario por dos vías: Authorization header (preferida) o cookies
  let userId: string | null = null
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    // === Carril 1: token enviado por el cliente en el header ===
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
    // === Carril 2: cookies (como ya tenías) ===
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

  // 3) RPC limpia → fallback
  let rpc = 'minute_create_rpc'
  let { data, error } = await supabaseAdmin.rpc(rpc, payload as any)

  if (error && (error.code === '42883' || /No function matches|not found/i.test(error.message))) {
    rpc = 'create_minute_safe_v2'
    const r2 = await supabaseAdmin.rpc(rpc, payload as any)
    data = r2.data; error = r2.error
  }

  // 4) Errores mapeados
  if (error) {
    if (error.code === '23505' || /reintentos/i.test(error.message)) {
      return res.status(409).json({ error: 'Se está asignando el número de minuta. Intenta nuevamente.' })
    }
    if (error.code === '42883') {
      return res.status(500).json({
        error: `RPC ${rpc} no encontrada. Aplica la migración SQL y recarga esquema (pg_notify 'pgrst','reload schema').`,
      })
    }
    if (/Could not choose the best candidate function/i.test(error.message)) {
      return res.status(500).json({
        error: 'RPC ambigua por sobrecargas antiguas. Deja una sola firma con p_user_id (7 args).',
      })
    }
    return res.status(400).json({ error: error.message || 'No fue posible crear la minuta.' })
  }

  // 5) OK
  return res.status(200).json({ ok: true, minute: data })
}
