// src/pages/api/admin/password-reset.ts
/**
 * Reset de contraseña (ADMIN) con CORS unificado
 * -----------------------------------------------------------------------------
 * - CORS dinámico usando util de /src/lib/allowedOrigins.ts
 * - Responde preflight OPTIONS con 200 y headers correctos
 * - Valida Origin contra ALLOWED_ORIGINS (ENV única)
 * - Actualiza contraseña vía Supabase Admin + marca must_change_password en profiles
 *
 * ENV requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ALLOWED_ORIGINS="https://minuta-digital.vercel.app,https://otro.dominio"
 *
 * Seguridad opcional recomendada (no bloquea si no está):
 *   INTERNAL_ADMIN_TOKEN (Bearer) para la UI admin.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  buildCorsHeaders,
  getAllowedOrigin,
  isOriginAllowed,
  ALLOWED_ORIGINS,
} from '@/lib/allowedOrigins'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

type Ok = { ok: true; email: string; tempPassword?: string }
type Err = { ok: false; error: string; hint?: string }
type Resp = Ok | Err

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  const origin = req.headers.origin ?? null
  const cors = buildCorsHeaders(origin)

  // Preflight (CORS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Vary', cors['Vary'])
    if (cors['Access-Control-Allow-Origin']) {
      res.setHeader('Access-Control-Allow-Origin', cors['Access-Control-Allow-Origin'])
      res.setHeader('Access-Control-Allow-Credentials', cors['Access-Control-Allow-Credentials'])
      res.setHeader('Access-Control-Allow-Methods', cors['Access-Control-Allow-Methods'])
      res.setHeader('Access-Control-Allow-Headers', cors['Access-Control-Allow-Headers'])
    }
    return res.status(200).end()
  }

  // Método soportado
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  // Credenciales de servidor
  if (!URL || !SERVICE) {
    return res.status(500).json({ ok: false, error: 'Faltan credenciales de servidor' })
  }

  // Enforce CORS (403 si no permitido)
  const allowed = getAllowedOrigin(origin)
  if (!allowed || !isOriginAllowed(origin || '')) {
    // Informativo, para depurar despliegues
    return res.status(403).json({
      ok: false,
      error: 'Origen no permitido',
      hint: `Configura ALLOWED_ORIGINS con tu dominio. Origin: ${origin || '(vacío)'} | Lista: ${ALLOWED_ORIGINS.join(', ')}`,
    })
  }

  // Headers CORS en respuestas exitosas/errores posteriores
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  try {
    // (Opcional) Token interno para endurecer el endpoint
    const expected = process.env.INTERNAL_ADMIN_TOKEN
    if (expected) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (token !== expected) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
    }

    const { login, password } = req.body as { login?: string; password?: string }
    if (!login || typeof login !== 'string') {
      return res.status(400).json({ ok: false, error: 'login requerido' })
    }

    // Acepta "login" o "user@dominio"
    const email = login.includes('@')
      ? login.trim().toLowerCase()
      : `${login.trim().toLowerCase()}@login.local`

    // Cliente admin (service role)
    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1) Buscar usuario (hasta 1000 usuarios; suficiente para este proyecto)
    const { data: page1, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    const user = page1.users.find(u => (u.email || '').toLowerCase() === email)
    if (!user) return res.status(404).json({ ok: false, error: `No existe ${email}` })

    // 2) Password temporal si no vino una
    const temp =
      password ||
      `Tmp-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}!`

    // 3) Marca “cambiar contraseña al entrar” (profiles)
    const { error: upsertErr } = await admin
      .from('profiles')
      .upsert(
        { id: user.id, email, must_change_password: true },
        { onConflict: 'id' },
      )
    if (upsertErr) throw upsertErr

    // 4) Actualiza contraseña real en Auth
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: temp })
    if (updErr) throw updErr

    return res.status(200).json({
      ok: true,
      email,
      // Si no quieres mostrarla en UI, comenta esta línea:
      tempPassword: temp,
    })
  } catch (e: any) {
    console.error('password-reset error:', e)
    return res.status(500).json({ ok: false, error: e?.message || 'Error inesperado' })
  }
}
