/**
 * Utilidad centralizada de CORS para endpoints ADMIN.
 * Lee orígenes desde ALLOWED_ORIGINS (coma-separada) y añade defaults en dev.
 *
 * ENV:
 *   ALLOWED_ORIGINS="https://minuta-digital.vercel.app,https://otra.app"
 */

function normalizeOrigin(input?: string | null): string | null {
  if (!input) return null
  try {
    const u = new URL(input)
    return u.origin.toLowerCase()
  } catch {
    const maybe = input.trim().toLowerCase()
    if (!maybe) return null
    if (maybe.startsWith('http://') || maybe.startsWith('https://')) {
      try {
        return new URL(maybe).origin.toLowerCase()
      } catch {
        return null
      }
    }
    try {
      return new URL(`https://${maybe}`).origin.toLowerCase()
    } catch {
      return null
    }
  }
}

const fromEnv = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => normalizeOrigin(s))
  .filter((s): s is string => Boolean(s))

const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].map(normalizeOrigin).filter((s): s is string => Boolean(s))

/** Lista final de orígenes permitidos (sin duplicados). */
export const ALLOWED_ORIGINS = Array.from(new Set([...fromEnv, ...devDefaults]))

/** ¿El origin del request está permitido? */
export function isOriginAllowed(originHeader?: string | null): boolean {
  const o = normalizeOrigin(originHeader)
  if (!o) return false
  return ALLOWED_ORIGINS.includes(o)
}

/** Devuelve el origin permitido a reflejar en CORS (o null si no). */
export function getAllowedOrigin(originHeader?: string | null): string | null {
  return isOriginAllowed(originHeader) ? (normalizeOrigin(originHeader) as string) : null
}

/** Construye headers CORS estándar para JSON. */
export function buildCorsHeaders(originHeader?: string | null) {
  const allowOrigin = getAllowedOrigin(originHeader)
  if (!allowOrigin) {
    return {
      Vary: 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
    } as const
  }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  } as const
}
