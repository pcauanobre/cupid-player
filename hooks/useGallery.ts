'use client';

import { useCallback, useEffect, useState } from 'react';
import { blobToDataUrl, compressImage, dataUrlToBlob } from '@/lib/image';
import { getPusherClient } from '@/lib/pusher-client';
import { ROOM_CHANNEL } from '@/lib/room';

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

async function idbRead(db: IDBDatabase): Promise<(Blob | null)[]> {
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

async function idbWrite(db: IDBDatabase, slot: number, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(db: IDBDatabase, slot: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(db: IDBDatabase): Promise<void> {
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

function applySlot(slot: number, url: string | null) {
  const old = current[slot];
  if (old && old !== url) URL.revokeObjectURL(old);
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
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch { /* ignore */ }

    // 1. Hydrate from IndexedDB first for instant rendering
    let idbBlobs: (Blob | null)[] = new Array(SLOTS).fill(null);
    try {
      const db = await openDb();
      idbBlobs = await idbRead(db);
      current = idbBlobs.map((b) => (b ? URL.createObjectURL(b) : null));
      notify();
    } catch (err) {
      console.error('gallery idb load failed:', err);
    }

    // 2. Pull canonical state from the server. Server-stored dataURLs win.
    try {
      const res = await fetch('/api/gallery', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const slots: (string | null)[] = data?.slots ?? [];
        const db = await openDb().catch(() => null);
        for (let i = 0; i < SLOTS; i++) {
          const remote = slots[i] ?? null;
          if (remote) {
            const blob = dataUrlToBlob(remote);
            const objUrl = URL.createObjectURL(blob);
            // Update in-memory + persist to IDB so it survives offline
            applySlot(i, objUrl);
            if (db) idbWrite(db, i, blob).catch(() => undefined);
          } else if (idbBlobs[i]) {
            // KV says slot is empty but IDB has something — trust KV, drop local
            applySlot(i, null);
            if (db) idbDelete(db, i).catch(() => undefined);
          }
        }
      }
    } catch (err) {
      console.error('gallery remote load failed:', err);
    }

    loaded = true;
    notify();
  })();
  return loadPromise;
}

// ── Pusher subscription ──────────────────────────────────
let pusherWired = false;
function ensurePusher() {
  if (pusherWired || typeof window === 'undefined') return;
  pusherWired = true;
  try {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(ROOM_CHANNEL);
    channel.bind('gallery:update', async (data: { slot: number; dataUrl: string | null }) => {
      if (typeof data?.slot !== 'number') return;
      if (data.dataUrl) {
        try {
          const blob = dataUrlToBlob(data.dataUrl);
          const objUrl = URL.createObjectURL(blob);
          applySlot(data.slot, objUrl);
          const db = await openDb();
          await idbWrite(db, data.slot, blob);
        } catch { /* ignore */ }
      } else {
        applySlot(data.slot, null);
        try {
          const db = await openDb();
          await idbDelete(db, data.slot);
        } catch { /* ignore */ }
      }
    });
  } catch (err) {
    console.error('gallery pusher subscribe failed:', err);
  }
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
    ensurePusher();
    setUrls(current);
    if (loaded) setReady(true);
    return () => { listeners.delete(onChange); };
  }, []);

  const save = useCallback(async (slot: number, file: Blob) => {
    if (slot < 0 || slot >= SLOTS) return;
    // Compress before storing locally + uploading so we stay under the
    // 1MB request cap of Upstash REST.
    let blob = file;
    try {
      const isAlreadyJpeg = file.type === 'image/jpeg' && file.size < 600_000;
      if (!isAlreadyJpeg) blob = await compressImage(file);
    } catch { /* fall back to original */ }

    // 1. Local: IDB + in-memory URL so the UI updates immediately
    try {
      const db = await openDb();
      await idbWrite(db, slot, blob);
    } catch { /* ignore */ }
    applySlot(slot, URL.createObjectURL(blob));

    // 2. Remote: upload base64 dataUrl to Upstash
    try {
      const dataUrl = await blobToDataUrl(blob);
      await fetch(`/api/gallery/${slot}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
    } catch (err) {
      console.error('gallery upload failed:', err);
    }
  }, []);

  const clear = useCallback(async (slot: number) => {
    if (slot < 0 || slot >= SLOTS) return;
    applySlot(slot, null);
    try {
      const db = await openDb();
      await idbDelete(db, slot);
    } catch { /* ignore */ }
    try {
      await fetch(`/api/gallery/${slot}`, { method: 'DELETE' });
    } catch (err) {
      console.error('gallery delete failed:', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      const db = await openDb();
      await idbClear(db);
    } catch { /* ignore */ }
    current.forEach((u) => u && URL.revokeObjectURL(u));
    current = new Array(SLOTS).fill(null);
    notify();
    // delete each KV key in parallel
    await Promise.all(
      Array.from({ length: SLOTS }, (_, i) =>
        fetch(`/api/gallery/${i}`, { method: 'DELETE' }).catch(() => undefined),
      ),
    );
  }, []);

  return { urls, save, clear, clearAll, ready };
}
