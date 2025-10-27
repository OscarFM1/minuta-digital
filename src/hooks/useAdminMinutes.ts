/**
 * src/hooks/useAdminMinutes.ts
 * -----------------------------------------------------------------------------
 * Hook v5 de TanStack Query para cargar minutas del Admin.
 * - Usa placeholderData: keepPreviousData (reemplaza keepPreviousData: true de v4).
 * - Claves del query 100% serializables (ISO strings / números), para evitar warnings.
 * - staleTime para evitar refetch agresivo; gcTime para liberar cache.
 * - retry bajo (2) para DX en dev.
 *
 * Requiere:
 *   npm i @tanstack/react-query
 *   En _app.tsx: <QueryClientProvider client={queryClient}>...</QueryClientProvider>
 *
 * Recuerda subir cualquier cambio a Git.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchAdminMinutes, AdminMinutesResponse } from '@/lib/admin/fetchAdminMinutes';

export function useAdminMinutes(params: {
  from: Date;
  to: Date;
  userId?: string | null;
  tz?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    from,
    to,
    userId = null,
    tz = 'America/Bogota',
    limit = 50,
    offset = 0,
  } = params;

  // Clave serializable: fechas en YYYY-MM-DD, userId o 'all'
  const fromKey = from.toISOString().slice(0, 10);
  const toKey   = to.toISOString().slice(0, 10);
  const userKey = userId ?? 'all';

  return useQuery<AdminMinutesResponse>({
    queryKey: ['admin-minutes', fromKey, toKey, userKey, tz, limit, offset],
    queryFn: () => fetchAdminMinutes({ from, to, userId, tz, limit, offset }),

    // v5: reemplazo de keepPreviousData: true
    placeholderData: keepPreviousData,

    // Sugeridos para 1 persona: menos ruido, suficiente frescura
    staleTime: 60_000,            // 1 min los datos se consideran frescos
    gcTime: 5 * 60_000,           // 5 min en cache antes de garbage collection
    refetchOnWindowFocus: false,  // evita refetch al volver a la pestaña
    retry: 2,                     // reintentar hasta 2 veces
  });
}
