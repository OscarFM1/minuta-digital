// src/pages/_app.tsx
/**
 * Next.js App Root
 * -----------------------------------------------------------------------------
 * Propósito:
 *  - Cargar estilos globales y Bootstrap.
 *  - Proveer el contexto de autenticación (AuthProvider) a TODA la app.
 *  - Forzar cambio de contraseña si el perfil tiene must_change_password=true
 *    mediante <PasswordChangeGate>.
 *
 * Decisiones clave:
 *  1) _app NO hace lógicas de auth complejas ni redirecciones por cuenta propia.
 *     El flujo se delega a:
 *       - AuthProvider → estado de sesión consistente.
 *       - PasswordChangeGate → redirige a /cambiar-password cuando aplica.
 *       - Las páginas privadas se protegen con <SessionGate requireAuth>.
 *
 * Requisitos:
 *  - src/contexts/AuthContext.tsx (AuthProvider).
 *  - src/components/PasswordChangeGate.tsx (envuelve el hook usePasswordChangeGate).
 *
 * Beneficios:
 *  - Evita bucles y “cuelgues” de verificación.
 *  - Aísla responsabilidades: sesión, gate por password temporal y protección de rutas.
 */

import '@/styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { AuthProvider } from '@/contexts/AuthContext'
import PasswordChangeGate from '@/components/PasswordChangeGate'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Meta mínima común. Amplía según SEO/branding del proyecto */}
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Proveedor de sesión/usuario para toda la app */}
      <AuthProvider>
        {/* Gate que obliga a cambiar contraseña si el perfil lo requiere.
            Se auto-exime en /cambiar-password, /login y /logout (vía hook). */}
        <PasswordChangeGate>
          <Component {...pageProps} />
        </PasswordChangeGate>
      </AuthProvider>
    </>
  )
}
