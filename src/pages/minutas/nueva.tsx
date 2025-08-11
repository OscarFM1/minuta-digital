/**
 * /minutas/nueva
 * Página para crear una nueva minuta.
 *
 * Reglas de acceso (UI Guard):
 *  1) Debe existir sesión de Supabase Auth (usuario autenticado).
 *  2) Si el usuario es ADMIN (operaciones@multi-impresos.com), NO puede crear:
 *     - Redirigimos a /minutas (vista de solo lectura del admin).
 *  3) Solo usuarios "no admin" ven el formulario y pueden crear minutas.
 *
 * Notas de seguridad:
 *  - Este guard de interfaz (CSR) evita accesos accidentales, pero no reemplaza
 *    la seguridad en base de datos. Asegúrate de tener RLS en `minute` y `attachment`
 *    para que cada usuario solo pueda crear/leer/editar lo que le corresponde.
 *  - MinuteForm debe insertar con `user_id = auth.uid()` para que RLS lo permita.
 *
 * UX:
 *  - Mientras validamos la sesión/rol, mostramos un indicador de "Verificando sesión…"
 *  - Usamos router.replace(...) para evitar "back loops" en la navegación del browser.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import MinuteForm from '@/components/MinuteForm'
import { supabase } from '@/lib/supabaseClient'

/** Correo del administrador con permisos SOLO de lectura (no crear) */
const ADMIN_EMAIL = 'operaciones@multi-impresos.com'

export default function NuevaMinutaPage() {
  const router = useRouter()

  /**
   * Flag local para evitar renderizar el formulario hasta
   * que confirmemos sesión + no-admin.
   */
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let mounted = true

    const checkAccess = async () => {
      // 1) Traemos el usuario actual desde Supabase Auth (CSR)
      const { data, error } = await supabase.auth.getUser()

      // 2) Si no hay sesión o hubo error, mandamos a /login
      if (!data?.user || error) {
        router.replace('/login')
        return
      }

      // 3) Si es el admin, NO puede crear → redirigir a /minutas
      const email = data.user.email
      if (email === ADMIN_EMAIL) {
        router.replace('/minutas')
        return
      }

      // 4) Usuario válido y NO admin → permitir render del formulario
      if (mounted) setCheckingSession(false)
    }

    checkAccess()
    return () => {
      mounted = false
    }
  }, [router])

  /**
   * Callback tras crear la minuta exitosamente.
   * - Navega al detalle/edición de la minuta recién creada.
   * - MinuteForm debe invocar este callback con el `id` insertado.
   */
  function handleSuccess(nuevaMinutaId: string) {
    router.push(`/minutas/${nuevaMinutaId}`)
    // Alternativas de navegación:
    // router.push('/mis-minutas') // si quieres volver al listado del usuario
  }

  // UX: mientras verificamos sesión/rol, no mostramos el formulario.
  if (checkingSession) {
    return <p className="mt-4">Verificando sesión…</p>
  }

  return (
    <div className="container py-4">
      <h1 className="mb-3">Nueva Minuta</h1>

      {/*
        MinuteForm:
        - Debe insertar con `user_id = auth.uid()` (ya lo dejamos así en tu componente).
        - Sube archivos a Storage y registra metadatos en `attachment`.
        - Llama a onSuccess(id) al terminar para navegar.
      */}
      <MinuteForm modo="crear" onSuccess={handleSuccess} />
    </div>
  )
}
