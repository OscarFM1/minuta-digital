// scripts/update-first-login.mjs
/**
 * Actualiza user_metadata.first_login y (opcional) fuerza contraseña.
 *
 * Flags CLI:
 *   --all                        -> procesa TODOS los usuarios
 *   --emails=a@b.com,c@d.com     -> procesa sólo esos correos (case-insensitive)
 *   --dry-run                    -> no escribe, sólo muestra lo que haría
 *   --unset                      -> en vez de true, pone false (rollback de first_login)
 *   --password=<clave>           -> fuerza password SÓLO a los correos de --emails
 *   --password-all=<clave>       -> fuerza password a TODOS los que procese (¡peligroso!)
 *
 * Ejemplos:
 *   node scripts/update-first-login.mjs --all --dry-run
 *   node scripts/update-first-login.mjs --all
 *   node scripts/update-first-login.mjs --emails=operaciones@multi-impresos.com --password=password
 *   node scripts/update-first-login.mjs --unset --all
 *
 * Requisitos (.env.local, NO subir a git):
 *   NEXT_PUBLIC_SUPABASE_URL   = https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  = <service-role>
 */

import dotenv from 'dotenv'
// override:true => .env.local pisa variables previas del entorno
dotenv.config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'

// ===== 0) ENV & cliente admin (sólo server) =====
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
// Validar formato para evitar ENOTFOUND por URL mal formada
const urlPattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i
if (!urlPattern.test(SUPABASE_URL)) {
  console.error(`❌ NEXT_PUBLIC_SUPABASE_URL inválida: "${SUPABASE_URL}"
Debe verse como "https://<project-ref>.supabase.co" (sin underscores, sin slash final).`)
  process.exit(1)
}
console.log(`[ENV] Using SUPABASE_URL=${SUPABASE_URL}`)

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ===== 1) Flags CLI =====
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const UNSET = args.includes('--unset')
const DO_ALL = args.includes('--all')

const emailsArg = args.find(a => a.startsWith('--emails='))
const EMAILS = emailsArg
  ? emailsArg.replace('--emails=', '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  : []

// Forzar contraseña (subset o todos)
const pwdSubsetArg = args.find(a => a.startsWith('--password='))
const pwdAllArg = args.find(a => a.startsWith('--password-all='))

const PASSWORD_SUBSET = pwdSubsetArg?.split('=')[1] || null
const PASSWORD_ALL = pwdAllArg?.split('=')[1] || null

// Seguridad: si pasas --password (sin -all) pero NO diste --emails, no haremos nada con password.
if (PASSWORD_SUBSET && EMAILS.length === 0) {
  console.error('⚠️  Has pasado --password pero no --emails. Por seguridad, no se forzará ninguna contraseña.')
}

const DESIRED = UNSET ? false : true

// ===== 2) Parámetros de paginación / throttling =====
const PER_PAGE = 1000
const SLEEP_MS = 40
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ===== 3) Fallback “legacy” si no pasas --all ni --emails =====
const LEGACY_EMAILS = [
  'kat.acosta@login.local',
  'ivan.zamudio@login.local',
  'audia.mesa@login.local',
  'juan.diaz@login.local',
  'kat.blades@login.local',
  'operaciones@multi-impresos.com', // admin incluido
].map(e => e.toLowerCase())

const MODE = DO_ALL ? 'ALL' : (EMAILS.length ? 'SUBSET' : 'LEGACY')

// ===== 4) Utilidades =====
function normalize(str) {
  return String(str || '').trim().toLowerCase()
}
function shouldProcessEmail(email) {
  const e = normalize(email)
  if (MODE === 'ALL') return true
  if (MODE === 'SUBSET') return EMAILS.includes(e)
  return LEGACY_EMAILS.includes(e) // LEGACY
}
function shouldSetPassword(email) {
  if (PASSWORD_ALL) return true
  if (PASSWORD_SUBSET && EMAILS.length > 0) {
    return EMAILS.includes(normalize(email))
  }
  return false
}
function passwordFor(email) {
  if (PASSWORD_ALL) return PASSWORD_ALL
  if (PASSWORD_SUBSET && EMAILS.includes(normalize(email))) return PASSWORD_SUBSET
  return null
}

// ===== 5) Proceso principal =====
async function main() {
  console.log(`\n[START] first_login => ${DESIRED ? 'TRUE' : 'FALSE'} | MODE=${MODE} ${DRY_RUN ? '(DRY RUN)' : ''}\n`)

  let page = 1
  let totalSeen = 0
  let totalMatched = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  while (true) {
    let data, error
    try {
      ({ data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE }))
    } catch (e) {
      console.error(`✗ ERROR listUsers (page ${page}): ${e?.message || e}`)
      if (String(e?.message || '').includes('ENOTFOUND')) {
        console.error('→ Revisa NEXT_PUBLIC_SUPABASE_URL: parece no resolverse el DNS.')
      }
      process.exit(1)
    }
    if (error) {
      console.error(`✗ ERROR listUsers (page ${page}):`, error.message)
      process.exit(1)
    }

    const users = data?.users ?? []
    if (users.length === 0) break

    for (const u of users) {
      totalSeen++
      const email = u.email || '(sin email)'
      if (!shouldProcessEmail(email)) continue

      totalMatched++

      const current = u.user_metadata?.first_login
      const needsMetaChange = current !== DESIRED
      const willSetPass = shouldSetPassword(email)
      const newPass = willSetPass ? passwordFor(email) : null

      // Si no hay nada que cambiar, saltamos
      if (!needsMetaChange && !willSetPass) {
        skipped++
        continue
      }

      if (DRY_RUN) {
        const parts = []
        if (needsMetaChange) parts.push(`first_login ${String(current)} -> ${String(DESIRED)}`)
        if (willSetPass) parts.push('password SET')
        console.log(`[DRY] ${email}: ${parts.join(' | ')}`)
        updated++
        continue
      }

      const payload = {}
      if (needsMetaChange) {
        payload.user_metadata = { ...(u.user_metadata || {}), first_login: DESIRED }
      }
      if (willSetPass && newPass) {
        payload.password = newPass
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(u.id, payload)
      if (updErr) {
        errors++
        console.error(`✗ Error actualizando ${email}: ${updErr.message}`)
      } else {
        updated++
        const parts = []
        if (needsMetaChange) parts.push(`first_login -> ${String(DESIRED)}`)
        if (willSetPass) parts.push('password SET')
        console.log(`✓ ${email}: ${parts.join(' | ')}`)
      }

      await sleep(SLEEP_MS)
    }

    if (users.length < PER_PAGE) break // última página
    page++
  }

  console.log(`\n[DONE] vistos=${totalSeen} coincidentes=${totalMatched} actualizados=${updated} sin_cambio=${skipped} errores=${errors}\n`)
}

main().catch((e) => {
  console.error('Fallo inesperado:', e?.message || e)
  process.exit(1)
})
