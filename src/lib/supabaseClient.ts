// src/lib/supabaseClient.ts

// 1) Imprime en consola las variables de entorno para verificar que se cargan
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log(
  'Supabase ANON key:', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 10) + '…' 
    : 'undefined'
)

import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase configurado con las variables de entorno.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
