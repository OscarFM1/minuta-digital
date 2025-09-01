// src/components/SessionGate.tsx
/**
 * SessionGate — Componente de protección de rutas.
 *
 * USO:
 * <SessionGate requireAuth>
 *   <ContenidoPrivado />
 * </SessionGate>
 *
 * COMPORTAMIENTO:
 * - status='loading': muestra un spinner brevemente (con timeout anti-colgado).
 * - requireAuth=true y unauthenticated => redirige a /login (client-side).
 * - Si no requiere auth, simplemente evita parpadeos de UI durante 'loading'.
 *
 * NOTA:
 * - El timeout evita "congelados" si algo externo falla (p. ej., IndexedDB lenta).
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Spinner, Alert } from 'react-bootstrap'
import { useAuth } from '@/contexts/AuthContext'

type Props = {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
  loadingHint?: string
  timeoutMs?: number
}

export default function SessionGate({
  children,
  requireAuth = false,
  redirectTo = '/login',
  loadingHint = 'Verificando sesión…',
  timeoutMs = 6000,
}: Props) {
  const { status } = useAuth()
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)
  const timer = useRef<number | null>(null)

  // Timeout anti-colgado
  useEffect(() => {
    if (status === 'loading') {
      timer.current = window.setTimeout(() => setTimedOut(true), timeoutMs)
      return () => {
        if (timer.current) window.clearTimeout(timer.current)
      }
    } else {
      setTimedOut(false)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [status, timeoutMs])

  // Redirección si la ruta requiere auth
  useEffect(() => {
    if (requireAuth && status === 'unauthenticated') {
      router.replace(redirectTo)
    }
  }, [requireAuth, status, router, redirectTo])

  if (status === 'loading') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: 240 }}>
        <Spinner animation="border" role="status" />
        <small className="mt-2 text-muted">{loadingHint}</small>
        {timedOut && (
          <Alert variant="warning" className="mt-3 p-2">
            Esto está tardando más de lo normal. Recarga la página o intenta nuevamente.
          </Alert>
        )}
      </div>
    )
  }

  if (requireAuth && status === 'unauthenticated') {
    // Se está redirigiendo; no renderizamos children para evitar parpadeo
    return null
  }

  return <>{children}</>
}
