// scripts/update-first-login.mjs
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno.')
  process.exit(1)
}

// Cliente de administración
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Lista de correos de tus usuarios
const emails = [
  'kat.acosta@login.local',
  'ivan.zamudio@login.local',
  'audia.mesa@login.local',
  'juan.diaz@login.local',
  'kat.blades@login.local',
]

for (const email of emails) {
  const { data, error } = await admin.auth.admin.listUsers({ email })

  const user = data?.users?.[0]
  if (!user) {
    console.log(`✗ Usuario no encontrado: ${email}`)
    continue
  }

  const updated = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      first_login: true, // ← Añadir o actualizar el campo
    },
  })

  if (updated.error) {
    console.error(`✗ Error actualizando ${email}:`, updated.error.message)
  } else {
    console.log(`✓ Actualizado ${email} con first_login: true`)
  }
}

process.exit(0)
