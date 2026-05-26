'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerFrame from '@/components/PlayerFrame';
import QueueList from '@/components/QueueList';
import HeartBeat from '@/components/HeartBeat';
import PhotoGallery from '@/components/PhotoGallery';
import DebugPanel from '@/components/DebugPanel';
import useSettings from '@/hooks/useSettings';
import useTapSequence from '@/hooks/useTapSequence';
import useRoomState from '@/hooks/useRoomState';
import useRoomCommands from '@/hooks/useRoomCommands';
import { PLACEHOLDER_TRACK, type Track } from '@/lib/room';
import type { PlayerController } from '@/lib/player-types';

function useSearch(send: ReturnType<typeof useRoomCommands>['send']) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      setResults(data.tracks ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const add = async (t: Track) => {
    await send({ type: 'add', track: t });
    setResults([]);
    setQ('');
  };

  return { q, setQ, results, loading, err, run, add };
}

type Optimistic = {
  isPlaying?: boolean;
  index?: number;
  currentTime?: number;
};

export default function UserPage() {
  const { state, ready } = useRoomState();
  const { send } = useRoomCommands('user');
  const search = useSearch(send);
  const [showGallery, setShowGallery] = useState(false);
  const { settings } = useSettings();
  const router = useRouter();
  const waitingForAdmin = ready && state.queue.length === 0;

  const goAdmin = useCallback(() => router.push('/admin'), [router]);
  const titleTap = useTapSequence(goAdmin);

  // Optimistic overlay so the UI flips instantly on click,
  // before the round-trip to the server confirms the change.
  const [optimistic, setOptimistic] = useState<Optimistic>({});
  const optimisticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setOpt = useCallback((patch: Optimistic) => {
    setOptimistic((prev) => ({ ...prev, ...patch }));
    if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    // Safety net: if the server never confirms, clear after 4s
    optimisticTimer.current = setTimeout(() => setOptimistic({}), 4000);
  }, []);

  // Once the server-confirmed state matches the optimistic guess, drop it
  useEffect(() => {
    if (!optimistic || Object.keys(optimistic).length === 0) return;
    const matchPlay = optimistic.isPlaying === undefined || optimistic.isPlaying === state.isPlaying;
    const matchIndex = optimistic.index === undefined || optimistic.index === state.index;
    if (matchPlay && matchIndex) {
      setOptimistic({});
      if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    }
  }, [state.isPlaying, state.index, optimistic]);

  const effIndex = optimistic.index ?? state.index;
  const effIsPlaying = optimistic.isPlaying ?? state.isPlaying;
  const effCurrentTime = optimistic.currentTime ?? state.currentTime;

  const player: PlayerController = useMemo(() => {
    const track = state.queue[effIndex] ?? PLACEHOLDER_TRACK;
    const progress = state.duration > 0 ? Math.max(0, Math.min(1, effCurrentTime / state.duration)) : 0;
    return {
      track,
      trackIndex: effIndex,
      isPlaying: effIsPlaying,
      progress,
      duration: state.duration,
      currentTime: effCurrentTime,
      volume: 1,
      muted: false,
      togglePlay: () => {
        const next = !effIsPlaying;
        setOpt({ isPlaying: next });
        send({ type: 'playpause', isPlaying: next });
      },
      next: () => {
        if (state.queue.length === 0) return;
        const nextIdx = (effIndex + 1) % state.queue.length;
        setOpt({ index: nextIdx, currentTime: 0 });
        send({ type: 'skip' });
      },
      prev: () => {
        if (state.queue.length === 0) return;
        const nextIdx = (effIndex - 1 + state.queue.length) % state.queue.length;
        setOpt({ index: nextIdx, currentTime: 0 });
        send({ type: 'prev' });
      },
      seek: (f) => {
        if (state.duration > 0) setOpt({ currentTime: f * state.duration });
        send({ type: 'seek', fraction: f });
      },
      setVolume: () => { /* user volume affects nothing */ },
      toggleMute: () => { /* no-op for user */ },
    };
  }, [state, effIndex, effIsPlaying, effCurrentTime, send, setOpt]);

  return (
    <>
    {waitingForAdmin && (
      <div className="waiting-overlay">
        <div className="waiting-stack">
          <div className="waiting-text">
            aguarde o {settings.adminName} colocar a playlist :)<span className="waiting-dots" aria-hidden="true" />
          </div>
        </div>
      </div>
    )}
    <PlayerFrame
      player={player}
      role="user"
      onTitleTap={titleTap}
      settingsSlot={
        <>
          <div className="settings-section">
            <div className="settings-label">add a track</div>
            <input
              className="settings-input"
              placeholder="search youtube..."
              value={search.q}
              onChange={(e) => search.setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search.run(); }}
            />
            <button
              className="settings-theme-btn"
              disabled={search.loading || !search.q.trim()}
              onClick={search.run}
            >
              {search.loading ? 'searching...' : 'search'}
            </button>
            {search.err && <div className="settings-error">{search.err}</div>}
            {search.results.length > 0 && (
              <div className="settings-playlist-list">
                {search.results.map((t) => (
                  <button
                    key={t.videoId}
                    className="settings-playlist-item"
                    onClick={() => search.add(t)}
                    title={`${t.title} — ${t.artist}`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="settings-section">
            <QueueList
              queue={state.queue}
              index={effIndex}
              canModify
              onSkipTo={(i) => {
                setOpt({ index: i, currentTime: 0 });
                send({ type: 'trackChanged', index: i });
              }}
              onRemove={(i) => send({ type: 'remove', index: i })}
              onReorder={(from, to) => send({ type: 'reorder', from, to })}
            />
          </div>
        </>
      }
    />
    <HeartBeat onClick={() => setShowGallery(true)} />
    <PhotoGallery open={showGallery} onClose={() => setShowGallery(false)} />
    <DebugPanel />
    </>
  );
}
