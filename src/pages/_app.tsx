// src/pages/_app.tsx
/**
 * App Root (Next.js - Pages Router)
 * -----------------------------------------------------------------------------
 * (…doc igual…)
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/globals.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { AuthProvider } from '@/contexts/AuthContext';
import PasswordChangeGate from '@/components/PasswordChangeGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

export default function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Bootstrap no publica .d.ts para su bundle JS; silenciamos TS7016.
    // @ts-expect-error - bootstrap bundle has no type declarations
    import('bootstrap/dist/js/bootstrap.bundle.min.js').catch(() => {
      // Si no usas componentes nativos de BS (tooltips/modals), no pasa nada.
    });
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PasswordChangeGate>
            <Component {...pageProps} />
          </PasswordChangeGate>
        </AuthProvider>
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </QueryClientProvider>
    </>
  );
}
