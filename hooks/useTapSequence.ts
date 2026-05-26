'use client';

import { useCallback, useRef } from 'react';

/**
 * Returns a tap handler that fires `onTrigger` once `count` taps land within
 * `windowMs`. Uses a ref so React StrictMode double-invocations don't fire
 * the side effect twice.
 */
export default function useTapSequence(onTrigger: () => void, count = 5, windowMs = 2000) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < windowMs);
    if (taps.current.length >= count) {
      taps.current = [];
      onTrigger();
    }
  }, [onTrigger, count, windowMs]);
}
