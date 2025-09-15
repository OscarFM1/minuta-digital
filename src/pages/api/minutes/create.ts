// src/pages/api/minutes/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function cookieAdapter(req: NextApiRequest, res: NextApiResponse) {
  return {
    get(name: string) {
      return req.cookies[name]
    },
    set(name: string, value: string, options: any) {
      res.setHeader('Set-Cookie', serialize(name, value, options))
    },
    remove(name: string, options: any) {
      res.setHeader('Set-Cookie', serialize(name, '', { ...options, maxAge: 0 }))
    },
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 1) Obtener usuario real (para p_user_id)
  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieAdapter(req, res) },
  )
  const { data: { user }, error: userErr } = await s.auth.getUser()
  if (userErr) return res.status(401).json({ error: userErr.message })
  if (!user)   return res.status(401).json({ error: 'No authenticated user' })

  // 2) Payload
  const { date, description, task_done, notes, work_type, is_protected } = (req.body ?? {}) as {
    date?: string | null
    description: string
    task_done?: string | null
    notes?: string | null
    work_type?: string | null
    is_protected?: boolean
  }
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' })

  // 3) Crear por RPC v2 (service_role) fijando p_user_id explícitamente
  const { data, error } = await supabaseAdmin.rpc('create_minute_safe_v2', {
    p_date: date ?? null,
    p_description: description,
    p_tarea: task_done ?? null,
    p_novedades: notes ?? null,
    p_work_type: work_type ?? null,
    p_is_protected: typeof is_protected === 'boolean' ? is_protected : false,
    p_user_id: user.id, // <--- clave: evita 'No autenticado' en la función
  })

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Se está asignando el número de minuta. Intenta nuevamente.' })
    }
    if (error.code === '42883') {
      return res.status(500).json({ error: 'RPC create_minute_safe_v2 no encontrada. Aplica la migración en la BD.' })
    }
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, minute: data })
}
