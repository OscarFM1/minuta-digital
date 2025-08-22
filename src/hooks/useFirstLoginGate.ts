// src/hooks/useFirstLoginGate.ts
/**
 * Refuerza el redirect de "primer login" en cliente.
 * - Respeta query `?go=` para volver a la intención inicial.
 * - Evita bucles si ya estamos en /cambiar-password.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabaseClient';

export function useFirstLoginGate() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      const firstLogin = data.session?.user?.user_metadata?.first_login === true;
      if (!mounted) return;

      if (firstLogin && !router.pathname.startsWith('/cambiar-password')) {
        const go = router.asPath || '/mis-minutas';
        router.replace(`/cambiar-password?go=${encodeURIComponent(go)}`);
      }
    };

    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [router]);
}
