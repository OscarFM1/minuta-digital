/**
 * Cliente SSR de Supabase para Pages Router
 * - Usa @supabase/ssr y cookies de Next (req/res).
 * - Requisito: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o ANON).
 *
 * Docs:
 * - Crear cliente SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * - Next.js SSR (Pages Router): https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import type { GetServerSidePropsContext } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { serialize } from 'cookie'

export function createSupabaseServerClient(ctx: GetServerSidePropsContext) {
  const { req, res } = ctx

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! /* o ANON */,
    {
      cookies: {
        get(name: string) {
          return req.cookies[name]
        },
        set(name: string, value: string, options: CookieOptions) {
          const setCookie = serialize(name, value, options)
          const prev = res.getHeader('Set-Cookie')
          res.setHeader('Set-Cookie', Array.isArray(prev) ? [...prev, setCookie] : [setCookie])
        },
        remove(name: string, options: CookieOptions) {
          const setCookie = serialize(name, '', { ...options, maxAge: 0 })
          const prev = res.getHeader('Set-Cookie')
          res.setHeader('Set-Cookie', Array.isArray(prev) ? [...prev, setCookie] : [setCookie])
        },
      },
    }
  )
}
