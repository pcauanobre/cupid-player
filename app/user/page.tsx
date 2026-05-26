'use client';

import { useCallback, useMemo, useState } from 'react';
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

export default function UserPage() {
  const { state, ready } = useRoomState();
  const { send } = useRoomCommands();
  const search = useSearch(send);
  const [showGallery, setShowGallery] = useState(false);
  const { settings } = useSettings();
  const router = useRouter();
  const waitingForAdmin = ready && state.queue.length === 0;

  const goAdmin = useCallback(() => router.push('/admin'), [router]);
  const titleTap = useTapSequence(goAdmin);

  const player: PlayerController = useMemo(() => {
    const track = state.queue[state.index] ?? PLACEHOLDER_TRACK;
    const progress = state.duration > 0 ? Math.max(0, Math.min(1, state.currentTime / state.duration)) : 0;
    return {
      track,
      trackIndex: state.index,
      isPlaying: state.isPlaying,
      progress,
      duration: state.duration,
      currentTime: state.currentTime,
      volume: 1,
      muted: false,
      togglePlay: () => { send({ type: 'playpause' }); },
      next: () => { send({ type: 'skip' }); },
      prev: () => { send({ type: 'prev' }); },
      seek: (f) => { send({ type: 'seek', fraction: f }); },
      setVolume: () => { /* user volume affects nothing */ },
      toggleMute: () => { /* no-op for user */ },
    };
  }, [state, send]);

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
              index={state.index}
              canModify
              onSkipTo={(i) => send({ type: 'trackChanged', index: i })}
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
