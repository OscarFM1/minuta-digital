// src/pages/api/invite.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' })
  }

  // 1) Crea el usuario con contraseña temporal
  const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !data.user) {
    console.error('Error creando usuario:', createErr)
    return res.status(500).json({ error: createErr?.message })
  }

  // 2) Envía link de restablecimiento para que el usuario ponga su propia contraseña
  const { data: resetData, error: resetErr } =
    await supabaseAdmin.auth.resetPasswordForEmail(email)

  if (resetErr) {
    console.error('Error enviando resetPasswordEmail:', resetErr)
    // No hacemos rollback; devolvemos éxito en creación
    return res.status(201).json({
      user: data.user,
      warning: 'User created but reset-email failed: '+ resetErr.message
    })
  }

  return res.status(200).json({
    user: data.user,
    reset_sent: true
  })
}
