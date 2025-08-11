/**
 * /minutas/nueva
 * Página para crear una nueva minuta.
 * - SOLO accesible si hay sesión (cualquier usuario autenticado).
 * - NO carga datos desde la BD; solo usa Auth de Supabase (CSR).
 * - Al crear, redirige al detalle de la minuta recién creada.
 *
 * Seguridad real:
 *  - Recuerda que el bloqueo de UI NO reemplaza RLS.
 *  - En BD debe existir RLS para minute/attachment.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import MinuteForm from '@/components/MinuteForm'
import { supabase } from '@/lib/supabaseClient'

export default function NuevaMinutaPage() {
  const router = useRouter()

  /**
   * Estado local para evitar “flicker”:
   * - true  => verificando sesión (no renderizar el formulario aún)
   * - false => sesión verificada; render normal
   */
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      // 1) Pedimos el usuario actual desde Supabase Auth (CSR)
      const { data, error } = await supabase.auth.getUser()

      // 2) Si NO hay sesión, redirigimos estrictamente a /login
      if (!data?.user || error) {
        router.replace('/login')
        return
      }

      // 3) Hay sesión: permitir acceso
      if (mounted) setCheckingSession(false)
    }

    check()
    return () => {
      mounted = false
    }
  }, [router])

  /**
   * Callback tras crear la minuta exitosamente.
   * Redirige al detalle/edición de la nueva minuta.
   * El id lo retorna MinuteForm vía onSuccess.
   */
  function handleSuccess(nuevaMinutaId: string) {
    router.push(`/minutas/${nuevaMinutaId}`)
    // Si prefieres ir al listado:
    // router.push('/mis-minutas') // para usuarios normales
    // router.push('/minutas')     // para admin
  }

  // UX: mientras verificamos la sesión, no mostramos el formulario.
  if (checkingSession) {
    return <p className="mt-4">Verificando sesión…</p>
  }

  return (
    <div className="container py-4">
      <h1 className="mb-3">Nueva Minuta</h1>
      {/* MinuteForm ya inserta con user_id del usuario autenticado (RLS-friendly) */}
      <MinuteForm modo="crear" onSuccess={handleSuccess} />
    </div>
  )
}
