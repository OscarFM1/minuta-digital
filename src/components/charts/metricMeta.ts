// src/components/charts/metricMeta.ts
// Centraliza etiquetas, colores y descripciones “humanas” para no duplicar strings.
// Cambia aquí y se refleja en tooltips, leyendas, y textos de ayuda.

export const METRIC_META = {
  bruto: {
    label: 'Bruto',
    desc:
      'Tiempo total registrado entre inicio y fin por día, sin descuentos ni pausas.',
  },
  descanso: {
    label: 'Descansos',
    desc:
      'Bloque fijo diario: 1h 20m (almuerzo + descansos programados).',
  },
  idle: {
    label: 'Tiempo muerto (promedio)',
    desc:
      'Tolerancia promedio por día (30m) para transiciones/interrupciones.',
  },
  efectivo: {
    label: 'Efectivo',
    desc:
      'Horas efectivas: Bruto – Descansos – Tiempo muerto (nunca negativo).',
  },
  meta: {
    label: 'Meta',
    desc:
      'Objetivo mensual derivado de 44h/semana (referencia de cumplimiento).',
  },
} as const

export type MetricKey = keyof typeof METRIC_META
