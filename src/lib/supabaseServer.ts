// /src/lib/supabaseServer.ts
/**
 * Cliente de servidor Supabase (SSR/API) — DEFINITIVO
 * -----------------------------------------------------------------------------
 * - Usa @supabase/ssr → createServerClient
 * - Lee/escribe cookies en req/res (Next.js API Route o GSSP).
 * - Evita "Auth session missing!" cuando el server consulta la sesión.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@supabase/ssr'
import { serialize } from 'cookie'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function getServerSupabase(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name]
      },
      set(name: string, value: string, options: any) {
        // Escribe Set-Cookie SIN sobreescribir las previas
        const cookie = serialize(name, value, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          ...options,
        })
        const prev = res.getHeader('Set-Cookie')
        if (!prev) {
          res.setHeader('Set-Cookie', cookie)
        } else {
          const arr = Array.isArray(prev) ? prev : [String(prev)]
          res.setHeader('Set-Cookie', [...arr, cookie])
        }
      },
      remove(name: string, options: any) {
        const cookie = serialize(name, '', {
          path: '/',
          expires: new Date(0),
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          ...options,
        })
        const prev = res.getHeader('Set-Cookie')
        if (!prev) {
          res.setHeader('Set-Cookie', cookie)
        } else {
          const arr = Array.isArray(prev) ? prev : [String(prev)]
          res.setHeader('Set-Cookie', [...arr, cookie])
        }
      },
    },
  })
}
