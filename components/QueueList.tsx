'use client';

import { useRef, useState } from 'react';
import type { Track } from '@/lib/room';

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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);

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
    setDragY(0);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragFrom === null) return;
    const delta = e.clientY - startYRef.current;
    setDragY(delta);

    // Determine which row the pointer is over. We compare against the
    // CENTER of each non-dragged item so movement past the midpoint
    // commits the swap, even when dragging long distances.
    let target = dragFrom;
    let bestDist = Infinity;
    for (let idx = 0; idx < queue.length; idx++) {
      if (idx === dragFrom) continue; // skip the row being dragged
      const el = itemRefs.current[idx];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const center = (r.top + r.bottom) / 2;
      const dist = Math.abs(e.clientY - center);
      if (dist < bestDist) {
        bestDist = dist;
        target = idx;
      }
    }
    setDragOver(target);
  };

  const onHandlePointerUp = () => {
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
      <div className="queue-list">
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
