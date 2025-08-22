// src/components/charts/MonthlySummaryChart.client.tsx
'use client'

/**
 * Gráfico mensual (stacked bars + meta en línea) sólo en cliente.
 * - Corrige el type error de YAxis.tickFormatter usando un wrapper
 *   con firma (value:number, index:number) => string.
 * - Usa ChartTooltip con descripciones por métrica.
 * - Nombres visibles en leyenda a partir de METRIC_META.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
} from 'recharts'

import ChartTooltip from './ChartTooltip.client'
import { METRIC_META } from './metricMeta'
// Ruta relativa para evitar problemas de alias "@/*"
import { formatHours } from '../../lib/format-hours'

// Paleta centralizada (moderna y consistente)
export const PALETTE = {
  effective: '#2563eb', // azul para "Efectivo"
  rest: '#9ca3af',      // gris para "Descansos"
  idle: '#f59e0b',      // ámbar para "Tiempo muerto"
  line: '#111827',      // gris oscuro para "Meta"
}

// Estructura mínima de filas (ajusta si tu data tiene otras claves)
type Row = {
  name: string          // etiqueta del eje X (día o usuario)
  efectivo: number
  descanso: number
  idle: number
  meta?: number
}

type Props = { data: Row[] }

// ✅ Wrapper con firma compatible con Recharts (evita el error de tipos)
const yTickFormatter = (value: number, _index?: number): string => {
  // Cambia a 'hh:mm' si prefieres 07:30 en vez de "7h 30m"
  return formatHours(value) // default: "7h 30m"
}

export default function MonthlySummaryChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis tickFormatter={yTickFormatter} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />

        {/* Barras apiladas: descanso + tiempo muerto + efectivo */}
        <Bar
          dataKey="descanso"
          stackId="a"
          fill={PALETTE.rest}
          name={METRIC_META.descanso.label}
        />
        <Bar
          dataKey="idle"
          stackId="a"
          fill={PALETTE.idle}
          name={METRIC_META.idle.label}
        />
        <Bar
          dataKey="efectivo"
          stackId="a"
          fill={PALETTE.effective}
          name={METRIC_META.efectivo.label}
        />

        {/* Línea de meta mensual (opcional) */}
        <Line
          type="monotone"
          dataKey="meta"
          stroke={PALETTE.line}
          name={METRIC_META.meta.label}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
