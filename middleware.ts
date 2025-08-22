// middleware.ts
/**
 * Enforce de "primer login" a nivel SSR.
 * Lee la sesión desde cookies y si `first_login === true` fuerza redirección a /cambiar-password.
 * Respeta rutas públicas (login, cambiar-password, assets, API públicas).
 *
 * NOTA: coloca este archivo en la RAÍZ del proyecto.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const url = req.nextUrl;
  const path = url.pathname;

  // Instancia Supabase atada a req/res para refrescar sesión si aplica
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // 1) Rutas públicas: NO interceptar
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/cambiar-password') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/public') ||
    path.startsWith('/api/hello') ||        // <- tus APIs "públicas" según capturas
    path.startsWith('/api/invite');         // <- ajusta si debe ser pública

  if (isPublic) return res;

  // 2) Rutas que requieren sesión (según tu árbol: /mis-minutas, /minutas, /admin)
  const requiresAuth =
    path.startsWith('/mis-minutas') ||
    path.startsWith('/minutas') ||
    path.startsWith('/admin');

  if (requiresAuth && !session) {
    const redirect = new URL('/login', req.url);
    redirect.searchParams.set('go', path + url.search);
    return NextResponse.redirect(redirect);
  }

  // 3) En primer ingreso -> forzar cambio de contraseña
  const firstLogin = session?.user?.user_metadata?.first_login === true;
  if (firstLogin && !path.startsWith('/cambiar-password')) {
    const redirect = new URL('/cambiar-password', req.url);
    redirect.searchParams.set('go', path + url.search);
    return NextResponse.redirect(redirect);
  }

  return res;
}

// Evita interceptar archivos estáticos
export const config = {
  matcher: ['/((?!.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif)|_next/|favicon|public/).*)'],
};
