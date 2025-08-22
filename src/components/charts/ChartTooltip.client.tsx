// src/components/charts/ChartTooltip.client.tsx
'use client'

/**
 * Tooltip personalizado para Recharts con:
 * - Etiquetas y descripciones centralizadas (METRIC_META)
 * - Formateo de horas con helper local (ruta relativa para evitar error de alias)
 *
 * Si más adelante configuras el alias "@/*" en tsconfig.json,
 * cambia la importación de formatHours a: "@/lib/format-hours"
 */

import { METRIC_META, type MetricKey } from './metricMeta'
// ✅ Ruta relativa (funciona sin alias). Desde src/components/charts → src/lib
import { formatHours } from '../../lib/format-hours'

// Tipado mínimo del payload que entrega Recharts al Tooltip.
// Evitamos importar tipos de Recharts para mantenerlo liviano.
type TooltipItem = {
  dataKey?: string
  value?: number | string
  color?: string
}

type Props = {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
}

export default function ChartTooltip({ active, payload, label }: Props) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      // Caja del tooltip: estilo claro, legible y compacto.
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '8px 10px',
        maxWidth: 300,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{String(label)}</div>

      {payload.map((p, idx) => {
        // dataKey esperado: 'efectivo' | 'descanso' | 'idle' | 'meta'
        const key = String(p.dataKey || '') as MetricKey
        const meta = METRIC_META[key]
        if (!meta) return null // ignora series no registradas en METRIC_META

        const numericValue = Number(p.value ?? 0) // robusto ante undefined/string

        return (
          <div key={`${key}-${idx}`} style={{ marginBottom: 6, lineHeight: 1.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: p.color || '#9ca3af',
                }}
              />
              <strong>{meta.label}:</strong>&nbsp;{formatHours(numericValue)}
            </div>
            <div style={{ opacity: 0.8 }}>{meta.desc}</div>
          </div>
        )
      })}
    </div>
  )
}
