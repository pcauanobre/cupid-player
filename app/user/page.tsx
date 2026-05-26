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

function useSearch(
  send: ReturnType<typeof useRoomCommands>['send'],
  onAdded?: (newIndex: number) => void,
) {
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
    const next = await send({ type: 'add', track: t });
    setResults([]);
    setQ('');
    // Server already inserted the track right after the current one and
    // moved state.index there — just hand that index back to the page so
    // it can flip the optimistic UI and close settings.
    if (next && onAdded) onAdded(next.index);
  };

  return { q, setQ, results, loading, err, run, add };
}

type Optimistic = {
  isPlaying?: boolean;
  index?: number;
  currentTime?: number;
  volume?: number;
};

export default function UserPage() {
  const { state, ready, refresh } = useRoomState();
  const { send } = useRoomCommands('user');
  const [showGallery, setShowGallery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { settings } = useSettings();
  const router = useRouter();

  // Admin presence: we only consider the admin "offline" if their
  // cached YouTube token disappeared (sign-out or hard refresh failure).
  // Heartbeats are noisy — being logged in but not currently on /admin
  // shouldn't trigger the overlay.
  const [adminSignedIn, setAdminSignedIn] = useState<boolean | null>(null);
  const checkAdminStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-status', { cache: 'no-store' });
      const data = await res.json();
      setAdminSignedIn(Boolean(data?.signedIn));
    } catch {
      // network blip — don't flip to "offline" just because of that
    }
  }, []);
  useEffect(() => {
    checkAdminStatus();
    const t = setInterval(checkAdminStatus, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [checkAdminStatus]);

  // Safety net: re-pull /api/state every minute if our local state has
  // gone stale, in case a Pusher delivery slipped.
  useEffect(() => {
    const t = setInterval(() => {
      if (state.updatedAt > 0 && Date.now() - state.updatedAt > 60_000) {
        refresh();
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [state.updatedAt, refresh]);

  // Whenever the tab regains focus or visibility, fetch fresh state so
  // anything the admin did while we were backgrounded shows up.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [refresh]);

  const waitingForAdmin = ready && adminSignedIn === false;

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

  // Once the server-confirmed state matches the optimistic guess, drop it.
  // For currentTime we need a tolerance because admin's iframe tick won't
  // report back the exact float we sent — typically a few hundred ms off
  // depending on the YT player.
  useEffect(() => {
    if (!optimistic || Object.keys(optimistic).length === 0) return;
    const matchPlay = optimistic.isPlaying === undefined || optimistic.isPlaying === state.isPlaying;
    const matchIndex = optimistic.index === undefined || optimistic.index === state.index;
    const matchTime = optimistic.currentTime === undefined
      || Math.abs(state.currentTime - optimistic.currentTime) < 2;
    const matchVol = optimistic.volume === undefined
      || Math.abs(state.volume - optimistic.volume) < 0.02;
    if (matchPlay && matchIndex && matchTime && matchVol) {
      setOptimistic({});
      if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    }
  }, [state.isPlaying, state.index, state.currentTime, state.volume, optimistic]);

  const effIndex = optimistic.index ?? state.index;
  const effIsPlaying = optimistic.isPlaying ?? state.isPlaying;
  const effCurrentTime = optimistic.currentTime ?? state.currentTime;
  const effVolume = optimistic.volume ?? state.volume ?? 0.8;

  // Debounce track navigation. Rapid next/prev/skip-to clicks only
  // dispatch ONE absolute `trackChanged` command, with the final index,
  // 320 ms after the user stops clicking — keeps the admin iframe from
  // chasing 5 sequential loadVideoById calls.
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTargetRef = useRef<number | null>(null);
  const scheduleNav = useCallback((idx: number) => {
    navTargetRef.current = idx;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      const target = navTargetRef.current;
      navTimerRef.current = null;
      navTargetRef.current = null;
      if (target !== null) send({ type: 'trackChanged', index: target });
    }, 320);
  }, [send]);

  // Adding a track from search auto-plays it (server already moved the
  // queue index) and closes the settings panel. No need for scheduleNav.
  const search = useSearch(send, (newIndex) => {
    setOpt({ index: newIndex, currentTime: 0 });
    setShowSettings(false);
  });

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
      volume: effVolume,
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
        scheduleNav(nextIdx);
      },
      prev: () => {
        if (state.queue.length === 0) return;
        const nextIdx = (effIndex - 1 + state.queue.length) % state.queue.length;
        setOpt({ index: nextIdx, currentTime: 0 });
        scheduleNav(nextIdx);
      },
      seek: (f) => {
        if (state.duration > 0) setOpt({ currentTime: f * state.duration });
        send({ type: 'seek', fraction: f });
      },
      setVolume: (v) => {
        const next = Math.max(0, Math.min(1, v));
        setOpt({ volume: next });
        send({ type: 'setVolume', volume: next });
      },
      toggleMute: () => {
        // Mute toggles volume to 0 or back to the previous level
        const next = effVolume > 0.01 ? 0 : 0.8;
        setOpt({ volume: next });
        send({ type: 'setVolume', volume: next });
      },
    };
  }, [state, effIndex, effIsPlaying, effCurrentTime, effVolume, send, setOpt]);

  return (
    <>
    {waitingForAdmin && (
      <div className="waiting-overlay">
        <div className="waiting-stack">
          <div className="waiting-text">
            oii, espera o {settings.adminName} adicionar a playlist!<span className="waiting-dots" aria-hidden="true" />
          </div>
        </div>
      </div>
    )}
    <PlayerFrame
      player={player}
      role="user"
      onTitleTap={titleTap}
      showSettings={showSettings}
      onShowSettingsChange={setShowSettings}
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
                scheduleNav(i);
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
