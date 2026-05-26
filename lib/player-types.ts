import type { Track } from './room';

export type PlayMode = 'normal' | 'shuffle' | 'repeat';

export type PlayerView = {
  track: Track;
  trackIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  loading?: boolean;
};

export type PlayerActions = {
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (fraction: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
};

export type PlayerController = PlayerView & PlayerActions;

export type Role = 'admin' | 'user';
