// src/pages/minutas/index.tsx
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Container, Row, Col, Button, Form, InputGroup, Accordion, Alert } from 'react-bootstrap';
import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard';
import styles from '@/styles/Minutas.module.css';
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate';
import AdminResetPassword from '@/components/AdminResetPassword';
import RequireRole from '@/components/RequireRole';

const DEBUG = true;

/* ---- Fechas seguras ---- */
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// Rango por defecto
const DEFAULT_FROM = toISODate(daysAgo(365)); // último año
const DEFAULT_TO   = toISODate(today());

type Filters = { desde: string; hasta: string; userId: string | null };
type UserOption = { value: string; label: string };

type RpcAdminItem = {
  id: string; date: string;
  start_time: string | null; end_time: string | null;
  started_at: string | null; ended_at: string | null;
  description: string | null; tarea_realizada: string | null;
  created_by_name: string | null; created_by_email: string | null;
  folio: string | null; folio_serial: number | null;
  attachments_count: number; duration_seconds: number; user_id: string | null;
};

/** Helper: llama v2 y cae a v1 si aún no existe. `args` es opcional. */
async function rpcWithFallback<T = any>(nameV2: string, nameV1: string, args?: Record<string, unknown>) {
  const v2 = await supabase.rpc(nameV2, args ?? {});
  if (v2.error) {
    const msg = v2.error.message?.toLowerCase() ?? '';
    if (msg.includes('not found') || msg.includes('rpc')) {
      const v1 = await supabase.rpc(nameV1, args ?? {});
      if (v1.error) throw v1.error;
      return v1.data as T;
    }
    throw v2.error;
  }
  return v2.data as T;
}

/* -------------------- Fetchers -------------------- */
async function fetchMinutes(filters: Filters): Promise<MinuteCardData[]> {
  const p_from_date = filters.desde || DEFAULT_FROM;
  const p_to_date   = filters.hasta || DEFAULT_TO;
  const p_user_id   = filters.userId; // puede ser null
  const p_tz        = 'America/Bogota';

  const payload = { p_from_date, p_to_date, p_user_id, p_tz, p_limit: 200, p_offset: 0 };
  if (DEBUG) console.info('[admin_minutes_page] payload', payload);

  // v2 con fallback a v1
  const data: any = await rpcWithFallback('admin_minutes_page_v2', 'admin_minutes_page', payload);

  // 🔧 Normalización de formato (v2={items...} | v1=[...])
  const rawItems: RpcAdminItem[] = Array.isArray(data)
    ? (data as RpcAdminItem[])
    : Array.isArray(data?.items)
      ? (data.items as RpcAdminItem[])
      : [];

  if (DEBUG) console.info('[admin_minutes_page] items.len(norm)', rawItems.length, { rawType: Array.isArray(data) ? 'array' : typeof data });

  return rawItems.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    description: r.description ?? r.tarea_realizada ?? null,
    adjuntos: Number(r.attachments_count ?? 0),
    user_name: r.created_by_name || r.created_by_email || 'Sin nombre',
    folio: r.folio ?? undefined,
    folio_serial: typeof r.folio_serial === 'number' ? r.folio_serial : undefined,
  }));
}

