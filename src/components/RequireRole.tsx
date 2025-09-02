// src/components/RequireRole.tsx
/**
 * RequireRole — Guard de rutas por rol para Next.js (cliente).
 *
 * Uso:
 *   <RequireRole allow={['admin', 'super_admin']}>{children}</RequireRole>
 *
 * Comportamiento:
 * - Verifica sesión actual (supabase.auth.getUser()).
 * - Si no hay sesión → redirige a /login.
 * - Si must_change_password=true → redirige a /cambiar-password.
 * - Si el rol del usuario NO está en `allow` → redirige a /403.
 *
 * Implementación:
 * - Lee `role` y `must_change_password` desde la tabla `public.profiles`.
 * - Muestra un spinner mínimo mientras verifica (evita parpadeos).
 *
 * Seguridad:
 * - Esto es UX; la protección real está en RLS/SQL y, si aplica, en tus APIs /api/*.
 */

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'

type Role = 'worker' | 'admin' | 'super_admin'
type Props = {
  allow: Role[]
  children: ReactNode
  /**
   * Ruta a la que se redirige si el usuario NO tiene rol permitido (default: /403)
   */
  denyTo?: string
  /**
   * Ruta de login (default: /login)
   */
  loginPath?: string
  /**
   * Ruta de cambio de contraseña (default: /cambiar-password)
   */
  changePwdPath?: string
}

export default function RequireRole({
  allow,
  children,
  denyTo = '/403',
  loginPath = '/login',
  changePwdPath = '/cambiar-password',
}: Props) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      // 1) Sesión
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!mounted) return
      if (!user) {
        router.replace(loginPath)
        return
      }

      // 2) Perfil (role, must_change_password)
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('role, must_change_password')
        .eq('id', user.id)
        .single()

      if (!mounted) return

      if (pErr || !prof) {
        // Si no hay perfil, por seguridad manda a login
        router.replace(loginPath)
        return
      }

      if (prof.must_change_password) {
        router.replace(changePwdPath + (router.asPath ? `?go=${encodeURIComponent(router.asPath)}` : ''))
        return
      }

      const ok = allow.includes(prof.role as Role)
      setGranted(ok)
      setChecking(false)

      if (!ok) {
        router.replace(denyTo)
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [allow, changePwdPath, denyTo, loginPath, router])

  // Mientras valida, evita parpadeos de contenido
  if (checking) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <div style={{ opacity: .7, fontSize: 14 }}>Verificando permisos…</div>
      </div>
    )
  }

  if (!granted) return null
  return <>{children}</>
}
