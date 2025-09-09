// src/lib/withAuthSSR.ts
import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

// Opcionalmente puedes tipar user/supabase si ya importas tipos:
// import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * withAuthAndPwdGate
 * -----------------------------------------------------------------------------
 * Gate SSR: sesión obligatoria + clave temporal (profiles.must_change_password)
 *
 * - Sin sesión  -> /login?unauthorized=1&go=<ruta>
 * - Con flag    -> /cambiar-password?go=<ruta>
 * - Si OK       -> ejecuta getProps opcional y retorna props
 *
 * NOTA de tipos:
 * Next pide que P extienda un objeto plano; por eso usamos:
 *   P extends Record<string, any> = Record<string, any>
 */
export function withAuthAndPwdGate<
  P extends Record<string, any> = Record<string, any>
>(
  getProps?: (
    ctx: GetServerSidePropsContext,
    supabase: any, // tipa como SupabaseClient si prefieres
    user: any      // tipa como User si prefieres
  ) => Promise<GetServerSidePropsResult<P>> | GetServerSidePropsResult<P>
): GetServerSideProps<P> {
  return async (ctx) => {
    const supabase = createSupabaseServerClient(ctx)

    // 1) Usuario validado por el servidor (revalida token con cookies)
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user
    if (userErr || !user) {
      return {
        redirect: {
          destination: `/login?unauthorized=1&go=${encodeURIComponent(ctx.resolvedUrl)}`,
          permanent: false,
        },
      }
    }

    // 2) Gate de "cambiar contraseña obligatoria"
    const { data: prof } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single()

    if (prof?.must_change_password) {
      return {
        redirect: {
          destination: `/cambiar-password?go=${encodeURIComponent(ctx.resolvedUrl)}`,
          permanent: false,
        },
      }
    }

    // 3) Ejecuta getProps opcional de la página
    if (getProps) {
      return await getProps(ctx, supabase, user)
    }

    return { props: {} as P }
  }
}
