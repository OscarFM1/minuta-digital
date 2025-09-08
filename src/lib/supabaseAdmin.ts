// src/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

// ⚠️ Solo usar en SERVER. No importarlo jamás en el cliente.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server secret
  { auth: { persistSession: false, autoRefreshToken: false } }
)
