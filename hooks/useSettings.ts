'use client';

import { useCallback, useEffect, useState } from 'react';

export type Settings = {
  title: string;
  slotCount: number;
  welcomeStep1: string;
  welcomeStep2: string;
  welcomeStep3: string;
  welcomed: boolean;
  showHeart: boolean;
  heartLabel: string;
  adminName: string;
};

const DEFAULTS: Settings = {
  title: "Andreia's Vinyl",
  slotCount: 10,
  welcomeStep1: 'oi meu bem 💕',
  welcomeStep2: 'sua missão hoje é guardar o nosso momento',
  welcomeStep3: 'tire as melhores fotos, você tem alguns slots, vamos lá?',
  welcomed: false,
  showHeart: true,
  heartLabel: 'click me',
  adminName: 'Pedro',
};

const KEY = 'cupid-settings';

function load(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

const listeners = new Set<(s: Settings) => void>();
let current: Settings = DEFAULTS;
let initialised = false;

function ensureInit() {
  if (initialised || typeof window === 'undefined') return;
  current = load();
  initialised = true;
}

export default function useSettings() {
  ensureInit();
  const [settings, setLocal] = useState<Settings>(current);

  useEffect(() => {
    const onChange = (s: Settings) => setLocal(s);
    listeners.add(onChange);
    // sync once on mount in case another tab updated localStorage
    onChange(current);
    return () => { listeners.delete(onChange); };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    current = { ...current, ...patch };
    save(current);
    listeners.forEach((fn) => fn(current));
  }, []);

  const reset = useCallback(() => {
    current = { ...DEFAULTS };
    save(current);
    listeners.forEach((fn) => fn(current));
  }, []);

  return { settings, update, reset };
}

export const SETTINGS_DEFAULTS = DEFAULTS;
