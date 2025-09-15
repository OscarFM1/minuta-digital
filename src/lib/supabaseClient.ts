// /src/lib/supabaseClient.ts
/**
 * Supabase Client (Next.js - CLIENTE / CSR)
 * ============================================================================
 * Propósito
 * - Un único cliente de Supabase para el **navegador** con sesión persistente.
 * - Auto-refresh de tokens y manejo del callback OAuth (detectSessionInUrl).
 *
 * Seguridad
 * - SOLO usa variables públicas: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * - NO usar service_role aquí (nunca en el cliente).
 *
 * Depuración (solo DEV)
 * - Expone `window.supabase` y logs mínimos con valores truncados.
 *
 * Notas
 * - Este cliente NO debe usarse en SSR/API. Para servidor usa @supabase/ssr
 *   (createServerClient/createMiddlewareClient) con manejo explícito de cookies.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ----------------------------- ENV obligatorias ------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabaseClient] ❌ Faltan variables: NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY'
  )
}

// ------------------------------ Cliente CSR ----------------------------------
/**
 * Cliente para el navegador.
 * - persistSession: true → guarda tokens en localStorage.
 * - autoRefreshToken: true → renueva tokens automáticamente.
 * - detectSessionInUrl: true → captura el token del callback OAuth (si aplica).
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ----------------------------- Depuración DEV --------------------------------
declare global {
  interface Window {
    supabase?: SupabaseClient
  }
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  // Logs de verificación (no exponen la key completa en consola)
  // eslint-disable-next-line no-console
  console.log('✅ Supabase URL:', SUPABASE_URL)
  // eslint-disable-next-line no-console
  console.log('✅ Supabase ANON key:', SUPABASE_ANON_KEY.slice(0, 10) + '…')

  // Exponer el cliente en la consola del navegador
  window.supabase = supabase
  // eslint-disable-next-line no-console
  console.log('🔎 window.supabase habilitado (solo DEV)')
}
