// src/pages/minutas/estadisticas.tsx
/**
 * Estadísticas mensuales (ADMIN) + Exportación CSV/XLSX con gráficos (imágenes).
 * 🔒 Protegida por rol: admin | super_admin (RequireRole)
 *   - Se eliminó el guard de email (ADMIN_EMAIL) y el useEffect de verificación manual.
 *   - Si el usuario tiene must_change_password=true, <RequireRole> redirige a /cambiar-password.
 *   - Si no tiene rol permitido, <RequireRole> redirige a /403 (o /login según tu componente).
 *
 * Buenas prácticas:
 * - El acceso se aplica en UI y BD (RLS ya permite SELECT global a admin/super_admin).
 * - Mantén este gating también en cualquier API /api/stats/* que consuma este dashboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import {
  Container, Row, Col, Card, Table, Form, Button, Badge, Modal, Spinner, Alert,
} from 'react-bootstrap'
import { FiArrowLeft, FiInfo } from 'react-icons/fi'
import { supabase } from '@/lib/supabaseClient'
import RequireRole from '@/components/RequireRole' // 🔒 GATING por rol

// ---------- Recharts: dynamic con { default: ... } + ssr:false ----------
const ResponsiveContainer = dynamic(
  () => import('recharts').then(m => ({ default: m.ResponsiveContainer })),
  { ssr: false }
)
const ComposedChart = dynamic(
  () => import('recharts').then(m => ({ default: m.ComposedChart })),
  { ssr: false }
)
const Bar = dynamic(
  () => import('recharts').then(m => ({ default: m.Bar })),
  { ssr: false }
)
const Line = dynamic(
  () => import('recharts').then(m => ({ default: m.Line })),
  { ssr: false }
)
const XAxis = dynamic(
  () => import('recharts').then(m => ({ default: m.XAxis })),
  { ssr: false }
)
const YAxis = dynamic(
  () => import('recharts').then(m => ({ default: m.YAxis })),
  { ssr: false }
)
const Tooltip = dynamic(
  () =>
    import('recharts').then(m => ({
      default: (props: any) => <m.Tooltip {...props} />,
    })),
  { ssr: false }
)
const Legend = dynamic(
  () =>
    import('recharts').then(m => ({
      default: (props: any) => <m.Legend {...props} />,
    })),
  { ssr: false }
)
const CartesianGrid = dynamic(
  () => import('recharts').then(m => ({ default: m.CartesianGrid })),
  { ssr: false }
)
const PieChart = dynamic(
  () => import('recharts').then(m => ({ default: m.PieChart })),
  { ssr: false }
)
const Pie = dynamic(
  () => import('recharts').then(m => ({ default: m.Pie })),
  { ssr: false }
)
const Cell = dynamic(
  () => import('recharts').then(m => ({ default: m.Cell })),
  { ssr: false }
)

// Tooltip con descripciones (cliente). Si no lo quieres, deja <Tooltip />
const ChartTooltip = dynamic(
  () => import('@/components/charts/ChartTooltip.client').then(m => ({ default: m.default })),
  { ssr: false }
)

// Paleta consistente
const PALETTE = {
  effective: '#3b82f6', // azul
  expected:  '#94a3b8', // slate
  rest:      '#9ca3af', // gray
  idle:      '#f59e0b', // amber
  donutBg:   '#e5e7eb',
}

const LOGIN_DOMAIN = process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local'

/* ============================================================================
 * Lista blanca de correos para incluir en el tablero de estadísticas
 * - Incluye el worker de QA por defecto: pruebas@login.local
 * - Permite sumar correos extra por ENV: NEXT_PUBLIC_STATS_EXTRA_EMAILS="a@x.com,b@y.com"
 * ==========================================================================*/
const TEST_WORKER =
  (process.env.NEXT_PUBLIC_TEST_WORKER_EMAIL || 'pruebas@login.local').toLowerCase()
