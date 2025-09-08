// src/pages/api/admin/password-reset.ts
/**
 * Reset de contraseña (ADMIN) — Endpoint único
 * -----------------------------------------------------------------------------
 * - CORS unificado con /lib/allowedOrigins (wildcards + fallback proto/host).
 * - Preflight OPTIONS → 204 con headers CORS.
 * - POST: { login?: string; password?: string }
 *   - Acepta "login" o "correo"; si no trae "@", usa @login.local (ENV).
 *   - Busca usuario via Admin API (service_role).
 *   - Upsert en profiles: must_change_password=true.
 *   - Actualiza contraseña en Auth.
 *
 * ENV requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ALLOWED_ORIGINS="https://minuta-digital.vercel.app,*.vercel.app"
 *   (Opcional) INTERNAL_ADMIN_TOKEN  -> Authorization: Bearer <token>
 *   (Opcional) NEXT_PUBLIC_LOGIN_DOMAIN="login.local"
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

  // Preflight
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

  // Enforce CORS (acepta Origin o proto+host)
  const resolved = resolveRequestOrigin(req)
  if (!isOriginAllowed(resolved)) {
    return res.status(403).json({
      ok: false,
      error: 'Origen no permitido',
      hint: `Configura ALLOWED_ORIGINS. Resolved: ${resolved || '(vacío)'} | Lista: ${ALLOWED_ORIGINS.join(', ')}`,
    })
  }

  // Headers CORS para el resto de la respuesta
  res.setHeader('Vary', cors['Vary'])
  res.setHeader('Access-Control-Allow-Origin', (cors as any)['Access-Control-Allow-Origin'] || resolved!)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  try {
    // (Opcional) token interno para endurecer el endpoint
    const expected = process.env.INTERNAL_ADMIN_TOKEN
    if (expected) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== expected) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
    }

    // Payload
    const body = (req.body ?? {}) as { login?: string; password?: string }
    const rawLogin = typeof body.login === 'string' ? body.login.trim() : ''
    if (!rawLogin) {
      return res.status(400).json({ ok: false, error: 'login requerido' })
    }

    // Normaliza a email
    const email = rawLogin.includes('@')
      ? rawLogin.toLowerCase()
      : `${rawLogin.toLowerCase()}@${LOGIN_DOMAIN}`

    // Admin client (service role)
    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Buscar usuario (escala pequeña)
    const { data: page1, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    const user = page1.users.find(u => (u.email || '').toLowerCase() === email)
    if (!user) {
      return res.status(404).json({ ok: false, error: `No existe ${email}` })
    }

    // Contraseña temporal (si no viene una)
    const temp =
      typeof body.password === 'string' && body.password.length > 0
        ? body.password
        : `Tmp-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}!`

    // Marca “cambiar contraseña al entrar”
    const { error: upsertErr } = await admin
      .from('profiles')
      .upsert(
        { id: user.id, email, must_change_password: true },
        { onConflict: 'id' },
      )
    if (upsertErr) throw upsertErr

    // Actualiza contraseña real en Auth
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: temp })
    if (updErr) throw updErr

    return res.status(200).json({ ok: true, email, tempPassword: temp })
  } catch (e: any) {
    console.error('password-reset error:', e?.message || e)
    return res.status(500).json({ ok: false, error: e?.message || 'Error inesperado' })
  }
}
