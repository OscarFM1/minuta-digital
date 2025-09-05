/**
 * Utilidad de CORS para endpoints ADMIN.
 * ----------------------------------------------------------------------------
 * Lee orígenes permitidos desde la ENV `ALLOWED_ORIGINS` (coma-separada)
 * y añade orígenes útiles en desarrollo (localhost).
 *
 * ✅ Buenas prácticas
 * - Normaliza origins: lower-case, sin path/query/hash, sin trailing slash.
 * - Tolerante a valores vacíos o mal formateados.
 * - Sin dependencias externas.
 *
 * ENV:
 *   ALLOWED_ORIGINS="https://minuta-digital.vercel.app,https://otra.app"
 */

function normalizeOrigin(input?: string | null): string | null {
  if (!input) return null
  try {
    // Si viene con esquema y path: usar sólo el origin.
    const u = new URL(input)
    return u.origin.toLowerCase()
  } catch {
    // Si viene ya como origin plano (ej: https://foo.bar) o sin esquema:
    // Intentar forzar esquema:
    const maybe = input.trim().toLowerCase()
    if (!maybe) return null
    if (maybe.startsWith('http://') || maybe.startsWith('https://')) {
      try {
        return new URL(maybe).origin.toLowerCase()
      } catch {
        return null
      }
    }
    // último intento: asumir https
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

// Defaults sólo para DEV
const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].map(normalizeOrigin).filter((s): s is string => Boolean(s))

// Conjunto sin duplicados
export const ALLOWED_ORIGINS = Array.from(new Set([...fromEnv, ...devDefaults]))

/** Verifica si un origin está permitido. */
export function isOriginAllowed(originHeader?: string | null): boolean {
  const o = normalizeOrigin(originHeader)
  if (!o) return false
  return ALLOWED_ORIGINS.includes(o)
}

/** Resuelve el origin permitido a devolver (o null si no está permitido). */
export function getAllowedOrigin(originHeader?: string | null): string | null {
  return isOriginAllowed(originHeader) ? normalizeOrigin(originHeader)! : null
}

/** Header CORS estándar para endpoints JSON. */
export function buildCorsHeaders(originHeader?: string | null) {
  const allowOrigin = getAllowedOrigin(originHeader)
  if (!allowOrigin) {
    // No revelamos orígenes por defecto; dejamos que el caller reciba 403.
    return {
      'Vary': 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
    } as const
  }
  return {
    'Vary': 'Origin',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  } as const
}
