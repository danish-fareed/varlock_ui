import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that provides a ResizeObserver for a given element ref.
 * Calls the callback whenever the observed element resizes.
 */
export function useResizeObserver(
  callback: (entry: ResizeObserverEntry) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        callbackRef.current(entry);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return ref;
}

/**
 * Hook that debounces a callback by the given delay.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debouncedFn = useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedFn;
}
