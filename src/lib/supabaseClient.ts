// src/lib/supabaseClient.ts
/**
 * Supabase Client (Next.js)
 * ------------------------------------------------------------------
 * - Crea y exporta un único cliente de Supabase para toda la app.
 * - En **desarrollo** expone `window.supabase` para depurar en consola.
 * - Mantiene sesión y refresco automático de tokens.
 *
 * Seguridad:
 * - NUNCA expone variables en producción.
 * - En dev puedes ejecutar en la consola del navegador:
 *     supabase.rpc('admin_list_minutes', { p_page: 1, p_page_size: 10 })
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabaseClient] ❌ Faltan variables: NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY'
  )
}

// Log mínimo (solo visible en el navegador/devtools del cliente)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  // Evita imprimir la key completa
  // eslint-disable-next-line no-console
  console.log('✅ Supabase URL:', SUPABASE_URL)
  // eslint-disable-next-line no-console
  console.log('✅ Supabase ANON key:', SUPABASE_ANON_KEY.slice(0, 10) + '…')
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * DEBUG: expone el cliente en `window.supabase` SOLO en desarrollo.
 * Esto te permite correr comandos desde la consola del navegador, por ejemplo:
 *   supabase.rpc('admin_list_minutes', { p_page: 1, p_page_size: 10 })
 */
declare global {
  // Evita error TS al asignar a window
  interface Window {
    supabase?: SupabaseClient
  }
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.supabase = supabase
  // eslint-disable-next-line no-console
  console.log('🔎 window.supabase habilitado (solo DEV)')
}
