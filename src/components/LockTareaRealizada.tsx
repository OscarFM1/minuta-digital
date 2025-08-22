// src/components/LockTareaRealizada.tsx
/**
 * Bloquea el textarea de "Tarea realizada" sin modificar MinuteForm.
 * - Aplica readonly + aria-readonly y la clase .is-readonly-tarea (la que ya tienes en tu CSS).
 * - Reaplica el lock si el form se re-renderiza (MutationObserver).
 */

import { useEffect } from 'react'

function lock(el: HTMLTextAreaElement) {
  if (!el) return
  el.readOnly = true
  el.setAttribute('aria-readonly', 'true')
  // Tu clase existente en MinuteFormUser.module.css
  el.classList.add('is-readonly-tarea')

  // Hardening ligero para evitar edición por teclado/pegado
  const prevent = (e: Event) => e.preventDefault()
  el.addEventListener('paste', prevent)
  el.addEventListener('drop', prevent)
  el.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent
    // Permitimos navegación/copia
    const allow =
      e.key === 'Tab' ||
      e.key === 'Shift' ||
      e.key.startsWith('Arrow') ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.ctrlKey || e.metaKey
    if (!allow) e.preventDefault()
  })
}

export default function LockTareaRealizada() {
  useEffect(() => {
    const selectors = [
      'textarea[name="tareaRealizada"]',
      'textarea[name="tarea_realizada"]',
      'textarea[placeholder*="Describe lo que realizaste"]',
    ].join(', ')

    const tryLock = () => {
      const el = document.querySelector<HTMLTextAreaElement>(selectors)
      if (el && !el.classList.contains('is-readonly-tarea')) lock(el)
    }

    tryLock()
    const obs = new MutationObserver(() => tryLock())
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  return null
}
