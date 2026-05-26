'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'cupid-debug';
const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 2000;

const listeners = new Set<(b: boolean) => void>();
let current = false;
let initialised = false;

function ensureInit() {
  if (initialised || typeof window === 'undefined') return;
  try {
    current = localStorage.getItem(KEY) === '1';
  } catch {
    // ignore
  }
  initialised = true;
}

function setStored(v: boolean) {
  current = v;
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  // Defer so listeners don't fire during another component's render.
  queueMicrotask(() => {
    listeners.forEach((fn) => fn(v));
  });
}

export default function useDebugMode() {
  ensureInit();
  const [enabled, setEnabled] = useState(current);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    const onChange = (v: boolean) => setEnabled(v);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  const handleTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current, now].filter((t) => now - t < TAP_WINDOW_MS);
    if (tapsRef.current.length >= TAPS_REQUIRED) {
      tapsRef.current = [];
      setStored(!current);
    }
  }, []);

  const setManually = useCallback((v: boolean) => {
    setStored(v);
  }, []);

  return { enabled, handleTap, setEnabled: setManually };
}
