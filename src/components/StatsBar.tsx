/**
 * Barra de métricas compacta para /mis-minutas.
 * - Accesible y responsiva.
 * - No depende de librerías extra (usa Bootstrap + CSS Module).
 */
import React from 'react'
import styles from '@/styles/Minutas.module.css'
import { BsClock, BsPaperclip, BsCardChecklist } from 'react-icons/bs'

type Props = {
  count: number
  totalMinutes: number
  attachments: number
}

export default function StatsBar({ count, totalMinutes, attachments }: Props) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return (
    <section className={styles.statsBar} aria-label="Resumen de actividad">
      <div className={styles.statItem} role="status" aria-live="polite">
        <BsCardChecklist className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>{count}</div>
          <div className={styles.statLabel}>Minutas</div>
        </div>
      </div>
      <div className={styles.statItem}>
        <BsClock className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>
            {hours}h {minutes.toString().padStart(2, '0')}m
          </div>
          <div className={styles.statLabel}>Tiempo en rango</div>
        </div>
      </div>
      <div className={styles.statItem}>
        <BsPaperclip className={styles.statIcon} />
        <div>
          <div className={styles.statValue}>{attachments}</div>
          <div className={styles.statLabel}>Adjuntos</div>
        </div>
      </div>
    </section>
  )
}
