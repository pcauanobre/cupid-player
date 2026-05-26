'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type Theme = 'pink' | 'blue';

export type ThemeAssets = {
  frame: string;
  frameNoBg: string;
  plant: string;
  recordPlayer: string;
  albumFrame: string;
  backwardsButton: string;
  pauseButton: string;
  playButton: string;
  forwardsButton: string;
  exitButton: string;
  minimizerButton: string;
  windowButton: string;
  favicon: string;
  progressBar: string;
  settings: string;
  volumeButton: string;
  muteButton: string;
  shuffleButton: string;
  repeatButton: string;
  volumeBarHigh: string;
  volumeBarLow: string;
  recordFramesA: string[];
  recordFramesB: string[];
  needlePlayFrames: string[];
  needleChangeFrames: string[];
};

const SHARED_RECORD_FRAMES = {
  recordFramesA: [
    '/animations/record-pink/frame-1.png',
    '/animations/record-pink/frame-2.png',
    '/animations/record-pink/frame-3.png',
    '/animations/record-pink/frame-4.png',
  ],
  recordFramesB: [
    '/animations/record-blue/frame-1.png',
    '/animations/record-blue/frame-2.png',
    '/animations/record-blue/frame-3.png',
    '/animations/record-blue/frame-4.png',
  ],
};

const THEME_ASSETS: Record<Theme, ThemeAssets> = {
  pink: {
    frame: '/pink/frame.png',
    frameNoBg: '/pink/frame_no_background.png',
    plant: '/pink/plant.png',
    recordPlayer: '/pink/record_player.png',
    albumFrame: '/pink/album_frame.png',
    backwardsButton: '/pink/backwards_button.png',
    pauseButton: '/pink/pause_button.png',
    playButton: '/pink/play_button.png',
    forwardsButton: '/pink/forwards_button.png',
    exitButton: '/pink/exit_button.png',
    minimizerButton: '/pink/minimizer_button.png',
    windowButton: '/pink/window_button.png',
    favicon: '/pink/favicon.png',
    progressBar: '/pink/progress_bar.png',
    settings: '/pink/settings.png',
    volumeButton: '/pink/volume_button.png',
    muteButton: '/pink/mute_button.png',
    shuffleButton: '/pink/shuffle_button.png',
    repeatButton: '/pink/repeat_button.png',
    volumeBarHigh: '/pink/volume_bar_high.png',
    volumeBarLow: '/pink/volume_bar_low.png',
    ...SHARED_RECORD_FRAMES,
    needlePlayFrames: [
      '/animations/pink/needle-playing/frame-1.png',
      '/animations/pink/needle-playing/frame-2.png',
      '/animations/pink/needle-playing/frame-3.png',
    ],
    needleChangeFrames: [
      '/animations/pink/needle-change/frame-1.png',
      '/animations/pink/needle-change/frame-2.png',
      '/animations/pink/needle-change/frame-3.png',
    ],
  },
  blue: {
    frame: '/blue/frame.png',
    frameNoBg: '/blue/frame_no_background.png',
    plant: '/blue/plant.png',
    recordPlayer: '/blue/record_player.png',
    albumFrame: '/blue/album_frame.png',
    backwardsButton: '/blue/backwards_button.png',
    pauseButton: '/blue/pause_button.png',
    playButton: '/blue/play_button.png',
    forwardsButton: '/blue/forwards_button.png',
    exitButton: '/blue/exit_button.png',
    minimizerButton: '/blue/minimizer_button.png',
    windowButton: '/blue/window_button.png',
    favicon: '/blue/favicon.png',
    progressBar: '/blue/progress_bar.png',
    settings: '/blue/settings.png',
    volumeButton: '/blue/volume_button.png',
    muteButton: '/blue/mute_button.png',
    shuffleButton: '/blue/shuffle_button.png',
    repeatButton: '/blue/repeat_button.png',
    volumeBarHigh: '/blue/volume_bar_high.png',
    volumeBarLow: '/blue/volume_bar_low.png',
    ...SHARED_RECORD_FRAMES,
    needlePlayFrames: [
      '/animations/blue/needle-playing/frame-1.png',
      '/animations/blue/needle-playing/frame-2.png',
      '/animations/blue/needle-playing/frame-3.png',
    ],
    needleChangeFrames: [
      '/animations/blue/needle-change/frame-1.png',
      '/animations/blue/needle-change/frame-2.png',
      '/animations/blue/needle-change/frame-3.png',
    ],
  },
};

const STORAGE_KEY = 'cupid-player-theme';

export default function useTheme() {
  // SSR: start with 'pink' to keep server/client markup identical, then
  // sync from localStorage on mount.
  const [theme, setTheme] = useState<Theme>('pink');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'pink' || stored === 'blue') setTheme(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'pink' ? 'blue' : 'pink';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const assets = useMemo(() => THEME_ASSETS[theme], [theme]);

  return { theme, toggleTheme, assets };
}
