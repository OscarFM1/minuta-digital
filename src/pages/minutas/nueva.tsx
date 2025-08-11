// src/pages/minutas/nueva.tsx
/**
 * Página: Crear Minuta
 * - Muestra el formulario en modo "crear".
 * - Cuando el formulario guarda con éxito (onSuccess),
 *   navegamos explícitamente al detalle de la minuta creada.
 *
 * NOTA: Evitamos router.back() por UX consistente.
 * - Si el usuario refresca o entra directo, la navegación sigue bien.
 */

import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { Container, Alert } from 'react-bootstrap'
import MinuteForm from '@/components/MinuteForm'
import { supabase } from '@/lib/supabaseClient'

export default function NuevaMinutaPage() {
  const router = useRouter()

  // (Opcional, por si ya lo tienes): bloquear acceso a admin aquí también
  useEffect(() => {
    // Puedes mantener tu guardia de sesión/rol existente
    // Aquí un ejemplo mínimo por email:
    const check = async () => {
      const { data } = await supabase.auth.getUser()
      const email = data.user?.email || ''
      if (email === 'operaciones@multi-impresos.com') {
        router.replace('/minutas') // admin no crea
      }
    }
    check()
  }, [router])

  return (
    <Container className="py-4">
      {/* Ejemplo: mensaje contextual (opcional) */}
      <Alert variant="info">
        Completa el formulario para registrar una nueva minuta.
      </Alert>

      <MinuteForm
        modo="crear"
        /**
         * onSuccess:
         * - id: UUID de la nueva minuta insertada en la tabla `minute`.
         * - Acción: Ir al detalle explicitamente (sin depender del historial)
         */
        onSuccess={(id) => {
          // ✔ Navegación explícita → detalle recién creado
          router.push(`/minutas/${id}`)
        }}
      />
    </Container>
  )
}