async function fetchUserOptions(from: string, to: string): Promise<UserOption[]> {
  const p_from_date = from || DEFAULT_FROM;
  const p_to_date   = to || DEFAULT_TO;
  const p_tz        = 'America/Bogota';

  const payload = { p_from_date, p_to_date, p_tz, p_limit: 100 };
  if (DEBUG) console.info('[admin_minute_user_options] payload', payload);

  const data: any[] = await rpcWithFallback('admin_minute_user_options_v2', 'admin_minute_user_options', payload);

  const out: UserOption[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string; created_by_name: string | null; created_by_email: string | null }>) {
    const email = r.created_by_email?.trim();
    const name  = r.created_by_name?.trim();
    const label = email && name ? `${name} <${email}>` : (email || name || '');
    const value = r.user_id;
    if (!value || !label || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

/* -------------------- Page -------------------- */
export default function MinutasGlobalPage() {
  return (
    <>
      <Head><title>Minutas — Administración</title></Head>
      <RequireRole allow={['admin', 'super_admin']}>
        <AdminMinutasView />
      </RequireRole>
    </>
  );
}

function AdminMinutasView() {
  useFirstLoginGate();
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>({
    desde: DEFAULT_FROM,
    hasta: DEFAULT_TO,
    userId: null,
  });
  const [forceKey, setForceKey] = useState<number>(0);

  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    ['admin-minutes', filters.desde, filters.hasta, filters.userId ?? '', forceKey],
    () => fetchMinutes(filters),
    { revalidateIfStale: true, revalidateOnFocus: false, revalidateOnReconnect: true, keepPreviousData: false, dedupingInterval: 0 }
  );

  const { data: userOptions } = useSWR<UserOption[]>(
    ['admin-minute-users', filters.desde, filters.hasta],
    () => fetchUserOptions(filters.desde, filters.hasta),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const ch = supabase
      .channel('minute-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'minute' }, () => { mutate(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mutate]);

  const onView = (id: string) => { void router.push(`/minutas/${id}`); };
  const handleHardRefresh = () => { setForceKey(Date.now()); void mutate(); };

  const handleUser  = (e: React.ChangeEvent<HTMLInputElement>) => setFilters((f) => ({ ...f, userId: e.target.value || null }));
  const handleDesde = (e: React.ChangeEvent<HTMLInputElement>) => setFilters((f) => ({ ...f, desde: e.target.value || DEFAULT_FROM }));
  const handleHasta = (e: React.ChangeEvent<HTMLInputElement>) => setFilters((f) => ({ ...f, hasta: e.target.value || DEFAULT_TO }));

  const clearFilters = () => setFilters({ desde: DEFAULT_FROM, hasta: DEFAULT_TO, userId: null });
  const verTodo180 = () => setFilters((f) => ({ ...f, desde: toISODate(daysAgo(180)), hasta: DEFAULT_TO }));

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas (Admin)</h1></Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => router.push('/minutas/estadisticas')}>Ir a estadísticas</Button>
          <Button variant="outline-secondary" onClick={handleHardRefresh}>Actualizar</Button>
          <Button as="a" href="/logout" variant="outline-secondary">Cerrar sesión</Button>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col lg={8} xl={7}>
          <Accordion>
            <Accordion.Item eventKey="reset">
              <Accordion.Header>Reset de contraseña (ADMIN)</Accordion.Header>
              <Accordion.Body><AdminResetPassword /></Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>

      {DEBUG && (
        <Alert variant="dark" className="py-2">
          <small>
            <b>DEBUG</b> • from: <code>{filters.desde}</code> • to: <code>{filters.hasta}</code> • userId: <code>{filters.userId ?? 'null'}</code>
          </small>
        </Alert>
      )}

      <Row className="g-3 align-items-end mb-4">
        <Col md={5} lg={4}>
          <Form.Label>Usuario</Form.Label>
          <InputGroup>
            <Form.Control
              type="text"
              placeholder="Nombre o correo"
              value={filters.userId ?? ''}
              onChange={handleUser}
              list="admin-users-datalist"
              aria-label="Filtrar por usuario (nombre o correo)"
            />
            <datalist id="admin-users-datalist">
              {userOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </datalist>
          </InputGroup>
          <Form.Text>Selecciona del listado (UUID interno).</Form.Text>
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Desde</Form.Label>
          <Form.Control type="date" value={filters.desde} onChange={handleDesde} />
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Hasta</Form.Label>
          <Form.Control type="date" value={filters.hasta} onChange={handleHasta} />
        </Col>

        <Col md={1} lg={2} className="d-flex gap-2">
          <Button variant="outline-secondary" className="ms-auto" onClick={clearFilters}>Limpiar</Button>
          <Button variant="outline-dark" onClick={verTodo180} title="Últimos 180 días">Ver todo</Button>
        </Col>
      </Row>

      {error && <p className="text-danger mt-3">Error al cargar minutas: {String(error.message || error)}</p>}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (<p className="mt-3">No hay minutas para mostrar.</p>)}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {items?.map((m) => (
          <Col key={m.id}>
            <MinuteCard minuta={m} mode="read" evidenceReadOnly onView={onView} viewHref={`/minutas/${m.id}`} />
          </Col>
        ))}
      </Row>
    </Container>
  );
}