const EXTRA_ALLOWED =
  (process.env.NEXT_PUBLIC_STATS_EXTRA_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

// ---------------- Config negocio ----------------
const USERS = [
  { username: 'kat.acosta',   name: 'Katherine.A' },
  { username: 'ivan.zamudio', name: 'Iván Zamudio' },
  { username: 'audia.mesa',   name: 'Audia Mesa' },
  { username: 'juan.diaz',    name: 'Juan Díaz' },
  { username: 'kat.blades',   name: 'Katherine.B' },
  // 👇 añadimos explícitamente el worker de pruebas como usuario visible
  { username: 'pruebas',      name: 'Tester (QA)' },
].map(u => ({ ...u, email: `${u.username}@${LOGIN_DOMAIN}`.toLowerCase() }))

// Lista final (única) para las consultas
const ALLOWED_EMAILS = Array.from(new Set([
  ...USERS.map(u => u.email),
  TEST_WORKER,
  ...EXTRA_ALLOWED,
]))

const LUNCH_MIN = 60
const BREAK_MIN = 20
const REST_PER_DAY_MIN = LUNCH_MIN + BREAK_MIN

const NORMAL_IDLE_MIN = 30 // Tiempo muerto promedio/día
const WEEKLY_HOURS = 44
const WORKWEEK_DAYS = [1,2,3,4,5]

// ------------- Utilidades de tiempo/fecha -------------
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

function monthEdges(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { start, end, startISO: toISO(start), endISO: toISO(end) }
}

function countBusinessDays(start: Date, end: Date, workDays = WORKWEEK_DAYS) {
  let count = 0
  const d = new Date(start)
  while (d <= end) {
    if (workDays.includes(d.getDay())) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function parseTimeToMin(t?: string | null): number | null {
  if (!t) return null
  const [h, m, s] = t.split(':').map(Number)
  const mm = (h || 0) * 60 + (m || 0) + Math.floor((s || 0) / 60)
  return Number.isFinite(mm) ? mm : null
}

function diffMin(start?: string | null, end?: string | null): number {
  const a = parseTimeToMin(start)
  const b = parseTimeToMin(end)
  if (a == null || b == null || b <= a) return 0
  return b - a
}

function minToHhmm(min: number) {
  const sign = min < 0 ? '-' : ''
  const M = Math.abs(min)
  const hh = Math.floor(M / 60)
  const mm = M % 60
  return `${sign}${pad(hh)}:${pad(mm)}`
}

// ---------------- Tipos ----------------
type MinuteRow = {
  user_id: string | null
  created_by_email: string | null
  created_by_name: string | null
  date: string | null
  start_time: string | null
  end_time: string | null
}

type UserAgg = {
  email: string
  name: string
  daysWithLogs: number
  grossMin: number
  restMin: number
  netMin: number
  idleMin: number
  effectiveMin: number
  byDay: Array<{
    date: string
    grossMin: number
    restMin: number
    netMin: number
    idleMin: number
    effectiveMin: number
  }>
}

// Tipos auxiliares para mapas
type DayMinutesMap = Map<string, number>;
type PerUserPerDay = Map<string, DayMinutesMap>;

// --- Ayuda de interpretación ---
function MetricHelp() {
  return (
    <ul style={{ display: 'grid', gap: 8, marginTop: 8, fontSize: 12, opacity: 0.9 }}>
      <li><strong>Bruto:</strong> Tiempo total entre inicio y fin por día, sin descuentos.</li>
      <li><strong>Descansos:</strong> Bloque fijo diario: 1h 20m (almuerzo + pausas).</li>
      <li><strong>Tiempo muerto (promedio):</strong> Tolerancia diaria promedio (30m) para transiciones/interrupciones.</li>
      <li><strong>Efectivo:</strong> Bruto – Descansos – Tiempo muerto (nunca negativo).</li>
      <li><strong>Meta:</strong> Objetivo mensual derivado de 44h/semana.</li>
    </ul>
  )
}

/* ===================== CSV UTILS ===================== */
function csvEscape(val: unknown, sep = ','): string {
  const s = String(val ?? '')
  const needsQuotes = s.includes('"') || s.includes('\n') || s.includes(sep)
  const escaped = s.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}
function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][], sep = ',') {
  const lines: string[] = []
  lines.push(`sep=${sep}`)
  lines.push(headers.join(sep))
  for (const r of rows) lines.push(r.map(v => csvEscape(v, sep)).join(sep))
  const csv = '\uFEFF' + lines.join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
/* ===================================================== */

export default function AdminEstadisticasPage() {
  const router = useRouter()
  const [ym, setYm] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
  const { start, end, startISO, endISO } = monthEdges(ym)

  const businessDays = useMemo(() => countBusinessDays(start, end), [ym])
  const expectedPerDayMin = Math.round((WEEKLY_HOURS / WORKWEEK_DAYS.length) * 60)
  const expectedPerDayEffectiveMin = Math.max(0, expectedPerDayMin - NORMAL_IDLE_MIN)
  const expectedMonthEffectiveMin = businessDays * expectedPerDayEffectiveMin

  // Nudge de “filtra por mes”
  const [showNudge, setShowNudge] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShowNudge(false), 6000)
    const onScroll = () => setShowNudge(false)
    window.addEventListener('scroll', onScroll, { once: true })
    return () => { clearTimeout(t); window.removeEventListener('scroll', onScroll) }
  }, [])

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<MinuteRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [detail, setDetail] = useState<UserAgg | null>(null)

  // Refs para exportar imágenes de los dos gráficos del modal
  const chartDailyRef = useRef<HTMLDivElement | null>(null)
  const donutRef = useRef<HTMLDivElement | null>(null)

  // Fetch mensual SOLO de los usuarios de la lista blanca (USERS + QA/env)
  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('minute')
          .select('user_id, created_by_email, created_by_name, date, start_time, end_time')
          .gte('date', startISO)
          .lte('date', endISO)
          .in('created_by_email', ALLOWED_EMAILS)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
        if (error) throw error
        setRows((data ?? []) as MinuteRow[])
      } catch (e: any) {
        setError(e?.message ?? 'No se pudieron cargar las minutas.')
      } finally {
        setLoading(false)
      }
    })()
  }, [startISO, endISO])

  // Agregación por usuario
  const dataByUser: UserAgg[] = useMemo(() => {
    const base: Record<string, UserAgg> = {}
    for (const u of USERS) {
      base[u.email] = {
        email: u.email, name: u.name,
        daysWithLogs: 0, grossMin: 0, restMin: 0, netMin: 0, idleMin: 0, effectiveMin: 0,
        byDay: [],
      }
    }

    // email -> (date -> grossMin)
    const perUserPerDay: PerUserPerDay = new Map()

    for (const r of rows) {
      const email = (r.created_by_email ?? '').toLowerCase()
      if (!email || !(email in base)) continue

      const date = r.date ?? ''
      if (!date) continue

      const dur = diffMin(r.start_time, r.end_time)
      if (dur <= 0) continue

      let mapDay = perUserPerDay.get(email)
      if (!mapDay) {
        mapDay = new Map<string, number>()
        perUserPerDay.set(email, mapDay)
      }
      mapDay.set(date, (mapDay.get(date) ?? 0) + dur)
    }

    for (const u of USERS) {
      const dayMap: DayMinutesMap = perUserPerDay.get(u.email) ?? new Map<string, number>()

      const days: [string, number][] = Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))

      let gross = 0, rest = 0, net = 0, idle = 0, eff = 0
      const byDay: UserAgg['byDay'] = []

      for (const [d, g] of days) {
        const restD = g > 0 ? REST_PER_DAY_MIN : 0
        const netD  = Math.max(0, g - restD)
        const idleD = netD > 0 ? Math.min(netD, NORMAL_IDLE_MIN) : 0
        const effD  = Math.max(0, netD - idleD)

        gross += g; rest += restD; net += netD; idle += idleD; eff += effD
        byDay.push({ date: d, grossMin: g, restMin: restD, netMin: netD, idleMin: idleD, effectiveMin: effD })
      }

      base[u.email].daysWithLogs = days.length
      base[u.email].grossMin = gross
      base[u.email].restMin = rest
      base[u.email].netMin = net
      base[u.email].idleMin = idle
      base[u.email].effectiveMin = eff
      base[u.email].byDay = byDay
    }

    return Object.values(base).sort((a,b) => a.name.localeCompare(b.name))
  }, [rows])

  const overviewChart = useMemo(() => {
    return dataByUser.map(u => ({
      name: u.name.split(' ')[0],
      effectiveH: +(u.effectiveMin / 60).toFixed(2),
      expectedH:  +((expectedMonthEffectiveMin) / 60).toFixed(2),
    }))
  }, [dataByUser, expectedMonthEffectiveMin])

  const detailDailyChart = useMemo(() => {
    if (!detail) return []
    return detail.byDay.map(d => ({
      date: d.date.slice(5),
      restH: +(d.restMin / 60).toFixed(2),
      idleH: +(d.idleMin / 60).toFixed(2),
      effectiveH: +(d.effectiveMin / 60).toFixed(2),
    }))
  }, [detail])

  const pct = (effMin: number) =>
    expectedMonthEffectiveMin > 0 ? Math.round((effMin / expectedMonthEffectiveMin) * 100) : 0

  /* ===================== EXPORT HANDLERS ===================== */
  const onExportMonthlyCsv = () => {
    const headers = [
      'Usuario','Email','Días con registros','Bruto (HH:MM)','Descansos (HH:MM)',
      'Tiempo muerto (promedio) (HH:MM)','Efectivo (HH:MM)','Meta mes efectiva (HH:MM)','Cumplimiento (%)',
    ]
    const rowsCsv = dataByUser.map(u => [
      u.name, u.email, u.daysWithLogs,
      minToHhmm(u.grossMin), minToHhmm(u.restMin), minToHhmm(u.idleMin),
      minToHhmm(u.effectiveMin), minToHhmm(expectedMonthEffectiveMin), pct(u.effectiveMin),
    ])
    downloadCsvFile(`resumen-mensual_${ym}.csv`, headers, rowsCsv)
  }

  const onExportDetailCsv = () => {
    if (!detail) return
    const headers = ['Fecha','Bruto (HH:MM)','Descansos (HH:MM)','Tiempo muerto (promedio) (HH:MM)','Efectivo (HH:MM)']
    const rowsCsv = detail.byDay.map(d => [
      d.date, minToHhmm(d.grossMin), minToHhmm(d.restMin), minToHhmm(d.idleMin), minToHhmm(d.effectiveMin),
    ])
    downloadCsvFile(`detalle_${detail.name.replace(/\s+/g, '')}_${ym}.csv`, headers, rowsCsv)
  }

  // Exportar detalle diario (XLSX) con ambos gráficos como imágenes (robusto)
  const onExportDetailXlsx = async () => {
    if (!detail) return

    const { toPng } = await import('html-to-image')
    // @ts-ignore: build browser
    const exceljsMod = await import('exceljs/dist/exceljs.min.js')
    const ExcelJS: any = (exceljsMod as any).default ?? exceljsMod

    const dailyNode = chartDailyRef.current
    const donutNode = donutRef.current
    if (!dailyNode || !donutNode) return

    await new Promise(r => setTimeout(r, 150))

    const capture = async (node: HTMLElement) => {
      try {
        return await toPng(node, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
          skipFonts: true,
          filter: (n: any) => n.tagName !== 'IFRAME' && n.tagName !== 'LINK' && n.tagName !== 'SCRIPT',
        })
      } catch (e) {
        console.error('toPng failed', e)
        return ''
      }
    }

    const [dailyPng, donutPng] = await Promise.all([capture(dailyNode), capture(donutNode)])
    if (!dailyPng || !donutPng) {
      alert('No se pudieron capturar las imágenes de los gráficos. Revisa CORS/CSS externos.')
      return
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Minuta Digital'
    const wsCharts = wb.addWorksheet('Gráficos')
    const wsDetail = wb.addWorksheet('Detalle diario')

    const dRect = dailyNode.getBoundingClientRect()
    const oRect = donutNode.getBoundingClientRect()

    const img1 = wb.addImage({ base64: dailyPng.replace(/^data:image\/png;base64,/, ''), extension: 'png' })
    const img2 = wb.addImage({ base64: donutPng.replace(/^data:image\/png;base64,/, ''), extension: 'png' })

    wsCharts.mergeCells('A1:D1')
    wsCharts.getCell('A1').value = `Detalle — ${detail.name} (${ym})`
    wsCharts.getCell('A1').font = { bold: true, size: 14 }

    wsCharts.addImage(img1, { tl: { col: 0, row: 1 },  ext: { width: Math.round(dRect.width), height: Math.round(dRect.height) } })
    wsCharts.addImage(img2, { tl: { col: 0, row: 22 }, ext: { width: Math.round(oRect.width), height: Math.round(oRect.height) } })

    wsDetail.columns = [
      { header: 'Fecha', width: 12 },
      { header: 'Bruto (HH:MM)', width: 16 },
      { header: 'Descansos (HH:MM)', width: 20 },
      { header: 'Tiempo muerto (promedio) (HH:MM)', width: 30 },
      { header: 'Efectivo (HH:MM)', width: 18 },
    ]
    detail.byDay.forEach(d => {
      wsDetail.addRow([
        d.date,
        minToHhmm(d.grossMin),
        minToHhmm(d.restMin),
        minToHhmm(d.idleMin),
        minToHhmm(d.effectiveMin),
      ])
    })
    wsDetail.getRow(1).font = { bold: true }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `detalle_${detail.name.replace(/\s+/g, '')}_${ym}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }
  /* ============================================================ */

  return (
    <RequireRole allow={['admin','super_admin']}> {/* 🔒 Gating por rol */}
      <Head><title>Estadísticas mensuales — Admin</title></Head>

      <Container className="py-4">
        {/* Volver + Título + Selector Mes con Nudge */}
        <Row className="align-items-center mb-3">
          <Col className="d-flex align-items-center gap-3">
            {/* Botón Volver estilizado */}
            <button
              type="button"
              className="backBtn"
              onClick={() => router.back()}
              aria-label="Volver"
            >
              <FiArrowLeft /> Volver
            </button>

            <div>
              <h1 className="h3 m-0">Estadísticas mensuales</h1>
              <div className="text-muted">Resumen con descansos y tiempo muerto promedio descontados</div>
            </div>
          </Col>

          <Col xs="12" md="auto" className="d-flex align-items-end gap-3 mt-3 mt-md-0">
            {showNudge && (
              <div className="stats-nudge" aria-live="polite">
                <span className="pulse" aria-hidden />
                <span className="tip">
                  <FiInfo style={{ marginRight: 6 }} aria-hidden />
                  Tip: filtra por <strong>mes</strong>
                </span>
                <span className="arrow" aria-hidden>➡</span>
              </div>
            )}

            <Form.Group controlId="monthSelect" className="m-0">
              <Form.Label className="mb-1">Mes</Form.Label>
              <Form.Control
                type="month"
                value={ym}
                onChange={(e) => { setYm(e.target.value); setShowNudge(false) }}
              />
            </Form.Group>
          </Col>
        </Row>

        {/* Botón Export CSV del resumen */}
        <div className="d-flex justify-content-end mb-2">
          <Button size="sm" variant="outline-success" onClick={onExportMonthlyCsv}>
            Exportar resumen (CSV)
          </Button>
        </div>

        {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

        <Card className="p-3 mb-4">
          {loading ? (
            <div className="d-flex align-items-center gap-2">
              <Spinner size="sm" animation="border" /> Cargando…
            </div>
          ) : (
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer>
                <ComposedChart data={overviewChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis unit="h" />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="effectiveH"
                    name="Efectivo (h)"
                    fill={PALETTE.effective}
                    radius={[6,6,0,0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedH"
                    name="Meta (h)"
                    stroke={PALETTE.expected}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-3">
          <div className="table-responsive">
            <Table hover className="align-middle">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className="text-center">Días c/reg.</th>
                  <th className="text-end" title="Tiempo total entre inicio y fin por día, sin descuentos.">Bruto</th>
                  <th className="text-end">Descansos</th>
                  <th className="text-end">Tiempo muerto (promedio)</th>
                  <th className="text-end">Efectivo</th>
                  <th className="text-end">Meta mes</th>
                  <th className="text-end">Cumpl.</th>
                  <th className="text-end"></th>
                </tr>
              </thead>
              <tbody>
                {dataByUser.map(u => {
                  const compliance = pct(u.effectiveMin)
                  return (
                    <tr key={u.email}>
                      <td>
                        <div className="fw-semibold">{u.name}</div>
                        <div className="text-muted small">{u.email}</div>
                      </td>
                      <td className="text-center">{u.daysWithLogs}</td>
                      <td className="text-end">{minToHhmm(u.grossMin)}</td>
                      <td className="text-end">{minToHhmm(u.restMin)}</td>
                      <td className="text-end">{minToHhmm(u.idleMin)}</td>
                      <td className="text-end fw-semibold">{minToHhmm(u.effectiveMin)}</td>
                      <td className="text-end">{minToHhmm(expectedMonthEffectiveMin)}</td>
                      <td className="text-end">
                        <Badge bg={compliance >= 100 ? 'success' : compliance >= 80 ? 'warning' : 'secondary'}>
                          {compliance}%
                        </Badge>
                      </td>
                      <td className="text-end">
                        <Button size="sm" variant="outline-primary" onClick={() => { setDetail(u); setShow(true) }}>
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      </Container>

      {/* Modal Detalle Usuario */}
      <Modal show={!!detail && show} onHide={() => setShow(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>Detalle — {detail?.name} ({ym})</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!detail ? null : (
            <>
              <Row className="g-3">
                <Col lg={8}>
                  <Card className="p-3 h-100">
                    <h6 className="mb-2">Composición diaria (horas)</h6>
                    <div ref={chartDailyRef} style={{ width: '100%', height: 260, background: '#fff' }}>
                      <ResponsiveContainer>
                        <ComposedChart
                          data={detailDailyChart}
                          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis unit="h" />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend />
                          <Bar dataKey="restH"      name="Descansos"                stackId="a" fill={PALETTE.rest} />
                          <Bar dataKey="idleH"      name="Tiempo muerto (promedio)" stackId="a" fill={PALETTE.idle} />
                          <Bar dataKey="effectiveH" name="Efectivo"                 stackId="a" fill={PALETTE.effective} />
                          <Line
                            type="monotone"
                            dataKey="effectiveH"
                            name="Efectivo (línea)"
                            stroke={PALETTE.effective}
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <MetricHelp />
                  </Card>
                </Col>
                <Col lg={4}>
                  <Card className="p-3 h-100 d-flex flex-column justify-content-center">
                    <h6 className="mb-2">Cumplimiento mensual</h6>
                    <div ref={donutRef} style={{ width: '100%', height: 240, background: '#fff' }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Efectivo',           value: +(Math.min(detail.effectiveMin, Math.max(1, expectedMonthEffectiveMin) ) / 60).toFixed(2) },
                              { name: 'Restante para meta', value: +(Math.max(0, expectedMonthEffectiveMin - detail.effectiveMin) / 60).toFixed(2) },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={2}
                          >
                            {[PALETTE.effective, PALETTE.donutBg].map((c, i) => (
                              <Cell key={i} fill={c} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-2">
                      <div className="display-6 fw-bold">
                        {expectedMonthEffectiveMin > 0
                          ? Math.round((detail.effectiveMin / expectedMonthEffectiveMin) * 100)
                          : 0}%</div>
                      <div className="text-muted small">
                        Efectivo: {minToHhmm(detail.effectiveMin)} / Meta: {minToHhmm(expectedMonthEffectiveMin)}
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>

              <Card className="p-3 mt-3">
                <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
                  <h6 className="mb-2">Tabla diaria</h6>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-success" onClick={onExportDetailCsv}>
                      Exportar detalle (CSV)
                    </Button>
                    <Button size="sm" variant="success" onClick={onExportDetailXlsx}>
                      Exportar detalle (XLSX con gráficos)
                    </Button>
                  </div>
                </div>
                <div className="table-responsive">
                  <Table size="sm" hover>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th className="text-end" title="Tiempo total entre inicio y fin por día, sin descuentos.">
                          Bruto
                        </th>
                        <th className="text-end">Descansos</th>
                        <th className="text-end">Tiempo muerto (promedio)</th>
                        <th className="text-end">Efectivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.byDay.map(d => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td className="text-end">{minToHhmm(d.grossMin)}</td>
                          <td className="text-end">{minToHhmm(d.restMin)}</td>
                          <td className="text-end">{minToHhmm(d.idleMin)}</td>
                          <td className="text-end fw-semibold">{minToHhmm(d.effectiveMin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>

      {/* Estilos del nudge y del botón Volver */}
      <style jsx>{`
        /* --- NUDGE (filtro por mes) --- */
        .stats-nudge {
          display: inline-flex;
          align-items: center;
          gap: .5rem;
          user-select: none;
          pointer-events: none;
        }
        .pulse {
          width: 10px;
          height: 10px;
          border-radius: 9999px;
          background: #009ada;
          box-shadow: 0 0 0 0 rgba(0, 154, 218, 0.6);
          animation: pulseAnim 1.8s ease-out infinite;
        }
        @keyframes pulseAnim {
          0%   { box-shadow: 0 0 0 0 rgba(0,154,218,.6); }
          70%  { box-shadow: 0 0 0 12px rgba(0,154,218,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,154,218,0); }
        }
        .tip {
          background: #e6f7ff;
          color: #035d82;
          border: 1px solid rgba(0, 154, 218, .25);
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: .85rem;
          white-space: nowrap;
        }
        .arrow {
          font-size: 1.25rem;
          line-height: 1;
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .arrow { display: none; }
          .tip { font-size: .8rem; }
        }

        /* --- Botón Volver (branding #009ada) --- */
        .backBtn {
          display: inline-flex;
          align-items: center;
          gap: .5rem;
          padding: .35rem .6rem;
          border-radius: 9999px;
          background: transparent;
          color: #009ada;
          border: 1px solid transparent;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          text-decoration: none;
        }
        .backBtn :global(svg) {
          transform: translateY(-1px);
        }
        .backBtn:hover {
          background: #e6f7ff;
          border-color: rgba(0,154,218,.25);
          text-decoration: none;
        }
        .backBtn:focus {
          outline: none;
          box-shadow: 0 0 0 .2rem rgba(0,154,218,.35);
        }
      `}</style>
    </RequireRole>
  )
}
