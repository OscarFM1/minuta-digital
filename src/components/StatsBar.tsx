// src/components/StatsBar.tsx
/**
 * Barra de métricas compacta para /mis-minutas.
 * - Sin dependencias externas (SVG inline + CSS Module).
 * - Robusta ante valores nulos/NaN (muestra '—').
 * - Importa React explícitamente para que TS tenga el namespace JSX.
 */
import * as React from 'react'
// @ts-ignore: evitamos ts(2307) si TS no tiene declarations para CSS modules en dev
import styles from '../styles/Minutas.module.css'

type Props = {
  /** Total de minutas del usuario en el rango activo. */
  count: number
  /** Total de minutos (entero) del mismo conjunto. */
  totalMinutes: number
  /** Total de adjuntos (si aplica). */
  attachments: number
}

/** Normaliza un número. Si no es válido, retorna null. */
function safeNumber(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

/** Formatea minutos → "####h ##m". Si no es válido, retorna "—". */
function formatHm(totalMinutes: unknown): string {
  const m = safeNumber(totalMinutes)
  if (m === null || m < 0) return '—'
  const hours = Math.floor(m / 60)
  const minutes = m % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/** Íconos SVG inline (estilo Bootstrap Icons) */
function IconChecklist(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" {...props}>
      <path d="M10.854 3.146a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0L4.146 6.854a.5.5 0 1 1 .708-.708L6.5 7.793l3.646-3.647a.5.5 0 0 1 .708 0z"/>
      <path d="M14 3.5a1.5 1.5 0 0 1-1.5 1.5H8a.5.5 0 0 1 0-1h4.5a.5.5 0 0 0 0-1H8a.5.5 0 0 1 0-1h4.5A1.5 1.5 0 0 1 14 3.5zM1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h11A1.5 1.5 0 0 0 14 12.5V6a.5.5 0 0 0-1 0v6.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H6a.5.5 0 0 0 0-1H1.5z"/>
    </svg>
  )
}
function IconClock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" {...props}>
      <path d="M8 3.5a.5.5 0 0 1 .5.5v3.25l2.5 1.5a.5.5 0 1 1-.5.866l-2.75-1.65A.5.5 0 0 1 7.5 7V4a.5.5 0 0 1 .5-.5z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm0-1A7 7 0 1 1 8 1a7 7 0 0 1 0 14z"/>
    </svg>
  )
}
function IconPaperclip(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" {...props}>
      <path d="M5.5 6.5v5a2.5 2.5 0 0 0 5 0v-7a1.5 1.5 0 1 0-3 0v6a.5.5 0 0 0 1 0v-6a.5.5 0 0 1 1 0v7a1.5 1.5 0 1 1-3 0v-5a.5.5 0 0 0-1 0z"/>
    </svg>
  )
}

export default function StatsBar({ count, totalMinutes, attachments }: Props) {
  const countSafe = safeNumber(count)
  const attSafe = safeNumber(attachments)
  const timeLabel = formatHm(totalMinutes)

  return (
    <section className={styles.statsBar} aria-label="Resumen de actividad">
      {/* Minutas */}
      <div className={styles.statItem} role="status" aria-live="polite">
        <IconChecklist className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>{countSafe ?? '—'}</div>
          <div className={styles.statLabel}>Minutas</div>
        </div>
      </div>

      {/* Tiempo en rango */}
      <div className={styles.statItem}>
        <IconClock className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>{timeLabel}</div>
          <div className={styles.statLabel}>Tiempo en rango</div>
        </div>
      </div>

      {/* Adjuntos */}
      <div className={styles.statItem}>
        <IconPaperclip className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>{attSafe ?? '—'}</div>
          <div className={styles.statLabel}>Adjuntos</div>
        </div>
      </div>
    </section>
  )
}
