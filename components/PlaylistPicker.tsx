'use client';

import { useEffect, useState } from 'react';
import type { Playlist } from '@/lib/youtube';
import type { Track } from '@/lib/room';

export default function PlaylistPicker({
  onLoad,
  onClose,
}: {
  onLoad: (tracks: Track[]) => void;
  onClose: () => void;
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/youtube/playlists', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      setPlaylists(data.playlists ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const pick = async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/youtube/playlist/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      const tracks: Track[] = data.tracks ?? [];
      if (tracks.length === 0) throw new Error('playlist is empty');
      onLoad(tracks);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <>
      <div className="settings-label">your playlists</div>
      <div className="settings-playlist-list">
        {loading ? (
          <div className="settings-label">loading...</div>
        ) : playlists.length === 0 ? (
          <div className="settings-label">no playlists found</div>
        ) : (
          playlists.map((p) => (
            <button
              key={p.id}
              className={`settings-playlist-item ${loadingId ? 'disabled' : ''}`}
              onClick={() => pick(p.id)}
              disabled={Boolean(loadingId)}
              title={p.name}
            >
              {p.name}
            </button>
          ))
        )}
      </div>
      <div className="settings-theme-row">
        <button className="settings-theme-btn" disabled={loading} onClick={refresh}>refresh</button>
        <button className="settings-theme-btn" onClick={onClose}>close</button>
      </div>
      {error && <div className="settings-error">{error}</div>}
    </>
  );
}
