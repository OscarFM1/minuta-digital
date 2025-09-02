/**
 * logout.ts
 * Cierre de sesión 100% confiable:
 *  - llama supabase.auth.signOut()
 *  - limpia claves de sesión guardadas por supabase en localStorage
 *  - hace navegación dura a /login (window.location.replace) para evitar estado pegado
 */
import { supabase } from '@/lib/supabaseClient'

/** Limpia las claves de auth que usa supabase-js v2 (sb-<ref>-auth-token*) */
function clearSupabaseAuthKeys() {
  try {
    const keys = Object.keys(window.localStorage || {})
      .filter(k => /^sb-.*-auth-token/i.test(k))
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/**
 * Cierra sesión y redirige con navegación dura.
 * @param to ruta destino (por defecto /login)
 */
export async function logoutAndRedirect(to = '/login') {
  try { await supabase.auth.signOut() } catch { /* ignore */ }
  clearSupabaseAuthKeys()
  // Navegación dura: garantiza que el árbol y el AuthProvider se monten frescos
  if (typeof window !== 'undefined') window.location.replace(to)
}
