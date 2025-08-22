/**
 * DELETE /api/cleanup/minute?minuteId=UUID
 * Borra TODOS los objetos bajo attachments/<minuteId>/*
 * Requisitos:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (server-only)
 *
 * Seguridad:
 *  - Este archivo corre en el servidor (Next.js API Route).
 *  - JAMÁS expongas la service role en el cliente.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // <-- tu nombre
const BUCKET = 'attachments'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const minuteId = String(req.query.minuteId || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(minuteId)) {
      return res.status(400).json({ error: 'minuteId inválido' })
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

    // 1) Listar objetos bajo el prefijo minuteId/
    const list = await admin.storage.from(BUCKET).list(minuteId, { limit: 1000 })
    if (list.error) throw list.error

    const paths = (list.data ?? []).map(o => `${minuteId}/${o.name}`)
    if (paths.length === 0) {
      return res.status(200).json({ deleted: 0, paths: [] })
    }

    // 2) Borrado oficial (Storage API)
    const del = await admin.storage.from(BUCKET).remove(paths)
    if (del.error) throw del.error

    return res.status(200).json({ deleted: paths.length, paths })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'unknown error' })
  }
}
