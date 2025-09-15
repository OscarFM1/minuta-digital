// /middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

function isTrue(v: any): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}
function isPublicPath(p: string) {
  return p.startsWith('/login') ||
    p.startsWith('/cambiar-password') ||
    p.startsWith('/api/hello') ||
    p.startsWith('/api/invite')
}
function requiresAuth(p: string) {
  return p.startsWith('/mis-minutas') || p.startsWith('/minutas') || p.startsWith('/admin')
}

export async function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') return NextResponse.next()

  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname
  if (isPublicPath(path)) return res

  if (requiresAuth(path) && !session) {
    const to = new URL('/login', req.url)
    to.searchParams.set('go', path + req.nextUrl.search)
    return NextResponse.redirect(to)
  }

  if (session) {
    const firstLogin = isTrue(session.user?.user_metadata?.first_login)
    if (firstLogin && !path.startsWith('/cambiar-password')) {
      const to = new URL('/cambiar-password', req.url)
      to.searchParams.set('go', path + req.nextUrl.search)
      return NextResponse.redirect(to)
    }
  }
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
