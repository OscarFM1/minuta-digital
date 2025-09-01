// scripts/update-supabase-user-email.mjs
/**
 * Actualiza el email y metadatos de un usuario en Supabase Auth (Admin).
 * Uso LOCAL. No subas la service_role a Git ni a Vercel.
 *
 * Diagnóstico:
 *  - Lee .env.local (si existe) y luego .env.
 *  - Acepta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_ROLE (legacy).
 *  - Muestra el project ref (subdominio) y puede listar los primeros usuarios
 *    si DEBUG_USERS=1.
 *  - Puedes forzar la coincidencia del proyecto con EXPECTED_PROJECT_REF.
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

if (existsSync('.env.local')) config({ path: '.env.local' })
config() // fallback .env

import { createClient } from '@supabase/supabase-js'

// === ENV saneado ============================================================
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey =
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '').trim()

if (!url || !serviceKey) {
  console.error(
    '[ENV] Faltan variables.\n' +
    '  - NEXT_PUBLIC_SUPABASE_URL\n' +
    '  - SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE como fallback)'
  )
  process.exit(1)
}

// Obtiene el "ref" del proyecto desde la URL: https://<ref>.supabase.co
function projectRefFromUrl(u) {
  try { return new URL(u).host.split('.')[0] } catch { return '' }
}
const ref = projectRefFromUrl(url)
const EXPECTED_PROJECT_REF = (process.env.EXPECTED_PROJECT_REF || '').trim()
const DEBUG_USERS = (process.env.DEBUG_USERS || '').trim() === '1'

console.log('[ENV] Supabase URL ref:', ref)
console.log('[ENV] Service role presente:', serviceKey.length > 0 ? 'sí' : 'no')
if (EXPECTED_PROJECT_REF && EXPECTED_PROJECT_REF !== ref) {
  console.error(`[ENV] Mismatch: EXPECTED_PROJECT_REF="${EXPECTED_PROJECT_REF}" pero URL ref="${ref}".`)
  console.error('      Ajusta .env.local o EXPECTED_PROJECT_REF y vuelve a ejecutar.')
  process.exit(1)
}

// Cliente admin sin persistencia
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// (Opcional) Imprimir primeros usuarios para verificar proyecto correcto
async function debugListFirstUsers(n = 20) {
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: n })
    if (error) throw error
    console.log(`[DEBUG] Primeros ${data.users.length} usuarios en este proyecto:`)
    data.users.forEach((u, i) => console.log(`  ${String(i + 1).padStart(2,'0')}: ${u.email}`))
  } catch (e) {
    console.error('[DEBUG] No se pudo listar usuarios:', e?.message || e)
  }
}

/* ==================== CONFIG DEL CAMBIO ==================== */
const OLD_EMAIL = (process.env.OLD_EMAIL || 'audia.mesa@login.local').trim()
const NEW_EMAIL = (process.env.NEW_EMAIL || 'audra.mesa@login.local').trim()

/* ==================== UTILIDADES ==================== */
// Búsqueda segura por email (paginada)
async function findUserByEmail(email) {
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < perPage) return null
    page++
  }
}

/* ==================== MAIN ==================== */
try {
  if (DEBUG_USERS) {
    await debugListFirstUsers(20)
  }

  console.log(`Buscando usuario: ${OLD_EMAIL} ...`)
  const user = await findUserByEmail(OLD_EMAIL)
  if (!user) {
    console.error('No se encontró el usuario con el email old:', OLD_EMAIL)
    console.error('Sugerencias:')
    console.error('  1) Verifica que el ref mostrado arriba coincide con el proyecto del Dashboard.')
    console.error('  2) Si tienes varios .env, renombra temporalmente .env a .env.bak para forzar .env.local.')
    console.error('  3) Exporta EXPECTED_PROJECT_REF=<ref> para forzar coincidencia.')
    process.exit(1)
  }

  console.log(`Actualizando a: ${NEW_EMAIL} ...`)
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    email: NEW_EMAIL,
    email_confirm: true,
    user_metadata: {
      username: NEW_EMAIL.split('@')[0],
      name: 'Audra Mesa',
      full_name: 'Audra Mesa',
    },
  })
  if (error) throw error

  console.log('✅ Actualizado correctamente.')
  console.log('UserID:', user.id)
  console.log('Nuevo email:', data.user.email)
  process.exit(0)
} catch (e) {
  console.error('❌ Error actualizando usuario:', e?.message || e)
  process.exit(1)
}
