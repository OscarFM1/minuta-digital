// src/pages/api/bootstrap-user.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY! // IMPORTANTÍSIMO: Service role, no el anon
const LOGIN_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

// Lista blanca: solo estos usuarios se pueden autoprovicionar
const ALLOWED_USERNAMES = [
  'kat.acosta',
  'ivan.zamudio',
  'audia.mesa',
  'juan.diaz',
  'kat.blades',
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { username } = req.body as { username?: string }
    if (!username) return res.status(400).json({ error: 'username is required' })

    // Solo permitimos usuarios whitelisted
    if (!ALLOWED_USERNAMES.includes(username)) {
      return res.status(403).json({ error: 'username not allowed' })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const email = `${username}@${LOGIN_DOMAIN}`

    // ¿Ya existe?
    const { data: list, error: listErr } = await admin.auth.admin.listUsers()
    if (listErr) throw listErr
    const exists = list.users.some(u => u.email === email)
    if (exists) return res.status(200).json({ created: false })

    // Crear con password por defecto y flag de reset
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: 'password',
      email_confirm: true,
      user_metadata: { username, must_reset: true, display_name: username.replace('.', ' ') },
      app_metadata: { provider: 'username' },
    })
    if (createErr) throw createErr

    return res.status(200).json({ created: true, id: created.user?.id })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'internal error' })
  }
}
