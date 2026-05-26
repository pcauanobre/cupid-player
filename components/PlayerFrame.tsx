'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useTheme from '@/hooks/useTheme';
import useSettings from '@/hooks/useSettings';
import MarqueeText from './MarqueeText';
import type { PlayerController, Role } from '@/lib/player-types';

function formatTime(seconds: number) {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerFrame({
  player,
  role,
  settingsSlot,
  onOpenPlaylist,
  onLeave,
  playMode = 'normal',
  onCyclePlayMode,
  onTitleTap,
  showSettings: controlledShowSettings,
  onShowSettingsChange,
}: {
  player: PlayerController;
  role: Role;
  settingsSlot?: ReactNode;
  onOpenPlaylist?: () => void;
  onLeave?: () => void;
  playMode?: 'normal' | 'shuffle' | 'repeat';
  onCyclePlayMode?: () => void;
  onTitleTap?: () => void;
  showSettings?: boolean;
  onShowSettingsChange?: (open: boolean) => void;
}) {
  const { theme, toggleTheme, assets } = useTheme();
  const { settings } = useSettings();
  const {
    track,
    isPlaying,
    progress,
    duration,
    currentTime,
    togglePlay,
    next,
    prev,
    seek,
    volume,
    setVolume,
    muted,
    toggleMute,
  } = player;

  const [recordFrame, setRecordFrame] = useState(0);
  const [needleFrame, setNeedleFrame] = useState(0);
  const [needleChangeFrame, setNeedleChangeFrame] = useState(0);
  const [isPink, setIsPink] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [needleLifted, setNeedleLifted] = useState(false);
  const [starHovered, setStarHovered] = useState(false);
  const [internalShowSettings, setInternalShowSettings] = useState(false);
  const showSettings = controlledShowSettings ?? internalShowSettings;
  const setShowSettings = (v: boolean) => {
    if (onShowSettingsChange) onShowSettingsChange(v);
    else setInternalShowSettings(v);
  };
  const [dragging, setDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [volumeHovered, setVolumeHovered] = useState(false);
  const [volumeDragging, setVolumeDragging] = useState(false);
  const seekRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const prevTrackRef = useRef<string | null>(null);

  // Sync isPink to active theme on theme change
  useEffect(() => {
    setIsPink(theme === 'pink');
  }, [theme]);

  const currentFrames = isPink ? assets.recordFramesA : assets.recordFramesB;
  const incomingFrames = isPink ? assets.recordFramesB : assets.recordFramesA;

  // Spin animation while playing
  useEffect(() => {
    if (!isPlaying || swapping) return;
    const interval = setInterval(() => {
      setRecordFrame((f) => (f + 1) % currentFrames.length);
      setNeedleFrame((f) => (f + 1) % assets.needlePlayFrames.length);
    }, 400);
    return () => clearInterval(interval);
  }, [isPlaying, swapping, currentFrames.length, assets.needlePlayFrames.length]);

  // Detect track change → needle lift + record swap
  useEffect(() => {
    if (prevTrackRef.current === track.title) return;
    const wasInitialOrPlaceholder = prevTrackRef.current === null || prevTrackRef.current === 'No track';
    prevTrackRef.current = track.title;
    if (track.title === 'No track') return;
    if (wasInitialOrPlaceholder) return;
    if (needleLifted) return;

    setNeedleLifted(true);
    setNeedleChangeFrame(0);
    setTimeout(() => setNeedleChangeFrame(1), 200);
    setTimeout(() => setSwapping(true), 400);
    setTimeout(() => {
      setIsPink((p) => !p);
      setRecordFrame(0);
      setSwapping(false);
    }, 1000);
    setTimeout(() => {
      setNeedleChangeFrame(0);
      setNeedleLifted(false);
      setNeedleFrame(0);
    }, 1100);
  }, [track.title, needleLifted]);

  // Progress drag — only previews while dragging, commits on release
  const hoverProgressRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!seekRef.current) return;
      const rect = seekRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      hoverProgressRef.current = pct;
      setHoverProgress(pct);
    };
    const onUp = () => {
      const final = hoverProgressRef.current;
      setDragging(false);
      setStarHovered(false);
      setHoverProgress(null);
      hoverProgressRef.current = null;
      if (final !== null) seek(final);
    };
    window.addEventListener('mousemove', onMove as EventListener);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as EventListener);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove as EventListener);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as EventListener);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, seek]);

  // Volume drag (admin only)
  useEffect(() => {
    if (!volumeDragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!volumeBarRef.current) return;
      const rect = volumeBarRef.current.getBoundingClientRect();
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
      const pct = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      setVolume(pct);
    };
    const onUp = () => {
      setVolumeDragging(false);
      setVolumeHovered(false);
    };
    window.addEventListener('mousemove', onMove as EventListener);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as EventListener);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove as EventListener);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as EventListener);
      window.removeEventListener('touchend', onUp);
    };
  }, [volumeDragging, setVolume]);

  const starUrl = starHovered ? '/star_selected.png' : '/star.png';
  const showVolume = true;

  return (
    <div className={`player ${theme === 'blue' ? 'theme-blue' : ''}`}>
      <img src={assets.frame} className="layer" alt="" draggable={false} />

      <div
        className={`window-title ${onTitleTap ? 'window-title-tap' : ''}`}
        onClick={onTitleTap}
      >
        {settings.title}
      </div>

      {/* Record player */}
      <img src={assets.recordPlayer} className="record-player" alt="" draggable={false} />
      <img
        src={currentFrames[recordFrame]}
        className={`record-player ${swapping ? 'record-slide-out' : ''}`}
        alt=""
        draggable={false}
      />
      {swapping && (
        <img
          src={incomingFrames[0]}
          className="record-player record-slide-in"
          alt=""
          draggable={false}
        />
      )}
      <img
        src={needleLifted ? assets.needleChangeFrames[needleChangeFrame] : assets.needlePlayFrames[needleFrame]}
        className="record-player"
        alt=""
        draggable={false}
      />

      <img src={assets.frameNoBg} className="layer frame-overlay" alt="" draggable={false} />
      <img src={assets.plant} className="layer layer-ui" alt="" draggable={false} />

      {/* Progress bar */}
      <img src={assets.progressBar} className="layer layer-ui" alt="" draggable={false} />
      <img
        src="/progress_bar_stars.png"
        className="layer layer-ui"
        alt=""
        draggable={false}
        style={{
          clipPath: `inset(0 ${(1 - (131 + (hoverProgress ?? progress) * 226 + 10) / 512) * 100}% 0 0)`,
        }}
      />
      <img
        src={starUrl}
        className={`layer layer-ui star-indicator ${starHovered ? 'star-hovered' : ''}`}
        alt=""
        draggable={false}
        style={{
          transform: `translateX(calc(-3 / 306 * 100vw + ${(hoverProgress ?? progress) * (226 / 512) * 171.9}vw))`,
        }}
      />

      {/* Control button visuals */}
      <img src={assets.backwardsButton} className="layer layer-ui" alt="" draggable={false} />
      <img src={isPlaying ? assets.pauseButton : assets.playButton} className="layer layer-ui" alt="" draggable={false} />
      <img src={assets.forwardsButton} className="layer layer-ui" alt="" draggable={false} />

      {showVolume && (
        <img
          src={muted ? assets.muteButton : assets.volumeButton}
          className="layer layer-ui"
          alt=""
          draggable={false}
          style={{ opacity: 0.8 }}
        />
      )}


      {/* Settings/leave icons */}
      <img src={assets.settings} className="layer layer-ui settings-layer" alt="" draggable={false} />
      <img src={assets.exitButton} className="layer layer-ui" alt="" draggable={false} />

      {/* Album mask + art */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="album-mask" clipPathUnits="objectBoundingBox">
            <rect x="0.07317" y="0" width="0.85366" height="1" />
            <rect x="0.04878" y="0.02439" width="0.90244" height="0.95122" />
            <rect x="0.02439" y="0.04878" width="0.95122" height="0.90244" />
            <rect x="0" y="0.07317" width="1" height="0.85366" />
          </clipPath>
        </defs>
      </svg>

      {(track.art || track.videoId) && (
        <div className="album-mask">
          <img
            src={track.art || `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`}
            className="album-art"
            alt=""
            draggable={false}
          />
        </div>
      )}

      <img src={assets.albumFrame} className="layer album-frame-layer" alt="" draggable={false} />

      <div className="now-playing">
        <div className="track-info">
          <div className="now-playing-label">now playing...</div>
          <MarqueeText className="track-title" text={track.title} />
          <div className="track-artist">by {track.artist}</div>
        </div>
      </div>

      <div className="time-display">
        <span className="time-current">{formatTime(currentTime)}</span>
        <span className="time-remaining">{formatTime(duration - currentTime)}</span>
      </div>

      {/* Click targets */}
      <div
        className="progress-seek"
        ref={seekRef}
        onMouseEnter={() => setStarHovered(true)}
        onMouseLeave={() => { if (!dragging) setStarHovered(false); }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          hoverProgressRef.current = pct;
          setHoverProgress(pct);
          // commit only on release
        }}
        onTouchStart={(e) => {
          setDragging(true);
          setStarHovered(true);
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
          hoverProgressRef.current = pct;
          setHoverProgress(pct);
          // commit only on release
        }}
      />

      <div className="btn btn-prev" onClick={prev} />
      <div className="btn btn-play" onClick={togglePlay} />
      <div className="btn btn-next" onClick={next} />

      {showVolume && (volumeHovered || volumeDragging) && (
        <>
          <img src={assets.volumeBarLow} className="layer layer-ui volume-bar-layer" alt="" draggable={false} />
          <img
            src={assets.volumeBarHigh}
            className="layer layer-ui volume-bar-layer"
            alt=""
            draggable={false}
            style={{
              clipPath: `inset(${((1 - (muted ? 0 : volume)) * (420 - 338) / 512 + 338 / 512) * 100}% 0 0 0)`,
            }}
          />
        </>
      )}

      {showVolume && (
        <div
          className={`volume-hover-zone ${(volumeHovered || volumeDragging) ? 'expanded' : ''}`}
          onMouseLeave={() => { if (!volumeDragging) setVolumeHovered(false); }}
        >
          <div
            className="btn-volume-icon"
            onClick={toggleMute}
            onMouseEnter={() => setVolumeHovered(true)}
            onTouchStart={() => setVolumeHovered((v) => !v)}
          />
          {(volumeHovered || volumeDragging) && (
            <div
              className="volume-bar-area"
              ref={volumeBarRef}
              onMouseDown={(e) => {
                e.preventDefault();
                setVolumeDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                setVolume(pct);
              }}
              onTouchStart={(e) => {
                setVolumeDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, 1 - (e.touches[0].clientY - rect.top) / rect.height));
                setVolume(pct);
              }}
            />
          )}
        </div>
      )}


      {onLeave && <div className="btn btn-leave" onClick={onLeave} title="leave" />}
      <div className="btn btn-settings" onClick={() => setShowSettings(!showSettings)} title="settings" />

      {showSettings && typeof document !== 'undefined' && createPortal(
        <div className={`settings-panel ${theme === 'blue' ? 'theme-blue' : ''}`} onClick={() => setShowSettings(false)}>
          <div className="settings-panel-inner" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <div className="settings-title">settings</div>
              <button
                type="button"
                className="settings-close"
                onClick={() => setShowSettings(false)}
                aria-label="close settings"
              >
                ×
              </button>
            </div>
            <div className="settings-section">
              <div className="settings-label">theme</div>
              <div className="settings-theme-row">
                <button
                  className={`settings-theme-btn ${theme === 'pink' ? 'active' : ''}`}
                  onClick={() => { if (theme !== 'pink') toggleTheme(); }}
                >
                  pink
                </button>
                <button
                  className={`settings-theme-btn ${theme === 'blue' ? 'active' : ''}`}
                  onClick={() => { if (theme !== 'blue') toggleTheme(); }}
                >
                  blue
                </button>
              </div>
            </div>
            {settingsSlot}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
