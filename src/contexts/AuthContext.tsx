// src/contexts/AuthContext.tsx
/**
 * AuthContext — Manejo centralizado de sesión Supabase (cliente).
 *
 * OBJETIVO:
 * - Evitar "pantallas colgadas" tipo "Verificando sesión..." por estados inconsistentes.
 * - Garantizar un único lugar donde sabrás si:
 *   - status: 'loading' | 'authenticated' | 'unauthenticated'
 *   - session: Session | null
 *   - user: User | null
 *
 * CÓMO FUNCIONA:
 * - Al montar, llama a supabase.auth.getSession() (1 sola vez) para obtener la sesión inicial.
 * - Se suscribe a onAuthStateChange para reaccionar a SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
 * - Nunca consulta sesión durante el render (evita SSR/hydration issues); todo va en useEffect.
 * - Siempre hace setStatus('authenticated'|'unauthenticated') incluso si hay error, evitando spinners infinitos.
 *
 * MEJORES PRÁCTICAS:
 * - Persistencia habilitada por defecto con supabase-js (localStorage). No depende de cookies de dominio.
 * - Páginas protegidas deben usar <SessionGate> o el hook useAuth() para condicionar render.
 *
 * NOTA:
 * - Si cambias tu versión de supabase-js, valida nombres de eventos: INITIAL_SESSION, SIGNED_IN, etc.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  // Forzar refresh manual (fallback si notas tokens caducando en prod)
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let active = true

    // 1) Sesión inicial (evita pantallas colgadas al cargar)
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('[Auth] getSession error:', error)
        }
        const s = data?.session ?? null
        setSession(s)
        setStatus(s ? 'authenticated' : 'unauthenticated')
      })
      .catch((err) => {
        console.error('[Auth] getSession exception:', err)
        if (active) {
          setSession(null)
          setStatus('unauthenticated')
        }
      })

    // 2) Suscripción a cambios (signin, signout, refresh…)
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Log no intrusivo para diagnosticar producción (vercel logs)
      console.info('[Auth] onAuthStateChange:', event)
      setSession(nextSession)
      setStatus(nextSession ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      active = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  const refresh = async () => {
    try {
      // Fallback explícito si algo queda "pegado" o notas 401 inesperados
      const { data, error } = await supabase.auth.refreshSession()
      if (error) console.warn('[Auth] refreshSession error:', error)
      setSession(data?.session ?? null)
      setStatus(data?.session ? 'authenticated' : 'unauthenticated')
    } catch (e) {
      console.warn('[Auth] refreshSession exception:', e)
      setSession(null)
      setStatus('unauthenticated')
    }
  }

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    refresh,
  }), [status, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
