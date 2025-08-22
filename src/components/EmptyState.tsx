// src/components/EmptyState.tsx
import Link from 'next/link'
import { Button } from 'react-bootstrap'
import React from 'react'

type Props = {
  title: string
  /** acepta nodo para poder forzar estilos desde la página */
  description?: React.ReactNode
  ctaHref?: string
  ctaLabel?: string
  className?: string
}

export default function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
  className,
}: Props) {
  return (
    <div className={className ?? ''} style={{ textAlign: 'center', padding: '2rem 0' }}>
      <h2 className="h4 mb-2">{title}</h2>
      {/* sin text-muted ni opacidades */}
      {description && <div style={{ marginBottom: 16 }}>{description}</div>}
      {ctaHref && ctaLabel && (
        <Button as={Link as any} href={ctaHref} variant="primary">
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}
