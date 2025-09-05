/**
 * Utilidad centralizada de CORS para endpoints.
 * - Lee ALLOWED_ORIGINS (coma-separada).
 * - Normaliza y admite wildcards "*.dominio.tld".
 * - Soporta fallback si el header Origin no viene: construye a partir de host.
 *
 * ENV:
 *   ALLOWED_ORIGINS="https://minuta-digital.vercel.app,*.vercel.app"
 */

import type { NextApiRequest } from 'next'

/** Normaliza un origin a lower-case y sólo esquema+host+puerto. */
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

/** Devuelve true si es un patrón wildcard tipo "*.vercel.app" */
function isWildcard(entry: string) {
  return entry.startsWith('*.')
}

/** matching para wildcard: "*.vercel.app" → host termina en ".vercel.app" */
function wildcardMatches(origin: string, pattern: string) {
  if (!isWildcard(pattern)) return false
  try {
    const host = new URL(origin).host
    const suffix = pattern.slice(1) // ".vercel.app"
    return host.endsWith(suffix)
  } catch {
    return false
  }
}

const fromEnv = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const normalizedFromEnv = fromEnv
  .map(s => (isWildcard(s) ? s.toLowerCase() : normalizeOrigin(s)))
  .filter((s): s is string => Boolean(s))

// Defaults sólo para DEV
const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].map(normalizeOrigin).filter((s): s is string => Boolean(s))

/** Lista final (mantiene wildcards tal cual y origins normalizados). */
export const ALLOWED_ORIGINS = Array.from(new Set([...normalizedFromEnv, ...devDefaults]))

/** Resuelve el origin del request: header Origin o proto+host (Vercel). */
export function resolveRequestOrigin(req: Pick<NextApiRequest, 'headers'>): string | null {
  const headerOrigin = req.headers.origin ?? null
  if (headerOrigin) return normalizeOrigin(headerOrigin)
  // Fallback server→server: construye con proto + host
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host =
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers['host'] as string) ||
    null
  if (!host) return null
  return normalizeOrigin(`${proto}://${host}`)
}

/** ¿El origin está permitido? Admite exacto o wildcard. */
export function isOriginAllowed(originHeader?: string | null): boolean {
  const origin = normalizeOrigin(originHeader)
  if (!origin) return false
  for (const entry of ALLOWED_ORIGINS) {
    if (isWildcard(entry)) {
      if (wildcardMatches(origin, entry)) return true
    } else if (entry === origin) {
      return true
    }
  }
  return false
}

/** Si está permitido, devuelve el origin normalizado, si no, null. */
export function getAllowedOrigin(originHeader?: string | null): string | null {
  return isOriginAllowed(originHeader) ? (normalizeOrigin(originHeader) as string) : null
}

/** Construye headers CORS estándar para JSON a partir del req. */
export function buildCorsHeadersFromReq(req: Pick<NextApiRequest, 'headers'>) {
  const resolved = resolveRequestOrigin(req)
  if (!isOriginAllowed(resolved)) {
    return {
      Vary: 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
    } as const
  }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': resolved as string,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  } as const
}
