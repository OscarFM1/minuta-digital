// src/pages/api/admin/reset-password.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { isAllowedOrigin, allowedOrigins } from '@/lib/allowedOrigins'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1) CORS por ORIGIN estricto (no dependas de Referer)
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) {
    return res.status(403).json({
      ok: false,
      error: 'Origen no permitido',
      detail: { received: req.headers.origin || null, allow: allowedOrigins() },
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    const { loginOrEmail, password } = req.body as { loginOrEmail: string; password?: string }

    if (!loginOrEmail) {
      return res.status(400).json({ ok: false, error: 'Falta login o correo' })
    }

    // Construye el email final si te pasan "kat.blades" (login local)
    const email = loginOrEmail.includes('@')
      ? loginOrEmail.trim().toLowerCase()
      : `${loginOrEmail.trim().toLowerCase()}@${process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'}`

    // Solo server-side: Service Role
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !service) {
      return res.status(500).json({ ok: false, error: 'Faltan credenciales de servidor' })
    }

    const admin = createClient(url, service, { auth: { persistSession: false } })

    // 1) buscar user
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    const user = list.users.find(u => (u.email || '').toLowerCase() === email)
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' })

    // 2) armar payload
    const payload: any = { user_metadata: { ...(user.user_metadata || {}), first_login: true } }
    if (password && password.length >= 8) payload.password = password

    // 3) actualizar
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, payload)
    if (updErr) throw updErr

    // (opcional) perfilar must_change_password en tabla profiles:
    // await admin.from('profiles').upsert({ id: user.id, must_change_password: true }, { onConflict: 'id' })

    return res.status(200).json({ ok: true, userId: user.id })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error interno' })
  }
}
