export type Track = {
  videoId: string;
  title: string;
  artist: string;
  art: string;
};

export type RoomState = {
  adminUserId: string | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  updatedAt: number;
  version: number;
};

export const EMPTY_ROOM: RoomState = {
  adminUserId: null,
  queue: [],
  index: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  updatedAt: 0,
  version: 0,
};

export const PLACEHOLDER_TRACK: Track = {
  videoId: '',
  title: 'No track',
  artist: '—',
  art: '',
};

export const ROOM_KEY = 'room:default';
export const QUEUE_KEY = 'room:default:queue';
export const ROOM_CHANNEL = 'presence-room-default';
export const ADMIN_CHANNEL = 'private-admin-default';

export type ServerEvent =
  | { type: 'state:update'; state: RoomState }
  | { type: 'cmd:skip' }
  | { type: 'cmd:prev' }
  | { type: 'cmd:playpause'; isPlaying?: boolean }
  | { type: 'cmd:seek'; fraction: number }
  | { type: 'cmd:reorder'; from: number; to: number }
  | { type: 'cmd:add'; track: Track }
  | { type: 'cmd:remove'; index: number }
  | { type: 'cmd:loadQueue'; queue: Track[]; index?: number };

export type ClientCommand =
  | { type: 'skip' }
  | { type: 'prev' }
  | { type: 'playpause'; isPlaying?: boolean }
  | { type: 'seek'; fraction: number }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'add'; track: Track }
  | { type: 'remove'; index: number }
  | { type: 'loadQueue'; queue: Track[]; index?: number }
  | { type: 'tick'; currentTime: number; duration: number; isPlaying: boolean }
  | { type: 'trackChanged'; index: number };
