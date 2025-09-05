// /src/lib/allowedOrigins.ts
import type { NextApiRequest } from 'next'

function normalizeOrigin(input?: string | null): string | null {
  if (!input) return null
  try {
    const u = new URL(input)
    return u.origin.toLowerCase()
  } catch {
    const maybe = input.trim().toLowerCase()
    if (!maybe) return null
    if (maybe.startsWith('http://') || maybe.startsWith('https://')) {
      try { return new URL(maybe).origin.toLowerCase() } catch { return null }
    }
    try { return new URL(`https://${maybe}`).origin.toLowerCase() } catch { return null }
  }
}

function isWildcard(entry: string) { return entry.startsWith('*.') }
function wildcardMatches(origin: string, pattern: string) {
  if (!isWildcard(pattern)) return false
  try {
    const host = new URL(origin).host
    const suffix = pattern.slice(1) // ".vercel.app"
    return host.endsWith(suffix)
  } catch { return false }
}

const fromEnvRaw = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

const fromEnv = fromEnvRaw
  .map(s => (isWildcard(s) ? s.toLowerCase() : normalizeOrigin(s)))
  .filter((s): s is string => Boolean(s))

const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].map(normalizeOrigin).filter((s): s is string => Boolean(s))

/** Lista final (origins normalizados + wildcards) */
export const ALLOWED_ORIGINS = Array.from(new Set([...fromEnv, ...devDefaults]))

/** Resuelve el origin del request: header Origin o proto+host */
export function resolveRequestOrigin(req: Pick<NextApiRequest, 'headers'>): string | null {
  const headerOrigin = req.headers.origin ?? null
  if (headerOrigin) return normalizeOrigin(headerOrigin)
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || null
  if (!host) return null
  return normalizeOrigin(`${proto}://${host}`)
}

/** ¿El origin está permitido? (exacto o wildcard) */
export function isOriginAllowed(originHeader?: string | null): boolean {
  const origin = normalizeOrigin(originHeader)
  if (!origin) return false
  for (const entry of ALLOWED_ORIGINS) {
    if (isWildcard(entry)) { if (wildcardMatches(origin, entry)) return true }
    else if (entry === origin) { return true }
  }
  return false
}

/** Headers CORS a partir de un origin (API estable previa) */
export function buildCorsHeaders(originHeader?: string | null) {
  const allow = isOriginAllowed(originHeader) ? normalizeOrigin(originHeader) : null
  if (!allow) {
    return { Vary: 'Origin', 'Content-Type': 'application/json; charset=utf-8' } as const
  }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  } as const
}

/** Headers CORS a partir del request (tu import nuevo) */
export function buildCorsHeadersFromReq(req: Pick<NextApiRequest, 'headers'>) {
  const resolved = resolveRequestOrigin(req)
  return buildCorsHeaders(resolved)
}
