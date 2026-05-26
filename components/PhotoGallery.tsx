'use client';

import { useEffect, useRef, useState } from 'react';
import useGallery from '@/hooks/useGallery';
import useSettings from '@/hooks/useSettings';
import { makeCollage } from '@/lib/collage';

export default function PhotoGallery({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { urls, save, clear } = useGallery();
  const { settings } = useSettings();
  const slotCount = Math.max(1, Math.min(30, settings.slotCount));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  // null = not decided yet (avoids a flash of the sheet before the
  // session-storage check). 0..2 = welcome step. -1 = show sheet.
  const [welcomeStep, setWelcomeStep] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [cascadeReady, setCascadeReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const steps = [
    settings.welcomeStep1,
    settings.welcomeStep2,
    settings.welcomeStep3
      .replace(/alguns slots/g, `${slotCount} slots`)
      .replace(/alguns espaços/g, `${slotCount} slots`),
  ];
  const totalSteps = steps.length;

  // Welcome shows once per page load. Closing + reopening the gallery
  // within the same page lifecycle skips the intro, but a full reload
  // (or new tab) starts the 3 phrases over again.
  const welcomedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    setWelcomeStep(welcomedRef.current ? -1 : 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onPickSlot = (i: number) => {
    setActiveSlot(i);
    setTimeout(() => fileInputRef.current?.click(), 10);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeSlot !== null) {
      await save(activeSlot, file);
    }
    e.target.value = '';
    setActiveSlot(null);
  };

  const downloadBlobOrUrl = (urlOrBlob: string | Blob, name: string) => {
    const href = typeof urlOrBlob === 'string' ? urlOrBlob : URL.createObjectURL(urlOrBlob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof urlOrBlob !== 'string') {
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    }
  };

  const saveAll = async () => {
    const slice = urls.slice(0, slotCount);
    const hasAny = slice.some(Boolean);
    if (!hasAny) return;

    setSavedFlash(true);

    // Match collage backdrop to the active theme
    let themeColor = '#5a3a4a';
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (v) themeColor = v;
    } catch { /* ignore */ }

    // 1. Chunk slots by index (first 5, then next 5, etc.). Build a collage
    //    from each chunk's non-empty photos and download in order.
    for (let chunkStart = 0; chunkStart < slotCount; chunkStart += 5) {
      const chunkUrls = slice
        .slice(chunkStart, chunkStart + 5)
        .filter((u): u is string => Boolean(u));
      if (chunkUrls.length === 0) continue;
      const blob = await makeCollage(chunkUrls, themeColor);
      if (blob) {
        const collageIdx = Math.floor(chunkStart / 5) + 1;
        downloadBlobOrUrl(blob, `cupid-colagem-${collageIdx}.jpg`);
      }
    }

    // 2. Then every individual photo, in slot order
    slice.forEach((url, idx) => {
      if (!url) return;
      downloadBlobOrUrl(url, `cupid-momento-${idx + 1}.jpg`);
    });

    setTimeout(() => setSavedFlash(false), 2200);
  };

  const filled = urls.slice(0, slotCount).filter(Boolean).length;
  const inWelcome = open && welcomeStep !== null && welcomeStep >= 0 && welcomeStep < totalSteps;
  const sheetOpen = open && welcomeStep === -1;
  const currentStep = welcomeStep ?? 0;

  // Cascade slot entrance ~500ms after the sheet slides up
  useEffect(() => {
    if (!sheetOpen) {
      setCascadeReady(false);
      return;
    }
    const t = setTimeout(() => setCascadeReady(true), 500);
    return () => clearTimeout(t);
  }, [sheetOpen]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {/* 3-step centered welcome — just label + continuar over dark backdrop */}
      {inWelcome && (
        <div
          className="welcome-overlay"
          onClick={() => {
            if (currentStep < totalSteps - 1) setWelcomeStep(currentStep + 1);
            else {
              setWelcomeStep(-1);
              welcomedRef.current = true;
            }
          }}
        >
          <div className="welcome-stack" key={currentStep}>
            <div className="welcome-step-text">{steps[currentStep]}</div>
            <div className="welcome-continue">
              {currentStep < totalSteps - 1 ? 'continuar' : 'vamos!'}
            </div>
          </div>
        </div>
      )}

      {/* Gallery sheet — slides up after welcome */}
      <div
        className={`gallery-backdrop ${sheetOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!sheetOpen}
      />
      <div className={`gallery-sheet ${sheetOpen ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="gallery-top">
          <div className="gallery-handle" />
          <button type="button" className="gallery-close-x" onClick={onClose} aria-label="close gallery">
            ✕
          </button>
        </div>
        <div className="gallery-sub-line">{filled} / {slotCount} slots</div>
        <div className="gallery-grid">
          {Array.from({ length: slotCount }).map((_, i) => {
            const url = urls[i];
            return (
              <button
                key={i}
                type="button"
                className={`gallery-slot slot-${(i % 10) + 1} ${url ? 'filled' : 'empty'} ${cascadeReady ? 'cascade' : ''}`}
                style={{ ['--i' as any]: i }}
                onClick={() => onPickSlot(i)}
              >
                {url ? (
                  <>
                    <img src={url} alt={`photo ${i + 1}`} />
                    <span
                      className="gallery-slot-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('apagar essa foto?')) clear(i);
                      }}
                      role="button"
                      aria-label="remove photo"
                    >
                      ×
                    </span>
                  </>
                ) : (
                  <>
                    <span className="gallery-plus">+</span>
                    <span className="gallery-slot-num">{i + 1}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="gallery-footer">
          <button
            type="button"
            className={`gallery-save-all ${filled === 0 ? 'disabled' : ''}`}
            disabled={filled === 0}
            onClick={saveAll}
          >
            {savedFlash ? '✓ baixando colagens + fotos...' : 'salvar tudo'}
          </button>
          <div className="gallery-footer-hint">
            {filled === 0
              ? 'tire pelo menos uma foto pra salvar'
              : 'baixa cada foto pro seu celular'}
          </div>
        </div>
      </div>
    </>
  );
}
