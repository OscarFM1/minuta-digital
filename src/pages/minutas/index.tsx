// PR: ui-only marker (admin minutas)
// PR: ui-only marker (admin minutas) — safe to remove after merge
// src/pages/minutas/index.tsx
/**
 * /minutas — Vista GLOBAL para ADMIN / SUPER_ADMIN (solo lectura)
 * -----------------------------------------------------------------------------
 * - Gating por rol con <RequireRole allow={['admin','super_admin']}>.
 * - Filtros: usuario (datalist por RPC) + rango de fechas.
 * - Realtime: refresca al cambiar 'minute'.
 * - Listado con MinuteCard en mode="read" (evidencias en RO).
 *
 * Backend:
 * - admin_minutes_page(p_from_date, p_to_date, p_user_id, p_tz, p_limit, p_offset)
 *   => { items jsonb[], total_rows bigint, total_seconds bigint }
 * - admin_minute_user_options(p_from_date, p_to_date, p_tz, p_limit)
 *   => opciones para el datalist (user_id, created_by_name, created_by_email, minutes_count)
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Container, Row, Col, Button, Form, InputGroup, Accordion,
} from 'react-bootstrap';
import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';
import MinuteCard, { MinuteCardData } from '@/components/MinuteCard';
import styles from '@/styles/Minutas.module.css';
import { useFirstLoginGate } from '@/hooks/useFirstLoginGate';
import AdminResetPassword from '@/components/AdminResetPassword';
import RequireRole from '@/components/RequireRole';

type Filters = { desde?: string; hasta?: string; userId?: string | null; userQuery?: string };
type UserOption = { value: string; label: string };

type RpcAdminItem = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  started_at: string | null;
  ended_at: string | null;
  description: string | null;
  tarea_realizada: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  folio: string | null;
  folio_serial: number | null;
  attachments_count: number;
  duration_seconds: number;
  user_id: string | null;
};

/* =============================================================================
 * Fetchers
 * ========================================================================== */

/**
 * ✅ Admin (GLOBAL): lista paginada via RPC + mapeo a MinuteCardData.
 * IMPORTANTE: la RPC devuelve { items, total_rows, total_seconds }.
 */
async function fetchMinutes(filters: Filters): Promise<MinuteCardData[]> {
  const p_from_date = filters.desde ?? null; // 'YYYY-MM-DD' o null
  const p_to_date   = filters.hasta ?? null;
  const p_user_id   = filters.userId ?? null; // si no tienes el UUID, pasa null
  const p_tz        = 'America/Bogota';

  const { data, error } = await supabase.rpc('admin_minutes_page', {
    p_from_date,
    p_to_date,
    p_user_id,
    p_tz,
    p_limit: 200,
    p_offset: 0,
  });

  if (error) {
    // Log útil para backend
    // eslint-disable-next-line no-console
    console.error('[admin_minutes_page] error', error);
    throw new Error(error.message);
  }

  const items = (data?.items ?? []) as RpcAdminItem[];

  return items.map((r) => ({
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

/**
 * ✅ Opciones de usuario para el datalist (sin tocar la tabla minute directamente).
 * Usa la RPC admin_minute_user_options para evitar ambigüedades/ordenamientos.
 */
async function fetchUserOptions(from?: string, to?: string): Promise<UserOption[]> {
  const p_from_date = from ?? null;
  const p_to_date   = to ?? null;
  const p_tz        = 'America/Bogota';

  const { data, error } = await supabase.rpc('admin_minute_user_options', {
    p_from_date,
    p_to_date,
    p_tz,
    p_limit: 100,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[admin_minute_user_options] error', error);
    throw new Error(error.message);
  }

  const out: UserOption[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string; created_by_name: string | null; created_by_email: string | null }>) {
    const email = r.created_by_email?.trim();
    const name  = r.created_by_name?.trim();
    const label = email && name ? `${name} <${email}>` : (email || name || '');
    const value = r.user_id; // value será el UUID; más estable para filtrar
    if (!value || !label) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

/* =============================================================================
 * Page Wrapper
 * ========================================================================== */

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

/* =============================================================================
 * AdminMinutasView
 * ========================================================================== */

function AdminMinutasView() {
  useFirstLoginGate();
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>({});
  const [forceKey, setForceKey] = useState<number>(0);

  /**
   * SWR: key serializable (fechas + userId + forceKey).
   * Nota: enviamos userId (UUID) — si el usuario escribe texto libre, guárdalo en userQuery.
   */
  const { data: items, error, isLoading, mutate } = useSWR<MinuteCardData[]>(
    ['admin-minutes', filters.desde ?? '', filters.hasta ?? '', filters.userId ?? '', forceKey],
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
    ['admin-minute-users', filters.desde ?? '', filters.hasta ?? ''],
    () => fetchUserOptions(filters.desde, filters.hasta),
    { revalidateOnFocus: false }
  );

  // Realtime: refrescamos la lista ante cualquier cambio en 'minute'
  useEffect(() => {
    const ch = supabase
      .channel('minute-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'minute' }, () => { mutate(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mutate]);

  // Navegación a detalle
  const onView = (id: string) => { void router.push(`/minutas/${id}`); };

  // Refresh manual (además de SWR)
  const handleHardRefresh = () => { setForceKey(Date.now()); void mutate(); };

  // Handlers de filtros
  const handleUser = (e: React.ChangeEvent<HTMLInputElement>) => {
    // value es el user_id (UUID) porque usamos <option value={uuid} />
    const value = e.target.value || '';
    setFilters((f) => ({ ...f, userId: value || null }));
  };
  const handleDesde = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, desde: e.target.value || undefined }));
  const handleHasta = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, hasta: e.target.value || undefined }));

  const clearFilters = () => setFilters({});

  return (
    <Container fluid className={styles.bg}>
      <Row className="justify-content-between align-items-center mt-5 mb-3">
        <Col><h1 className={styles.title}>Minutas (Admin)</h1></Col>
        <Col xs="auto" className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => router.push('/minutas/estadisticas')}>
            Ir a estadísticas
          </Button>
          <Button variant="outline-secondary" onClick={handleHardRefresh}>
            Actualizar
          </Button>
          {/* 🔒 Navegación DURA: página /logout cierra sesión y redirige */}
          <Button as="a" href="/logout" variant="outline-secondary">
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col lg={8} xl={7}>
          <Accordion defaultActiveKey={undefined} alwaysOpen={false}>
            <Accordion.Item eventKey="reset">
              <Accordion.Header>Reset de contraseña (ADMIN)</Accordion.Header>
              <Accordion.Body>
                <AdminResetPassword />
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>

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
          <Form.Text>Selecciona una opción del listado (usa el UUID internamente).</Form.Text>
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Desde</Form.Label>
          <Form.Control type="date" value={filters.desde ?? ''} onChange={handleDesde} />
        </Col>

        <Col md={3} lg={3}>
          <Form.Label>Hasta</Form.Label>
          <Form.Control type="date" value={filters.hasta ?? ''} onChange={handleHasta} />
        </Col>

        <Col md={1} lg={2} className="d-flex">
          <Button variant="outline-secondary" className="ms-auto" onClick={clearFilters}>
            Limpiar
          </Button>
        </Col>
      </Row>

      {error && <p className="text-danger mt-3">Error al cargar minutas: {String(error.message || error)}</p>}
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
