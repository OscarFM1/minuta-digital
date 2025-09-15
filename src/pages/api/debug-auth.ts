// /src/pages/api/debug-auth.ts
/**
 * Diagnóstico de sesión en server (SSR/API)
 * -----------------------------------------------------------------------------
 * - Verifica si el servidor "ve" la sesión y al usuario.
 * - Muestra flags de cookies sb-access-token / sb-refresh-token.
 * - Útil para cerrar "Auth session missing!".
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSupabase } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getServerSupabase(req, res)

  // getUser() NO depende del JWT en el header; lee de cookies vía getServerSupabase
  const [{ data: userData, error: userErr }, { data: sessionData, error: sessErr }] =
    await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])

  const session = sessionData?.session ?? null
  const user = userData?.user ?? session?.user ?? null

  return res.status(200).json({
    ok: !userErr && !sessErr,
    hasUser: Boolean(user),
    userId: user?.id ?? null,
    sessionPresent: Boolean(session),
    tokensInCookies: {
      hasAccess: Boolean(req.cookies['sb-access-token']),
      hasRefresh: Boolean(req.cookies['sb-refresh-token']),
    },
    errors: {
      userErr: userErr?.message ?? null,
      sessionErr: sessErr?.message ?? null,
    },
  })
}
