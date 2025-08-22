// src/pages/minutas/nueva.tsx
/**
 * Crear nueva minuta (flujo Start/Stop):
 * - Muestra únicamente el formulario de creación.
 * - Al guardar correctamente, REDIRIGE al detalle /minutas/[id]
 *   donde se presentan los botones Start/Stop.
 * - No renderiza ni resuelve uploader de evidencias aquí.
 *
 * Accesibilidad:
 * - Botón Volver con aria-label.
 * - Mensajes claros y minimalistas.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/router'
import MinuteForm from '@/components/MinuteForm'
import ui from '@/styles/NewMinute.module.css'
import styles from '@/styles/Minutas.module.css'

// 🔹 Placeholder especializado para preprensa
const TITLE_PLACEHOLDER =
  'Ej.:  Imposición, sangrías y trapping para etiqueta 10×15 cm'

export default function NuevaMinutaPage() {
  const router = useRouter()

  // 🔧 Ajuste no intrusivo del placeholder del título (sin tocar MinuteForm)
  useEffect(() => {
    // Selectores tolerantes a distintos names/placeholders históricos
    const selectors = [
      'input[name="title"]',
      'input[name="titulo"]',
      'input[name="task_title"]',
      'input[placeholder*="Inventario de bodega"]',
      'input[placeholder*="Inventario"]',
      'input[placeholder*="Título"]',
    ].join(', ')

    const apply = () => {
      const el = document.querySelector<HTMLInputElement>(selectors)
      if (el && el.placeholder !== TITLE_PLACEHOLDER) {
        el.placeholder = TITLE_PLACEHOLDER
      }
    }

    // 1) Intento inmediato
    apply()

    // 2) Observa cambios del DOM por si MinuteForm se monta después
    const obs = new MutationObserver(() => apply())
    obs.observe(document.body, { childList: true, subtree: true })

    // 3) Fallback rápido (por si el observer pierde un frame)
    const t = window.setTimeout(apply, 120)

    return () => {
      obs.disconnect()
      window.clearTimeout(t)
    }
  }, [])

  return (
    <main className={ui.page}>
      <div className={ui.wrapper}>
        {/* Header */}
        <div className={ui.headerTop}>
          <button
            type="button"
            className={ui.back}
            onClick={() => router.back()}
            aria-label="Volver"
          >
            ← Volver
          </button>
        </div>

        <h1 className={`${styles.newMinuteTitle} mb-3`}>Nueva minuta</h1>

        {/* Únicamente el formulario; al crear redirige al detalle */}
        <section className={ui.card}>
          <MinuteForm
            mode="create"
            requireAttachmentOnCreate={false}  // no exigimos adjuntos en la creación
            enableAutosave={false}             // no aplica en create
            onSaved={(m) => router.push(`/minutas/${m.id}`)} // ir al detalle para Start/Stop
          />
        </section>
      </div>
    </main>
  )
}
