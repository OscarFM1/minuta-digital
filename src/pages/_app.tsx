// src/pages/_app.tsx
/**
 * Next.js App Root
 * ----------------
 * Propósito:
 *   - Cargar estilos globales y Bootstrap.
 *   - Proveer el contexto de autenticación (AuthProvider) a TODA la app.
 *
 * Decisiones clave:
 *   1) NO se hacen redirecciones ni verificaciones de sesión en _app:
 *      - Evita bucles de navegación y estados "pegados" (e.g. "Verificando sesión...").
 *      - La sesión se resuelve en un único lugar (AuthProvider) y las páginas
 *        PRIVADAS usan <SessionGate requireAuth> para protegerse.
 *   2) Mantiene el render simple y predecible: _app monta el contexto y renderiza
 *      la página; nada más.
 *
 * Requisitos:
 *   - Debes tener creado: src/contexts/AuthContext.tsx (AuthProvider).
 *   - En las páginas privadas usa: import SessionGate from '@/components/SessionGate'
 *     y envuelve el contenido con <SessionGate requireAuth>...</SessionGate>.
 *
 * Beneficios:
 *   - Evita "colgados" en login y en rutas protegidas.
 *   - Un único estado de sesión para toda la app (estable y observable).
 */

import '@/styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { AuthProvider } from '@/contexts/AuthContext'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Meta mínima común. Amplía según SEO/branding del proyecto */}
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Proveedor de sesión/usuario para toda la app.
         - NO hace redirects aquí.
         - Las páginas privadas se protegen con <SessionGate requireAuth>. */}
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  )
}
