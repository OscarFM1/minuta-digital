// scripts/update-first-login.mjs
/**
 * Fuerza user_metadata.first_login a TRUE para TODOS los usuarios (incluido admin),
 * o para un subconjunto de emails; también permite rollback (--unset).
 *
 * Flags CLI:
 *   --all                      -> procesa TODOS los usuarios
 *   --emails=a@b.com,c@d.com   -> procesa sólo esos correos (case-insensitive)
 *   --dry-run                  -> no escribe, sólo muestra cambios
 *   --unset                    -> en vez de true, pone false (rollback)
 *
 * Ejemplos:
 *   node scripts/update-first-login.mjs --all --dry-run
 *   node scripts/update-first-login.mjs --all
 *   node scripts/update-first-login.mjs --emails=operaciones@multi-impresos.com,kat.acosta@login.local
 *   node scripts/update-first-login.mjs --unset --all
 *
 * Requisitos de entorno (NO los publiques):
 *   NEXT_PUBLIC_SUPABASE_URL   = https://<tu-proyecto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  = <service role key>  (sólo server)
 */

import dotenv from 'dotenv'
// ⚠️ override: true => .env.local pisa variables ya definidas en el entorno
dotenv.config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'

// ===== 0) ENV & cliente admin (sólo server) =====
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

// Validar formato de la URL para evitar ENOTFOUND por URLs mal armadas
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
      // Captura errores de red (ENOTFOUND, etc.) con mensaje claro
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
      const needsChange = current !== DESIRED

      if (!needsChange) {
        skipped++
        continue
      }

      if (DRY_RUN) {
        console.log(`[DRY] ${email}: first_login ${String(current)} -> ${String(DESIRED)}`)
        updated++
        continue
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(u.id, {
        user_metadata: { ...(u.user_metadata || {}), first_login: DESIRED },
      })
      if (updErr) {
        errors++
        console.error(`✗ Error actualizando ${email}: ${updErr.message}`)
      } else {
        updated++
        console.log(`✓ Actualizado ${email}: first_login ${String(current)} -> ${String(DESIRED)}`)
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
