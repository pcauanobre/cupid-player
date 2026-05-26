'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_CHANNEL, PLACEHOLDER_TRACK, type RoomState } from '@/lib/room';
import type { PlayerController } from '@/lib/player-types';
import { getPusherClient } from '@/lib/pusher-client';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export default function useYouTubeIframePlayer({
  state,
  containerId,
  sendCommand,
}: {
  state: RoomState;
  containerId: string;
  sendCommand: (cmd: any) => Promise<unknown>;
}): PlayerController {
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Boot the player exactly once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadYouTubeIframeApi();
      if (cancelled) return;
      const initialTrack = state.queue[state.index];
      const playerOpts: any = {
        height: '0',
        width: '0',
        playerVars: {
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            setReady(true);
            try {
              setVolumeState(p.getVolume() / 100);
              setMuted(p.isMuted());
            } catch {
              // ignore
            }
            // Loosen the iframe's permission policy so Chrome/Android lets
            // it keep producing audio when the tab is backgrounded.
            try {
              const iframe = p.getIframe?.() as HTMLIFrameElement | undefined;
              if (iframe) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                iframe.setAttribute('playsinline', '1');
              }
            } catch {
              // ignore
            }
            currentVideoIdRef.current = initialTrack?.videoId ?? null;
          },
          onStateChange: (e: any) => {
            const YT = window.YT;
            if (!YT) return;
            const s = e.data;
            if (s === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              sendCommand({ type: 'playpause', isPlaying: true });
            } else if (s === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              sendCommand({ type: 'playpause', isPlaying: false });
            } else if (s === YT.PlayerState.ENDED) {
              setIsPlaying(false);
              const cur = stateRef.current;
              if (cur.queue.length > 0) {
                const nextIdx = (cur.index + 1) % cur.queue.length;
                sendCommand({ type: 'trackChanged', index: nextIdx });
              }
            }
          },
        },
      };
      if (initialTrack?.videoId) playerOpts.videoId = initialTrack.videoId;
      const p = new window.YT.Player(containerId, playerOpts);
      playerRef.current = p;
    })();
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  // Track current video id in state — when room.index changes, load the new video.
  useEffect(() => {
    if (!ready) return;
    const target = state.queue[state.index];
    const videoId = target?.videoId ?? null;
    if (videoId === currentVideoIdRef.current) return;
    currentVideoIdRef.current = videoId;
    try {
      if (videoId) {
        playerRef.current.loadVideoById(videoId);
      } else {
        playerRef.current.stopVideo?.();
      }
    } catch {
      // ignore
    }
  }, [ready, state.index, state.queue]);

  // Media Session API — show lock-screen controls and keep audio alive
  // while the tab is backgrounded (where the platform allows it).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const track = state.queue[state.index];
    if (!track) {
      try { (navigator as any).mediaSession.metadata = null; } catch { /* ignore */ }
      return;
    }
    try {
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
        title: track.title || 'cupid',
        artist: track.artist || 'cupid player',
        album: "Andreia's Vinyl",
        artwork: [
          { src: `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
          { src: `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          { src: `https://i.ytimg.com/vi/${track.videoId}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' },
        ],
      });
    } catch { /* ignore */ }
  }, [state.index, state.queue]);

  // Wire OS media controls (play/pause/next/prev) to the YT player
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms: any = (navigator as any).mediaSession;
    const handlers: Array<[string, MediaSessionActionHandler]> = [
      ['play', () => { playerRef.current?.playVideo?.(); }],
      ['pause', () => { playerRef.current?.pauseVideo?.(); }],
      ['previoustrack', () => { prev(); }],
      ['nexttrack', () => { next(); }],
      ['seekbackward', (d: any) => {
        const t = (playerRef.current?.getCurrentTime?.() ?? 0) - (d?.seekOffset ?? 10);
        playerRef.current?.seekTo?.(Math.max(0, t), true);
      }],
      ['seekforward', (d: any) => {
        const t = (playerRef.current?.getCurrentTime?.() ?? 0) + (d?.seekOffset ?? 10);
        playerRef.current?.seekTo?.(t, true);
      }],
    ];
    for (const [name, fn] of handlers) {
      try { ms.setActionHandler(name, fn); } catch { /* unsupported */ }
    }
    return () => {
      for (const [name] of handlers) {
        try { ms.setActionHandler(name, null); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Auto-resume on visibility regain. Mobile Chrome often pauses the
  // iframe when the tab is hidden; on coming back we ensure playback
  // resumes if the room state still says we're playing.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const cur = stateRef.current;
      if (!cur.isPlaying) return;
      try {
        const p = playerRef.current;
        const ytState = p?.getPlayerState?.();
        const PLAYING = (window as any).YT?.PlayerState?.PLAYING;
        if (ytState !== PLAYING) p?.playVideo?.();
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', onVis);
    // Also runs if the browser un-freezes a backgrounded tab
    window.addEventListener('pageshow', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);

  // Mirror playback state to the OS so controls reflect the real state
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      (navigator as any).mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch { /* ignore */ }
  }, [isPlaying]);

  // Tick: poll currentTime/duration from YT and push to server every 2s.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime() ?? 0;
        const d = p.getDuration() ?? 0;
        setCurrentTime(t);
        setDuration(d);
      } catch {
        // ignore
      }
    };
    const intLocal = setInterval(tick, 500);
    const intServer = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime() ?? 0;
        const d = p.getDuration() ?? 0;
        const playing = p.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
        sendCommand({ type: 'tick', currentTime: t, duration: d, isPlaying: playing });
      } catch {
        // ignore
      }
    }, 2000);
    return () => {
      clearInterval(intLocal);
      clearInterval(intServer);
    };
  }, [ready, sendCommand]);

  // Subscribe to admin private channel to react to user commands.
  useEffect(() => {
    if (!ready) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(ADMIN_CHANNEL);

    const handlers: Record<string, (data: any) => void> = {
      'cmd:skip': () => {
        const cur = stateRef.current;
        if (cur.queue.length > 0) {
          const nextIdx = (cur.index + 1) % cur.queue.length;
          sendCommand({ type: 'trackChanged', index: nextIdx });
        }
      },
      'cmd:prev': () => {
        const cur = stateRef.current;
        if (cur.queue.length > 0) {
          const nextIdx = (cur.index - 1 + cur.queue.length) % cur.queue.length;
          sendCommand({ type: 'trackChanged', index: nextIdx });
        }
      },
      'cmd:playpause': (data) => {
        try {
          const p = playerRef.current;
          const wantPlaying = data?.isPlaying ?? !(p?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING);
          if (wantPlaying) p?.playVideo?.();
          else p?.pauseVideo?.();
        } catch {
          // ignore
        }
      },
      'cmd:seek': (data) => {
        try {
          const p = playerRef.current;
          const dur = p?.getDuration?.() ?? 0;
          const t = Math.max(0, Math.min(1, data?.fraction ?? 0)) * dur;
          p?.seekTo?.(t, true);
        } catch {
          // ignore
        }
      },
    };

    for (const [evt, fn] of Object.entries(handlers)) channel.bind(evt, fn);
    return () => {
      for (const [evt, fn] of Object.entries(handlers)) channel.unbind(evt, fn);
      pusher.unsubscribe(ADMIN_CHANNEL);
    };
  }, [ready, sendCommand]);

  const togglePlay = useCallback(() => {
    try {
      const p = playerRef.current;
      const playing = p?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
      if (playing) p?.pauseVideo?.();
      else p?.playVideo?.();
    } catch {
      // ignore
    }
  }, []);

  const next = useCallback(() => {
    const cur = stateRef.current;
    if (cur.queue.length === 0) return;
    const nextIdx = (cur.index + 1) % cur.queue.length;
    sendCommand({ type: 'trackChanged', index: nextIdx });
  }, [sendCommand]);

  const prev = useCallback(() => {
    const cur = stateRef.current;
    if (cur.queue.length === 0) return;
    const nextIdx = (cur.index - 1 + cur.queue.length) % cur.queue.length;
    sendCommand({ type: 'trackChanged', index: nextIdx });
  }, [sendCommand]);

  const seek = useCallback((fraction: number) => {
    try {
      const p = playerRef.current;
      const dur = p?.getDuration?.() ?? 0;
      const t = Math.max(0, Math.min(1, fraction)) * dur;
      p?.seekTo?.(t, true);
      setCurrentTime(t);
    } catch {
      // ignore
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const pct = Math.max(0, Math.min(1, v));
    try {
      playerRef.current?.setVolume?.(Math.round(pct * 100));
      if (pct > 0 && muted) {
        playerRef.current?.unMute?.();
        setMuted(false);
      }
    } catch {
      // ignore
    }
    setVolumeState(pct);
  }, [muted]);

  const toggleMute = useCallback(() => {
    try {
      const p = playerRef.current;
      if (p?.isMuted?.()) {
        p.unMute();
        setMuted(false);
      } else {
        p?.mute?.();
        setMuted(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const track = state.queue[state.index] ?? PLACEHOLDER_TRACK;
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  return {
    track,
    trackIndex: state.index,
    isPlaying,
    progress,
    duration,
    currentTime,
    volume,
    muted,
    loading: !ready,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
  };
}
