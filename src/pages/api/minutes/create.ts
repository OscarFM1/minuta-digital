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

  // 1) Leer usuario real desde cookie (JWT del navegador)
  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieAdapter(req, res) },
  )

  const { data: { user }, error: userErr } = await s.auth.getUser()
  if (userErr) return res.status(401).json({ error: userErr.message })
  if (!user)   return res.status(401).json({ error: 'No authenticated user' })

  // 2) Tomar payload del cuerpo
  const { date, description, task_done, notes } = (req.body ?? {}) as {
    date?: string | null
    description: string
    task_done?: string | null
    notes?: string | null
  }
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' })

  // 3) Insertar con Service Role, PERO fijando user_id del usuario real
  const { data, error } = await supabaseAdmin
    .from('minute')
    .insert([{
      user_id: user.id,
      date: date ?? null,
      description,
      task_done: task_done ?? null,
      notes: notes ?? null,
    }])
    .select('id, folio, folio_serial')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ ok: true, minute: data })
}
