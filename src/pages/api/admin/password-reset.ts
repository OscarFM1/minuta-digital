// src/pages/api/admin/password-reset.ts
/**
 * Reset de contraseña (ADMIN) — Endpoint conservador con control de require_change
 * -----------------------------------------------------------------------------
 * + Soporta body.require_change (boolean), default = true.
 *   Si es false, deja profiles.must_change_password = false (evita bucle).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  ALLOWED_ORIGINS,
  buildCorsHeadersFromReq,
  resolveRequestOrigin,
  isOriginAllowed,
} from '@/lib/allowedOrigins'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const LOGIN_DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local').trim()

type Ok = { ok: true; email: string; tempPassword?: string }
type Err = { ok: false; error: string; hint?: string }
type Resp = Ok | Err

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  const cors = buildCorsHeadersFromReq(req)

  if (req.method === 'OPTIONS') {
    res.setHeader('Vary', cors['Vary'])
    if ((cors as any)['Access-Control-Allow-Origin']) {
      res.setHeader('Access-Control-Allow-Origin', (cors as any)['Access-Control-Allow-Origin'])
      res.setHeader('Access-Control-Allow-Credentials', (cors as any)['Access-Control-Allow-Credentials'])
      res.setHeader('Access-Control-Allow-Methods', (cors as any)['Access-Control-Allow-Methods'])
      res.setHeader('Access-Control-Allow-Headers', (cors as any)['Access-Control-Allow-Headers'])
    }
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }
  if (!URL || !SERVICE) {
    return res.status(500).json({ ok: false, error: 'Faltan credenciales de servidor' })
  }

  const resolved = resolveRequestOrigin(req)
  if (!isOriginAllowed(resolved)) {
    return res.status(403).json({
      ok: false,
      error: 'Origen no permitido',
      hint: `Configura ALLOWED_ORIGINS. Resolved: ${resolved || '(vacío)'} | Lista: ${ALLOWED_ORIGINS.join(', ')}`,
    })
  }

  res.setHeader('Vary', cors['Vary'])
  res.setHeader('Access-Control-Allow-Origin', (cors as any)['Access-Control-Allow-Origin'] || resolved!)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  try {
    const expected = process.env.INTERNAL_ADMIN_TOKEN
    if (expected) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== expected) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
    }

    let body: any = req.body ?? {}
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch {} }

    const rawLogin: string =
      (typeof body.login === 'string' && body.login.trim()) ||
      (typeof body.email === 'string' && body.email.trim()) || ''

    if (!rawLogin) return res.status(400).json({ ok: false, error: 'login requerido' })

    // **Nuevo**: permite controlar si se requiere cambio posterior (default true)
    const requireChange: boolean = (typeof body.require_change === 'boolean') ? body.require_change : true

    const customPassword: string | undefined =
      (typeof body.password === 'string' && body.password.length > 0) ? body.password : undefined

    const email = rawLogin.includes('@')
      ? rawLogin.toLowerCase()
      : `${rawLogin.toLowerCase()}@${LOGIN_DOMAIN}`

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: page1, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    const user = page1.users.find(u => (u.email || '').toLowerCase() === email)
    if (!user) return res.status(404).json({ ok: false, error: `No existe ${email}` })

    const temp = customPassword || `Tmp-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}!`

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: temp })
    if (updErr) throw updErr

    // **Cambiado**: setear flag según requireChange
    const { error: updateErr } = await admin
      .from('profiles')
      .update({ must_change_password: requireChange, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (updateErr) throw updateErr

    const { data: existing, error: selErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (selErr && selErr.code !== 'PGRST116') throw selErr

    if (!existing) {
      const { error: insertErr } = await admin
        .from('profiles')
        .insert({ id: user.id, email, must_change_password: requireChange })
      if (insertErr) throw insertErr
    }

    return res.status(200).json({ ok: true, email, tempPassword: temp })
  } catch (e: any) {
    console.error('password-reset error:', e?.message || e)
    return res.status(500).json({ ok: false, error: e?.message || 'Error inesperado' })
  }
}
