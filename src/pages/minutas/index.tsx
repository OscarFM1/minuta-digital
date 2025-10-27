// src/pages/minutas/index.tsx
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Container,
  Row,
  Col,
  Button,
  Form,
  InputGroup,
  Accordion,
  Alert,
} from 'react-bootstrap';
import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard';
import styles from '@/styles/Minutas.module.css';
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate';
import AdminResetPassword from '@/components/AdminResetPassword';
import RequireRole from '@/components/RequireRole';

const DEBUG = true;

/* ---- Fechas ---- */
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const DEFAULT_FROM = toISODate(daysAgo(365));
const DEFAULT_TO = toISODate(today());

type Filters = {
  desde: string | null;
  hasta: string | null;
  userId: string | null;
};
type UserOption = { value: string; label: string };

// ATT: attachments_count es array de objetos { id }
type RpcAdminItem = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  tarea_realizada: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  folio: string | null;
  folio_serial: number | null;
  attachments_count: { id: string }[];
};

/** RPC v2→v1 */
async function rpcWithFallback<T = any>(
  nameV2: string,
  nameV1: string,
  args?: Record<string, unknown>
): Promise<T> {
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

async function fetchMinutes(filters: Filters): Promise<MinuteCardData[]> {
  const payload = {
    p_from_date: filters.desde,
    p_to_date: filters.hasta,
    p_user_id: filters.userId,
    p_tz: 'America/Bogota',
    p_limit: 200,
    p_offset: 0,
  };
  if (DEBUG) console.info('[admin_minutes_page] payload', payload);

  // 1) RPC con fallback
  try {
    const data: any = await rpcWithFallback(
      'admin_minutes_page_v2',
      'admin_minutes_page',
      payload
    );
    const rawItems: RpcAdminItem[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
      ? data.items
      : [];
    if (DEBUG) console.info('[admin_minutes_page] RPC count', rawItems.length);
    if (rawItems.length) {
      return rawItems.map((r) => ({
        id: r.id,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        description: r.description ?? r.tarea_realizada ?? null,
        adjuntos: r.attachments_count.length,
        user_name: r.created_by_name || r.created_by_email || 'Sin nombre',
        folio: r.folio ?? undefined,
        folio_serial:
          typeof r.folio_serial === 'number' ? r.folio_serial : undefined,
      }));
    }
    console.warn('[fetchMinutes] RPC devolvió 0 filas → fallback');
  } catch (e) {
    console.warn('[fetchMinutes] error RPC → fallback', e);
  }

  // 2) Fallback directo a tabla `minute`
  const res = await supabase.from('minute').select(`
      id,
      date,
      start_time,
      end_time,
      description,
      tarea_realizada,
      created_by_name,
      created_by_email,
      folio,
      folio_serial,
      attachments_count:attachment!inner(id)
    `);
  if (res.error) {
    console.error('[fetchMinutes] fallback error', res.error);
    throw res.error;
  }
  const rows = res.data as RpcAdminItem[];
  if (DEBUG) console.info('[fetchMinutes] fallback count', rows.length);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    description: r.description ?? r.tarea_realizada ?? null,
    adjuntos: r.attachments_count.length,
    user_name: r.created_by_name || r.created_by_email || 'Sin nombre',
    folio: r.folio ?? undefined,
    folio_serial:
      typeof r.folio_serial === 'number' ? r.folio_serial : undefined,
  }));
}

