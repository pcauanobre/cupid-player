'use client';

import { useEffect, useRef, useState } from 'react';
import type { Track } from '@/lib/room';

// Auto-scroll tuning while dragging
const EDGE_PX = 56;       // distance from container edge that triggers scroll
const MAX_SPEED = 14;     // px / frame at the very edge

export default function QueueList({
  queue,
  index,
  canModify,
  onSkipTo,
  onRemove,
  onReorder,
}: {
  queue: Track[];
  index: number;
  canModify: boolean;
  onSkipTo?: (i: number) => void;
  onRemove?: (i: number) => void;
  onReorder?: (from: number, to: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);
  const lastClientYRef = useRef(0);
  const scrollSpeedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const stopScrollLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    scrollSpeedRef.current = 0;
  };

  const recomputeDragOver = (clientY: number) => {
    if (dragFrom === null) return;
    let target = dragFrom;
    let bestDist = Infinity;
    for (let idx = 0; idx < queue.length; idx++) {
      if (idx === dragFrom) continue;
      const el = itemRefs.current[idx];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const center = (r.top + r.bottom) / 2;
      const dist = Math.abs(clientY - center);
      if (dist < bestDist) {
        bestDist = dist;
        target = idx;
      }
    }
    setDragOver(target);
  };

  const updateEdgeScroll = (clientY: number) => {
    const container = listRef.current;
    if (!container) {
      scrollSpeedRef.current = 0;
      return;
    }
    const rect = container.getBoundingClientRect();
    let speed = 0;
    if (clientY < rect.top + EDGE_PX) {
      const proximity = (rect.top + EDGE_PX - clientY) / EDGE_PX;
      speed = -MAX_SPEED * Math.min(1, Math.max(0, proximity));
    } else if (clientY > rect.bottom - EDGE_PX) {
      const proximity = (clientY - (rect.bottom - EDGE_PX)) / EDGE_PX;
      speed = MAX_SPEED * Math.min(1, Math.max(0, proximity));
    }
    scrollSpeedRef.current = speed;

    if (speed !== 0 && rafRef.current === null) {
      const tick = () => {
        const c = listRef.current;
        if (!c || scrollSpeedRef.current === 0) {
          rafRef.current = null;
          return;
        }
        c.scrollTop += scrollSpeedRef.current;
        // Re-evaluate drop target after scroll because items moved
        recomputeDragOver(lastClientYRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  // Cleanup on unmount
  useEffect(() => () => stopScrollLoop(), []);

  if (queue.length === 0) {
    return <div className="settings-label">queue is empty</div>;
  }

  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    if (!onReorder) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragFrom(i);
    setDragOver(i);
    startYRef.current = e.clientY;
    lastClientYRef.current = e.clientY;
    setDragY(0);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragFrom === null) return;
    lastClientYRef.current = e.clientY;
    const delta = e.clientY - startYRef.current;
    setDragY(delta);
    recomputeDragOver(e.clientY);
    updateEdgeScroll(e.clientY);
  };

  const onHandlePointerUp = () => {
    stopScrollLoop();
    if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
      onReorder?.(dragFrom, dragOver);
    }
    setDragFrom(null);
    setDragOver(null);
    setDragY(0);
  };

  return (
    <>
      <div className="settings-label">queue · {queue.length}</div>
      <div className="queue-list" ref={listRef}>
        {queue.map((t, i) => {
          const isCurrent = i === index;
          const isDragging = dragFrom === i;
          const isDropTarget = dragOver === i && dragFrom !== null && dragFrom !== i;
          const itemStyle: React.CSSProperties = isDragging
            ? { transform: `translateY(${dragY}px)`, zIndex: 100, opacity: 0.85 }
            : {};
          return (
            <div
              key={`${t.videoId}-${i}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={`queue-item ${isCurrent ? 'current' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
              style={itemStyle}
            >
              {canModify && onReorder && (
                <button
                  type="button"
                  className="queue-drag"
                  onPointerDown={(e) => onHandlePointerDown(e, i)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  aria-label="drag to reorder"
                  title="drag to reorder"
                >
                  ⋮⋮
                </button>
              )}
              <button
                type="button"
                className="queue-item-tap"
                onClick={() => { if (!isDragging) onSkipTo?.(i); }}
                disabled={!onSkipTo || isCurrent}
                title={t.title}
              >
                <span className="queue-item-mark">{isCurrent ? '▶' : i + 1}</span>
                <span className="queue-item-text">
                  <span className="queue-item-title">{t.title}</span>
                  {t.artist && <span className="queue-item-artist">{t.artist}</span>}
                </span>
              </button>
              {canModify && onRemove && (
                <button
                  className="queue-item-btn"
                  onClick={() => onRemove(i)}
                  aria-label="remove from queue"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
