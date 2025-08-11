// src/pages/minutas/nueva.tsx
/**
 * Página: Crear nueva minuta
 * - Usa layout moderno con tarjeta centrada
 * - Conecta MinuteForm con modo "create"
 * - Incluye botón Volver estilizado
 */

import { useRouter } from 'next/router'
import MinuteForm from '@/components/MinuteForm'
import ui from '@/styles/NewMinute.module.css'

export default function NuevaMinutaPage() {
  const router = useRouter()

  const handleSaved = () => {
    // Tras guardar, volver a listado
    router.push('/minutas')
  }

  return (
    <main className={ui.page}>
      <div className={ui.wrapper}>
        <div className={ui.card}>
          {/* Header con botón volver */}
          <div className={ui.header}>
            <button
              type="button"
              className={ui.backBtn}
              onClick={() => router.back()}
            >
              ← Volver
            </button>
            <h1 className={ui.title}>Nueva minuta</h1>
          </div>

          {/* Formulario */}
          <MinuteForm
            mode="create"
            onSaved={handleSaved}
            requireAttachmentOnCreate={true}
          />
        </div>
      </div>
    </main>
  )
}
