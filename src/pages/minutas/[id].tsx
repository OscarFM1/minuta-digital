// src/pages/minutas/[id].tsx
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMinuteById } from '@/lib/minutes';
import MinuteForm from '@/components/MinuteForm';
import AttachmentsList from '@/components/AttachmentsList';
import type { Minute } from '@/types/minute';
import styles from '@/styles/Minutas.module.css';

export default function MinuteDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { data: minute, error, isLoading, mutate } = useSWR<Minute>(
    id ? ['minute', id] : null,
    () => getMinuteById(id)
  );

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionUserId(data.user?.id ?? null));
  }, []);

  const isOwner = !!(minute && sessionUserId && minute.user_id === sessionUserId);

  const goBack = () => {
    if (isOwner) router.push('/mis-minutas');
    else router.push('/minutas');
  };

  if (isLoading) return <p>Cargando…</p>;
  if (error) return <p>Error cargando la minuta: {String(error)}</p>;
  if (!minute) return <p>No se encontró la minuta.</p>;

  return (
    <div className={styles.detailWrapper}>
      <button onClick={goBack}>Volver</button>

      <h2>Minuta #{minute.id}</h2>
      <p><strong>Registrado por:</strong> {minute.created_by_name ?? minute.created_by_email ?? '—'}</p>

      {isOwner ? (
        <MinuteForm
          mode="edit"
          minuteId={minute.id}
          initialValues={{
            start_time: minute.start_time ?? '',
            end_time: minute.end_time ?? '',
            tarea_realizada: minute.tarea_realizada ?? '',
            novedades: minute.novedades ?? '',
          }}
          onSaved={(updated) => {
            // Refresca el cache de SWR con los datos actualizados
            mutate(updated, { revalidate: false });
          }}
          // Opcional: puedes desactivar autoguardado si no lo quieres
          enableAutosave={true}
          autosaveDelayMs={800}
        />
      ) : (
        <>
          <div className={styles.readRow}>
            <span><strong>Hora inicio:</strong> {minute.start_time || '—'}</span>
            <span><strong>Hora fin:</strong> {minute.end_time || '—'}</span>
          </div>
          <div className={styles.readBlock}>
            <p><strong>Tarea realizada</strong></p>
            <div className={styles.readBox}>{minute.tarea_realizada || '—'}</div>
          </div>
          <div className={styles.readBlock}>
            <p><strong>Novedades</strong></p>
            <div className={styles.readBox}>{minute.novedades || '—'}</div>
          </div>
        </>
      )}

      <h3>Evidencias</h3>
      <AttachmentsList minuteId={minute.id} />
    </div>
  );
}
