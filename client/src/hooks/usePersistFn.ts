import { useRef } from "react";

/**
 * usePersistFn instead of useCallback to reduce cognitive load
 */
export function usePersistFn<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn
): (...args: TArgs) => TReturn {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const persistFn = useRef<((...args: TArgs) => TReturn) | null>(null);
  if (persistFn.current === null) {
    persistFn.current = (...args: TArgs): TReturn => fnRef.current(...args);
  }

  return persistFn.current;
}