async function fetchUserOptions(
  from: string | null,
  to: string | null
): Promise<UserOption[]> {
  const payload = { p_from_date: from, p_to_date: to, p_tz: 'America/Bogota', p_limit: 100 };
  if (DEBUG) console.info('[admin_minute_user_options] payload', payload);

  const data: any[] = await rpcWithFallback(
    'admin_minute_user_options_v2',
    'admin_minute_user_options',
    payload
  );

  const out: UserOption[] = [];
  const seen = new Set<string>();
  for (const r of data) {
    const email = r.created_by_email?.trim() ?? '';
    const name = r.created_by_name?.trim() ?? '';
    const label = email && name ? `${name} <${email}>` : email || name || '';
    if (!r.user_id || seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push({ value: r.user_id, label });
  }
  return out;
}

export default function MinutasGlobalPage() {
  return (
    <>
      <Head>
        <title>Minutas — Administración</title>
      </Head>
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
  const [forceKey, setForceKey] = useState(0);

  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    ['admin-minutes', filters.desde, filters.hasta, filters.userId, forceKey],
    () => fetchMinutes(filters),
    {
      revalidateIfStale: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: false,
      dedupingInterval: 0,
    }
  );

  const { data: userOptions } = useSWR<UserOption[]>(
    ['admin-minute-users', filters.desde, filters.hasta],
    () => fetchUserOptions(filters.desde, filters.hasta),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    // Suscripción sin async
    const ch = supabase
      .channel('minute-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'minute' }, () => {
        void mutate();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [mutate]);

  const onView = (id: string) => router.push(`/minutas/${id}`);
  const handleHardRefresh = () => {
    setForceKey(Date.now());
    void mutate();
  };
  const handleUser = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, userId: e.target.value || null }));
  const handleDesde = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, desde: e.target.value || null }));
  const handleHasta = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, hasta: e.target.value || null }));
  const clearFilters = () =>
    setFilters({ desde: DEFAULT_FROM, hasta: DEFAULT_TO, userId: null });
  const verTodo = () =>
    setFilters({ desde: null, hasta: null, userId: null });

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col>
          <h1 className={styles.title}>Minutas (Admin)</h1>
        </Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button
            variant="outline-primary"
            onClick={() => router.push('/minutas/estadisticas')}
          >
            Ir a estadísticas
          </Button>
          <Button variant="outline-secondary" onClick={handleHardRefresh}>
            Actualizar
          </Button>
          <Button as="a" href="/logout" variant="outline-secondary">
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col lg={8} xl={7}>
          <Accordion>
            <Accordion.Item eventKey="reset">
              <Accordion.Header>Reset de contraseña (ADMIN)</Accordion.Header>
              <Accordion.Body>
                <AdminResetPassword />
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>

      {DEBUG && (
        <Alert variant="dark" className="py-2">
          <small>
            <b>DEBUG</b> • from:{' '}
            <code>{filters.desde ?? 'null'}</code> • to:{' '}
            <code>{filters.hasta ?? 'null'}</code> • userId:{' '}
            <code>{filters.userId ?? 'null'}</code>
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
            />
            <datalist id="admin-users-datalist">
              {userOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </datalist>
          </InputGroup>
          <Form.Text>Selecciona del listado (UUID interno).</Form.Text>
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Desde</Form.Label>
          <Form.Control
            type="date"
            value={filters.desde ?? ''}
            onChange={handleDesde}
          />
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Hasta</Form.Label>
          <Form.Control
            type="date"
            value={filters.hasta ?? ''}
            onChange={handleHasta}
          />
        </Col>

        <Col md={1} lg={2} className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={clearFilters}>
            Limpiar
          </Button>
          <Button variant="outline-dark" onClick={verTodo}>
            Ver todo
          </Button>
        </Col>
      </Row>

      {error && (
        <p className="text-danger mt-3">
          Error al cargar minutas: {String(error.message || error)}
        </p>
      )}
      {isLoading && <p className="mt-3">Cargando…</p>}
      {!isLoading && !error && (items?.length ?? 0) === 0 && (
        <p className="mt-3">No hay minutas para mostrar.</p>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-4">
        {items?.map((m) => (
          <Col key={m.id}>
            <MinuteCard
              minuta={m}
              mode="read"
              evidenceReadOnly
              onView={onView}
              viewHref={`/minutas/${m.id}`}
            />
          </Col>
        ))}
      </Row>
    </Container>
  );
}
