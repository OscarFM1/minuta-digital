/**
 * Skeletons para listas de tarjetas.
 * - Simula la grilla final (12px gap).
 * - count controla cuántos esqueletos mostrar.
 */
import React from 'react'
import styles from '@/styles/Minutas.module.css'

export default function Skeletons({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden="true">
          <div className={styles.skeletonBar} style={{ width: '60%' }} />
          <div className={styles.skeletonBar} style={{ width: '40%' }} />
          <div className={styles.skeletonBar} style={{ width: '90%' }} />
          <div className={styles.skeletonBadgeRow}>
            <span className={styles.skeletonBadge} />
            <span className={styles.skeletonBadge} />
          </div>
        </div>
      ))}
    </div>
  )
}
