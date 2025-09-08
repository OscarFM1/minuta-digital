import type { NextApiRequest } from 'next'

/** Normaliza un origin concreto a esquema+host (lowercase). */
function normalizeOrigin(input?: string | null): string | null {
  if (!input) return null
  try {
    const u = new URL(input)
    return u.origin.toLowerCase()
  } catch {
    const maybe = input.trim().toLowerCase()
    if (!maybe) return null
    // si viene sin esquema, asumir https
    try { return new URL(maybe.startsWith('http') ? maybe : `https://${maybe}`).origin.toLowerCase() } catch { return null }
  }
}

/** true si es wildcard "*.dominio.tld" (con o sin esquema accidental). */
function looksWildcard(s: string) {
  return s.includes('*.')
}

/** Limpia un wildcard tipo "https://*.vercel.app" -> "*.vercel.app" */
function cleanWildcard(s: string) {
  const t = s.trim().toLowerCase()
  // quita esquema si lo trae
  return t.replace(/^https?:\/\//, '')
}

/** Carga y normaliza lista de ENV (acepta ALLOWED_ORIGINS y ALLOWED_ADMIN_ORIGINS). */
function loadAllowedFromEnv(): string[] {
  // Acepta ambos nombres para evitar confusiones.
  const raw = [process.env.ALLOWED_ORIGINS, process.env.ALLOWED_ADMIN_ORIGINS]
    .filter(Boolean)
    .join(',')

  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const p of parts) {
    if (looksWildcard(p)) {
      out.push(cleanWildcard(p)) // conserva wildcard sin esquema
    } else {
      const norm = normalizeOrigin(p)
      if (norm) out.push(norm)
    }
  }
  // Defaults solo en dev
  const dev = ['http://localhost:3000', 'http://127.0.0.1:3000']
    .map(normalizeOrigin).filter((s): s is string => Boolean(s))

  return Array.from(new Set([...out, ...dev]))
}

export const ALLOWED_ORIGINS = loadAllowedFromEnv()

/** Resuelve origin del req: header Origin o x-forwarded-proto/host. */
export function resolveRequestOrigin(req: Pick<NextApiRequest, 'headers'>): string | null {
  const hOrigin = req.headers.origin ?? null
  if (hOrigin) return normalizeOrigin(hOrigin)
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host =
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers['host'] as string) ||
    null
  if (!host) return null
  return normalizeOrigin(`${proto}://${host}`)
}

/** ¿Origin permitido? Compara exactos y wildcards. */
export function isOriginAllowed(originHeader?: string | null): boolean {
  const origin = normalizeOrigin(originHeader)
  if (!origin) return false
  const host = new URL(origin).host
  for (const entry of ALLOWED_ORIGINS) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1) // ".vercel.app"
      if (host.endsWith(suffix)) return true
    } else if (entry === origin) {
      return true
    }
  }
  return false
}

/** Headers CORS a partir del request. */
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
