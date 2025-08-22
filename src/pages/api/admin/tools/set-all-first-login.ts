/**
 * POST /api/admin/tools/set-all-first-login
 *
 * Recorre todos los usuarios y fija user_metadata.first_login = true.
 * Seguridad:
 * - Requiere Authorization: Bearer <access_token> del ADMIN.
 * - Valida Origin (NEXT_PUBLIC_SITE_URL) para CSRF básico.
 * - Usa Admin API (service_role) SOLO en servidor.
 *
 * Respuesta:
 * { ok: true, updated: number, processed: number, details: Array<{id,email,ok,err?}> }
 * ELIMINE LA DOCUMENTACION Y USE ESTE CODIGO EN CASO DE QUE REQUIERA RESETEAR TODAS LAS CONTRASEÑAS
 */
/* import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SITE = process.env.NEXT_PUBLIC_SITE_URL!
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'operaciones@multi-impresos.com').toLowerCase()

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
    if (caller.user.email.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo ADMIN puede ejecutar esta acción' })
    }

    // Iterar usuarios en páginas pequeñas (escala chica OK)
    const perPage = 200
    let page = 1
    let processed = 0
    let updated = 0
    const details: Array<{ id: string; email: string | null; ok: boolean; err?: string }> = []

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      const users = data.users || []
      if (users.length === 0) break

      for (const u of users) {
        processed++
        const meta = { ...(u.user_metadata || {}), first_login: true }
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
          user_metadata: meta,
        })
        if (updErr) {
          details.push({ id: u.id, email: u.email ?? null, ok: false, err: updErr.message })
        } else {
          updated++
          details.push({ id: u.id, email: u.email ?? null, ok: true })
        }
      }

      if (users.length < perPage) break
      page++
    }

    return res.status(200).json({ ok: true, processed, updated, details })
  } catch (e: any) {
    console.error('set-all-first-login API error:', e)
    return res.status(500).json({ error: 'Error interno' })
  }
} */
