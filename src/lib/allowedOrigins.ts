// src/lib/allowedOrigins.ts

// Lista blanca de orígenes para endpoints ADMIN
// Lee de env y añade valores útiles por defecto en dev.
const fromEnv = (process.env.ALLOWED_ADMIN_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// En desarrollo solemos usar estos orígenes
const devDefaults = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

export const ALLOWED_ORIGINS = Array.from(new Set([...fromEnv, ...devDefaults]))

export function isOriginAllowed(origin?: string | null) {
  if (!origin) return false
  try {
    const o = new URL(origin).origin
    return ALLOWED_ORIGINS.includes(o)
  } catch {
    // si viene ya como origin plano (sin path), compáralo directo
    return ALLOWED_ORIGINS.includes(origin)
  }
}
