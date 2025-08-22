/**
 * Cliente de Supabase con service_role, para usar SOLO en el servidor.
 * - Permite usar el Admin API (auth.admin.*).
 * - Nunca lo importes desde el cliente/browser.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
