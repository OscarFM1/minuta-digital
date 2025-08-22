// scripts/seed-users.mjs

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMAIN       = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables de entorno:')
  console.error('NEXT_PUBLIC_SUPABASE_URL =', SUPABASE_URL || '(no definida)')
  console.error('SUPABASE_SERVICE_ROLE_KEY =', SERVICE_KEY ? `definida (len=${SERVICE_KEY.length})` : '(no definida)')
  console.error('Revisa que .env.local exista y que estás ejecutando el comando en la RAÍZ del proyecto.')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const users = [
  { username: 'kat.acosta',   name: 'Kat Acosta' },
  { username: 'ivan.zamudio', name: 'Iván Zamudio' },
  { username: 'audia.mesa',   name: 'Audia Mesa' },
  { username: 'juan.diaz',    name: 'Juan Díaz' },
  { username: 'kat.blades',   name: 'Kat Blades' },
]

for (const u of users) {
  const email = `${u.username}@${DOMAIN}`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'password',
    email_confirm: true,
    user_metadata: {
      username: u.username,
      display_name: u.name,
      first_login: true, // ← ⚠️ ESTE ES EL CAMPO CLAVE
    },
  })

  if (error) {
    if (String(error.message).includes('already registered') || error.status === 422) {
      console.log(`✓ Ya existe: ${email}`)
    } else {
      console.error(`✗ Error creando ${email}:`, error.message)
    }
  } else {
    console.log(`✓ Creado: ${email}  id=${data.user.id}`)
  }
}

process.exit(0)
