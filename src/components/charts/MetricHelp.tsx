// src/components/charts/MetricHelp.tsx
import { METRIC_META } from './metricMeta'

export function MetricHelp() {
  return (
    <ul style={{ display: 'grid', gap: 8, marginTop: 8, fontSize: 12, opacity: 0.9 }}>
      <li><strong>{METRIC_META.bruto.label}:</strong> {METRIC_META.bruto.desc}</li>
      <li><strong>{METRIC_META.descanso.label}:</strong> {METRIC_META.descanso.desc}</li>
      <li><strong>{METRIC_META.idle.label}:</strong> {METRIC_META.idle.desc}</li>
      <li><strong>{METRIC_META.efectivo.label}:</strong> {METRIC_META.efectivo.desc}</li>
      <li><strong>{METRIC_META.meta.label}:</strong> {METRIC_META.meta.desc}</li>
    </ul>
  )
}
