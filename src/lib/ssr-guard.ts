// src/lib/ssr-guard.ts
/**
 * Guard SSR robusto para Next.js (Minuta Digital)
 * -----------------------------------------------------------------------------
 * Objetivo:
 * - Eliminar 500 en SSR y decidir acceso por rol sin "throws".
 * - Forzar cambio de password si profiles.must_change_password === true.
 * - Si el SELECT de profiles falla por RLS, usa rol del JWT como fallback.
 *
 * Uso:
 *   export const getServerSideProps = withAuthSSR({ allowRoles: ['admin','super_admin'] })
 *   // o sin allowRoles para "cualquiera autenticado"
 *
 * Requisitos:
 * - @supabase/auth-helpers-nextjs
 * - Policy SELECT en profiles para self (y/o admin).
 */

import { GetServerSideProps, GetServerSidePropsContext } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

type Role = 'worker' | 'admin' | 'super_admin'
type GuardOpts = {
  allowRoles?: Role[]                  // lista de roles permitidos (opcional)
  redirectIfWorkerTo?: string          // destino si es worker y no está permitido
}

export function withAuthSSR(opts: GuardOpts = {}): GetServerSideProps {
  const { allowRoles, redirectIfWorkerTo = '/mis-minutas' } = opts

  return async (ctx: GetServerSidePropsContext) => {
    try {
      const supabase = createServerSupabaseClient(ctx)
      const { data: { session } } = await supabase.auth.getSession()

      // 1) Sin sesión → login con retorno
      if (!session) {
        const next = encodeURIComponent(ctx.resolvedUrl || '/')
        return { redirect: { destination: `/login?next=${next}`, permanent: false } }
      }

      const uid = session.user.id
      let role: Role | null = null
      let mustChange = false

      // 2) Intentar leer profiles con RLS
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role, must_change_password')
        .eq('id', uid)
        .single()

      if (!profErr && prof) {
        role = (prof.role as Role) ?? 'worker'
        mustChange = !!prof.must_change_password
      } else {
        // Fallback a JWT si el SELECT no es posible
        const jwtRole =
          (session.user?.app_metadata as any)?.role ||
          (session.user?.user_metadata as any)?.role
        role = (jwtRole as Role) ?? 'worker'
        mustChange = false
        console.warn('[SSR Guard] profiles SELECT falló; usando JWT role.', profErr?.message)
      }

      // 3) Gate de cambio de contraseña
      if (mustChange) {
        const go = encodeURIComponent(ctx.resolvedUrl || '/')
        return { redirect: { destination: `/cambiar-password?go=${go}`, permanent: false } }
      }

      // 4) Gate por rol (si se especificó)
      if (allowRoles && !allowRoles.includes(role)) {
        if (role === 'worker') {
          return { redirect: { destination: redirectIfWorkerTo, permanent: false } }
        }
        // Rol inesperado → fallback seguro
        return { redirect: { destination: '/mis-minutas', permanent: false } }
      }

      // 5) OK → props neutras
      return { props: { initialRole: role } }
    } catch (e: any) {
      console.error('[SSR Guard] error no controlado:', e?.message)
      // Fallback seguro para no dar 500
      return { redirect: { destination: '/login', permanent: false } }
    }
  }
}
