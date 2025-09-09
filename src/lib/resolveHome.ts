// Decide la “home” por rol y valida un ?go opcional.
// worker  -> /mis-minutas
// admin/* -> /minutas
export type UserRole = 'worker' | 'admin' | 'super_admin'

export const normalizeRole = (r?: string | null): UserRole => {
  if (r === 'super_admin') return 'super_admin'
  if (r === 'admin') return 'admin'
  return 'worker'
}

export function homeForRole(role?: string | null): string {
  const r = normalizeRole(role)
  return r === 'worker' ? '/mis-minutas' : '/minutas'
}

export function resolvePostAuthDestination(role?: string | null, go?: string | null) {
  const safeHome = homeForRole(role)
  if (!go) return safeHome

  try {
    const u = new URL(go, 'https://dummy.local') // base dummy solo para parsear
    const path = u.pathname + (u.search ?? '')
    const isWorker = normalizeRole(role) === 'worker'
    const okWorker = path === '/' || path === '/mis-minutas' || path.startsWith('/cambiar-password')
    const okAdmin  = path === '/' || path.startsWith('/minutas') || path.startsWith('/cambiar-password')
    if ((isWorker && okWorker) || (!isWorker && okAdmin)) return path
    return safeHome
  } catch {
    return safeHome
  }
}
