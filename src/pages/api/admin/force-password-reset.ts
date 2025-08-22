/**
 * POST /api/admin/force-password-reset
 *
 * Fuerza cambio de contraseña SIN correo:
 * - Requiere Authorization: Bearer <access_token> (ADMIN).
 * - Valida Origin contra NEXT_PUBLIC_SITE_URL.
 * - Acepta "login" o "correo" y normaliza a email usando NEXT_PUBLIC_LOGIN_DOMAIN.
 * - Busca usuario por email (login.local) usando Admin API.
 * - Genera contraseña temporal y setea user_metadata.first_login = true.
 *
 * Body JSON:
 * {
 *   "email": "kat.acosta" | "kat.acosta@login.local",
 *   "mode": "auto" | "custom",         // default: "auto"
 *   "tempPassword": "Opcional si mode=custom"
 * }
 *
 * Respuesta:
 * { ok: true, userId: string, tempPassword: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SITE = process.env.NEXT_PUBLIC_SITE_URL!
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'operaciones@multi-impresos.com'
const LOGIN_DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local').trim()

/** Normaliza "kat.acosta" -> "kat.acosta@login.local" (si no trae @). */
function normalizeToEmail(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  return raw.includes('@') ? raw : `${raw}@${LOGIN_DOMAIN}`
}

function genTempPassword(len = 12): string {
  // Asegura: minúscula, mayúscula, número, símbolo.
  const lowers = 'abcdefghijklmnopqrstuvwxyz'
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const nums = '0123456789'
  const syms = '!@#$%^&*()-_=+[]{}.,?'
  const all = lowers + uppers + nums + syms

  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  let pwd = pick(lowers) + pick(uppers) + pick(nums) + pick(syms)

  for (let i = pwd.length; i < len; i++) pwd += pick(all)
  // Mezcla simple
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

/** Busca userId por email iterando páginas (escala chica: OK). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 200
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const found = data.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (!data.users || data.users.length < perPage) break // sin más páginas
  }
  return null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido' })
    }

    // CSRF básico por Origin
    const origin = req.headers.origin
    if (!origin || ![SITE, 'http://localhost:3000'].includes(origin)) {
      return res.status(403).json({ error: 'Origin no permitido' })
    }

    // Auth: requiere token y que sea ADMIN
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return res.status(401).json({ error: 'Falta Authorization Bearer token' })

    const { data: caller, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !caller?.user?.email) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' })
    }
    if (caller.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Solo ADMIN puede forzar cambios de contraseña' })
    }

    const { email, mode, tempPassword } = (req.body ?? {}) as {
      email?: string
      mode?: 'auto' | 'custom'
      tempPassword?: string
    }

    // Normalizar login/correo -> correo completo @login.local
    const normalizedEmail = normalizeToEmail(email || '')
    if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: `Email/login inválido. Ejemplos: "kat.acosta" → ${normalizeToEmail('kat.acosta')}`,
      })
    }

    const userId = await findUserIdByEmail(normalizedEmail)
    if (!userId) return res.status(404).json({ error: 'Usuario no encontrado' })

    const finalPwd = mode === 'custom' && tempPassword?.trim()
      ? tempPassword.trim()
      : genTempPassword(12)

    // Actualizamos password + marcamos first_login=true en metadata
    // (Admin API updateUserById: server-only, service_role).
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: finalPwd,
      user_metadata: { first_login: true },
    })
    if (updErr) return res.status(500).json({ error: updErr.message })

    // Nota: No hay método oficial para "cerrar sesión a otro usuario" desde server.
    // Las sesiones activas se resolverán con tu useFirstLoginGate al siguiente login.

    return res.status(200).json({ ok: true, userId, tempPassword: finalPwd })
  } catch (e: any) {
    console.error('force-password-reset API error:', e)
    return res.status(500).json({ error: 'Error interno' })
  }
}
