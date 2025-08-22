/**
 * POST /api/admin/password-reset
 * 
 * Seguridad:
 * - Requiere Authorization: Bearer <access_token> (token del admin).
 * - Verifica que el email del llamador sea ADMIN_EMAIL.
 * - Valida Origin contra NEXT_PUBLIC_SITE_URL para mitigar CSRF básico.
 * 
 * Funciones:
 * - Modo por defecto: envía email de recuperación (Supabase maneja el envío).
 * - Modo avanzado (linkOnly): genera y retorna el enlace de recuperación para compartir manualmente.
 * 
 * Body JSON:
 * {
 *   "email": "usuario@empresa.com",
 *   "redirectTo": "http://localhost:3000/cambiar-password", // opcional (recomendado)
 *   "mode": "email" | "linkOnly" // opcional; default: "email"
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SITE = process.env.NEXT_PUBLIC_SITE_URL!
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'operaciones@multi-impresos.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente "normal" (anon) solo para usar resetPasswordForEmail en el servidor.
const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1) Método permitido
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido' })
    }

    // 2) Validación de ORIGIN (CSRF básico sin cookies SameSite=strict)
    const origin = req.headers.origin
    if (!origin || ![SITE, 'http://localhost:3000'].includes(origin)) {
      return res.status(403).json({ error: 'Origin no permitido' })
    }

    // 3) Autenticación del llamador: requiere Bearer token
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return res.status(401).json({ error: 'Falta Authorization Bearer token' })
    }

    // 4) Obtener usuario del token (fiable) y validar ADMIN
    const { data: caller, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !caller?.user?.email) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' })
    }
    const callerEmail = caller.user.email.toLowerCase()
    if (callerEmail !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Solo ADMIN puede resetear contraseñas' })
    }

    // 5) Parseo y validación de body
    const { email, redirectTo, mode } = (req.body ?? {}) as {
      email?: string
      redirectTo?: string
      mode?: 'email' | 'linkOnly'
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }
    const safeRedirect = redirectTo && redirectTo.startsWith(SITE)
      ? redirectTo
      : `${SITE}/cambiar-password`

    // 6) Ejecución según modo
    const useLinkOnly = mode === 'linkOnly'
    if (useLinkOnly) {
      // Generar enlace (NO envía email). Útil para compartir manualmente.
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: safeRedirect },
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({
        ok: true,
        mode: 'linkOnly',
        action_link: data.properties?.action_link,
        // También viene email_otp, hashed_token, etc., pero no los exponemos.
      })
    } else {
      // Enviar el email de recuperación usando el flujo nativo de Supabase.
      const { error } = await supabaseServer.auth.resetPasswordForEmail(email, {
        redirectTo: safeRedirect,
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true, mode: 'email' })
    }
  } catch (e: any) {
    console.error('password-reset API error:', e)
    return res.status(500).json({ error: 'Error interno' })
  }
}
