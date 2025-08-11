// src/hooks/useDebouncedCallback.ts
import { useRef, useCallback } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fn(...args);
      }, delayMs);
    },
    [fn, delayMs]
  );

  // Opción para cancelar si el componente desmonta o lo necesitas.
  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  return { debounced, cancel };
}
