'use client';

import { useCallback, useEffect, useState } from 'react';

const DB_NAME = 'cupid-gallery';
const STORE = 'slots';
const SLOTS = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAll(db: IDBDatabase): Promise<(Blob | null)[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out: (Blob | null)[] = new Array(SLOTS).fill(null);
    let pending = SLOTS;
    for (let i = 0; i < SLOTS; i++) {
      const req = store.get(i);
      req.onsuccess = () => {
        out[i] = (req.result as Blob | undefined) ?? null;
        if (--pending === 0) resolve(out);
      };
      req.onerror = () => reject(req.error);
    }
  });
}

async function writeSlot(db: IDBDatabase, slot: number, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteSlot(db: IDBDatabase, slot: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllSlots(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const GALLERY_SLOT_COUNT = SLOTS;

// ── Module-level shared state ─────────────────────────────
let current: (string | null)[] = new Array(SLOTS).fill(null);
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<(u: (string | null)[]) => void>();

function notify() {
  listeners.forEach((fn) => fn(current));
}

function setSlotUrl(slot: number, url: string | null) {
  const old = current[slot];
  if (old) URL.revokeObjectURL(old);
  const next = current.slice();
  next[slot] = url;
  current = next;
  notify();
}

async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof window === 'undefined') return;
    // Ask the browser to keep IndexedDB data even under storage pressure
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch { /* ignore */ }
    try {
      const db = await openDb();
      const blobs = await readAll(db);
      current = blobs.map((b) => (b ? URL.createObjectURL(b) : null));
      loaded = true;
      notify();
    } catch (err) {
      console.error('gallery load failed:', err);
      loaded = true;
    }
  })();
  return loadPromise;
}

export default function useGallery() {
  const [urls, setUrls] = useState<(string | null)[]>(current);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    const onChange = (u: (string | null)[]) => {
      setUrls(u);
      setReady(true);
    };
    listeners.add(onChange);
    ensureLoaded().then(() => setReady(true));
    // sync initial state in case another instance already loaded
    setUrls(current);
    if (loaded) setReady(true);
    return () => { listeners.delete(onChange); };
  }, []);

  const save = useCallback(async (slot: number, file: Blob) => {
    if (slot < 0 || slot >= SLOTS) return;
    const db = await openDb();
    await writeSlot(db, slot, file);
    setSlotUrl(slot, URL.createObjectURL(file));
  }, []);

  const clear = useCallback(async (slot: number) => {
    if (slot < 0 || slot >= SLOTS) return;
    const db = await openDb();
    await deleteSlot(db, slot);
    setSlotUrl(slot, null);
  }, []);

  const clearAll = useCallback(async () => {
    const db = await openDb();
    await clearAllSlots(db);
    current.forEach((u) => u && URL.revokeObjectURL(u));
    current = new Array(SLOTS).fill(null);
    notify();
  }, []);

  return { urls, save, clear, clearAll, ready };
}
