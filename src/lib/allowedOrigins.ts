// src/lib/allowedOrigins.ts
/**
 * Allow-list de orígenes para endpoints ADMIN.
 * Configura ALLOWED_ADMIN_ORIGINS con coma-separados (sin / al final).
 * Ej: http://localhost:3000,https://minuta.digital
 */
const raw = (process.env.ALLOWED_ADMIN_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Normalizamos a solo "origin" (esquema + host + puerto)
function normalize(origin: string | null): string | null {
  if (!origin) return null
  try {
    const u = new URL(origin)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

const ALLOW_LIST = new Set(raw.map(normalize).filter(Boolean) as string[])

export function isAllowedOrigin(originHeader?: string | null): boolean {
  // Si no hay allow-list definida, por seguridad DENEGAMOS
  if (ALLOW_LIST.size === 0) return false
  const origin = normalize(originHeader || '')
  if (!origin) return false
  return ALLOW_LIST.has(origin)
}

// Útil para logging/debug
export function allowedOrigins(): string[] {
  return Array.from(ALLOW_LIST)
}
