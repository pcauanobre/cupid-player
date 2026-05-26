'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import PlayerFrame from '@/components/PlayerFrame';
import PlaylistPicker from '@/components/PlaylistPicker';
import QueueList from '@/components/QueueList';
import HeartBeat from '@/components/HeartBeat';
import PhotoGallery from '@/components/PhotoGallery';
import DebugPanel from '@/components/DebugPanel';
import useRoomState from '@/hooks/useRoomState';
import useRoomCommands from '@/hooks/useRoomCommands';
import useYouTubeIframePlayer from '@/hooks/useYouTubeIframePlayer';
import useDebugMode from '@/hooks/useDebugMode';
import useTransition from '@/hooks/useTransition';
import type { Track } from '@/lib/room';

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
    if (next && onAdded) onAdded(next.index);
  };

  return { q, setQ, results, loading, err, run, add };
}

export default function AdminPage() {
  const { state, ready } = useRoomState();
  const { send } = useRoomCommands('admin');
  const [showPicker, setShowPicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const search = useSearch(send, () => {
    setShowSettings(false);
    setShowPicker(false);
  });
  const { handleTap: titleTap } = useDebugMode();
  const exitConfirmTransition = useTransition(showExitConfirm);

  const player = useYouTubeIframePlayer({
    state,
    containerId: 'cupid-yt-player',
    sendCommand: send,
  });

  // Wake Lock — keep screen on while admin plays
  useEffect(() => {
    let wakeLock: any = null;
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {
        // ignore
      }
    };
    if (player.isPlaying) acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible' && player.isPlaying) acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { wakeLock?.release?.(); } catch { /* ignore */ }
    };
  }, [player.isPlaying]);

  const onLoadPlaylist = async (tracks: Track[]) => {
    await send({ type: 'loadQueue', queue: tracks, index: 0 });
  };

  return (
    <>
      <div
        id="cupid-yt-player"
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          width: 1,
          height: 1,
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      <PlayerFrame
        player={player}
        role="admin"
        onTitleTap={titleTap}
        showSettings={showSettings}
        onShowSettingsChange={setShowSettings}
        onOpenPlaylist={() => setShowPicker((v) => !v)}
        onLeave={() => setShowExitConfirm(true)}
        settingsSlot={
          <>
            {showPicker ? (
              <div className="settings-section">
                <PlaylistPicker onLoad={onLoadPlaylist} onClose={() => setShowPicker(false)} />
              </div>
            ) : (
              <>
                <div className="settings-section">
                  <div className="settings-label">playlist</div>
                  <button className="settings-theme-btn" onClick={() => setShowPicker(true)}>
                    load playlist
                  </button>
                </div>
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
                    onSkipTo={(i) => { send({ type: 'trackChanged', index: i }); setShowSettings(false); }}
                    onRemove={(i) => send({ type: 'remove', index: i })}
                    onReorder={(from, to) => send({ type: 'reorder', from, to })}
                  />
                </div>
                <div className="settings-section">
                  <button className="settings-theme-btn danger" onClick={() => signOut({ callbackUrl: '/' })}>
                    sign out
                  </button>
                </div>
              </>
            )}
          </>
        }
      />
      <HeartBeat onClick={() => setShowGallery(true)} />
      <PhotoGallery open={showGallery} onClose={() => setShowGallery(false)} />
      <DebugPanel />
      {exitConfirmTransition.shouldRender && (
        <div
          className={`exit-modal-backdrop phase-${exitConfirmTransition.phase}`}
          onClick={() => setShowExitConfirm(false)}
        >
          <div className="exit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exit-modal-title">sair do cupid player?</div>
            <div className="exit-modal-row">
              <button className="exit-modal-btn" onClick={() => setShowExitConfirm(false)}>
                cancelar
              </button>
              <button className="exit-modal-btn primary" onClick={() => signOut({ callbackUrl: '/' })}>
                sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
