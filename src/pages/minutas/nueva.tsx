// src/pages/minutas/nueva.tsx
import { useRouter } from 'next/router';
import MinuteForm from '@/components/MinuteForm';
import { emptyMinuteFormValues } from '@/types/minute';
import styles from '@/styles/Minutas.module.css';

export default function NuevaMinutaPage() {
  const router = useRouter();

  return (
    <div className={styles.detailWrapper}>
      <button onClick={() => router.push('/mis-minutas')}>Volver</button>
      <h2>Nueva minuta</h2>

      <MinuteForm
        mode="create"
        initialValues={emptyMinuteFormValues}
        requireAttachmentOnCreate={true}
        onSaved={(created) => {
          // Redirige al detalle
          router.push(`/minutas/${created.id}`);
        }}
      />
    </div>
  );
}
