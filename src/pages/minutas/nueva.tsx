/**
 * Página para crear una nueva minuta
 * Esta ruta NO debe intentar cargar datos desde Supabase
 * Autor: TuNombre
 */

import { useRouter } from 'next/router'
import MinuteForm from '@/components/MinuteForm'
export default function NuevaMinutaPage() {
  const router = useRouter()

  /**
   * Callback tras crear la minuta exitosamente.
   * Redirige al listado o a la edición según prefieras.
   */
  function handleSuccess(nuevaMinutaId: string) {
    // Redirige al detalle/edición de la nueva minuta:
    router.push(`/minutas/${nuevaMinutaId}`)
    // O al listado general:
    // router.push('/minutas')
  }

  return (
    <div>
      <h1>Nueva Minuta</h1>
      {/* MinuteForm debe aceptar un prop "modo" o similar para diferenciar entre crear/editar */}
      <MinuteForm modo="crear" onSuccess={handleSuccess} />
    </div>
  )
}
