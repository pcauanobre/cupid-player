import { kv } from './kv';
import { EMPTY_ROOM, QUEUE_KEY, ROOM_KEY, type ClientCommand, type RoomState, type Track } from './room';

type RoomMeta = Omit<RoomState, 'queue'>;

const EMPTY_META: RoomMeta = {
  adminUserId: null,
  index: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  updatedAt: 0,
  version: 0,
};

export async function getRoom(): Promise<RoomState> {
  const [meta, queue] = await Promise.all([
    kv.get<RoomMeta>(ROOM_KEY),
    kv.get<Track[]>(QUEUE_KEY),
  ]);
  // Merge over EMPTY_META so fields added later (e.g. volume) get
  // a default when reading old records that were written before the
  // field existed.
  return {
    ...EMPTY_META,
    ...(meta ?? {}),
    queue: queue ?? [],
  };
}

async function setMeta(meta: RoomMeta) {
  await kv.set(ROOM_KEY, meta);
}

async function setQueue(queue: Track[]) {
  await kv.set(QUEUE_KEY, queue);
}

function clampIndex(queue: Track[], idx: number) {
  if (queue.length === 0) return 0;
  if (idx < 0) return 0;
  if (idx >= queue.length) return queue.length - 1;
  return idx;
}

const MAX_QUEUE = 500;

function slimTrack(t: Track): Track {
  return {
    videoId: t.videoId,
    title: (t.title ?? '').slice(0, 140),
    artist: (t.artist ?? '').slice(0, 80),
    art: '',
  };
}

export function applyCommand(state: RoomState, cmd: ClientCommand, actorUserId?: string): { next: RoomState; queueChanged: boolean } {
  const now = Date.now();
  const bumpMeta = (patch: Partial<RoomMeta>): RoomMeta => ({
    adminUserId: state.adminUserId,
    index: state.index,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    updatedAt: now,
    version: state.version + 1,
    ...patch,
  });
  const wrap = (meta: RoomMeta, queue: Track[], queueChanged: boolean) => ({
    next: { ...meta, queue } as RoomState,
    queueChanged,
  });

  switch (cmd.type) {
    case 'loadQueue': {
      if (!Array.isArray(cmd.queue)) return { next: state, queueChanged: false };
      const queue = cmd.queue
        .filter((t) => t && t.videoId)
        .slice(0, MAX_QUEUE)
        .map(slimTrack);
      const meta = bumpMeta({
        index: clampIndex(queue, cmd.index ?? 0),
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        adminUserId: state.adminUserId ?? actorUserId ?? null,
      });
      return wrap(meta, queue, true);
    }
    case 'add': {
      if (!cmd.track?.videoId) return { next: state, queueChanged: false };
      if (state.queue.length >= MAX_QUEUE) return { next: state, queueChanged: false };
      // Insert right after the currently playing track and jump to it
      // so user-added searches play immediately without disturbing the
      // rest of the queue order.
      const queue = state.queue.slice();
      const insertAt = state.queue.length === 0 ? 0 : state.index + 1;
      queue.splice(insertAt, 0, slimTrack(cmd.track));
      const newIndex = Math.min(insertAt, queue.length - 1);
      return wrap(bumpMeta({ index: newIndex, currentTime: 0, duration: 0 }), queue, true);
    }
    case 'remove': {
      if (cmd.index < 0 || cmd.index >= state.queue.length) return { next: state, queueChanged: false };
      const queue = state.queue.slice();
      queue.splice(cmd.index, 1);
      let index = state.index;
      if (cmd.index < state.index) index -= 1;
      return wrap(bumpMeta({ index: clampIndex(queue, index) }), queue, true);
    }
    case 'reorder': {
      const { from, to } = cmd;
      if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length) {
        return { next: state, queueChanged: false };
      }
      const queue = state.queue.slice();
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      let index = state.index;
      if (from === state.index) index = to;
      else if (from < state.index && to >= state.index) index -= 1;
      else if (from > state.index && to <= state.index) index += 1;
      return wrap(bumpMeta({ index: clampIndex(queue, index) }), queue, true);
    }
    case 'skip': {
      if (state.queue.length === 0) return { next: state, queueChanged: false };
      const index = (state.index + 1) % state.queue.length;
      return wrap(bumpMeta({ index, currentTime: 0, duration: 0 }), state.queue, false);
    }
    case 'prev': {
      if (state.queue.length === 0) return { next: state, queueChanged: false };
      const index = (state.index - 1 + state.queue.length) % state.queue.length;
      return wrap(bumpMeta({ index, currentTime: 0, duration: 0 }), state.queue, false);
    }
    case 'playpause': {
      const isPlaying = cmd.isPlaying ?? !state.isPlaying;
      return wrap(bumpMeta({ isPlaying }), state.queue, false);
    }
    case 'seek': {
      const fraction = Math.max(0, Math.min(1, cmd.fraction));
      const currentTime = state.duration > 0 ? fraction * state.duration : 0;
      return wrap(bumpMeta({ currentTime }), state.queue, false);
    }
    case 'setVolume': {
      const volume = Math.max(0, Math.min(1, cmd.volume));
      return wrap(bumpMeta({ volume }), state.queue, false);
    }
    case 'tick': {
      // Tick is poll-based and races with user-issued playpause commands.
      // Keep state.isPlaying as the authoritative value (it's flipped via
      // `playpause` only). Tick just refreshes the timeline.
      const meta: RoomMeta = {
        adminUserId: state.adminUserId,
        index: state.index,
        isPlaying: state.isPlaying,
        currentTime: cmd.currentTime,
        duration: cmd.duration,
        volume: state.volume,
        updatedAt: now,
        version: state.version + 1,
      };
      return wrap(meta, state.queue, false);
    }
    case 'trackChanged': {
      return wrap(
        bumpMeta({ index: clampIndex(state.queue, cmd.index), currentTime: 0 }),
        state.queue,
        false,
      );
    }
    default:
      return { next: state, queueChanged: false };
  }
}

export async function persist(next: RoomState, queueChanged: boolean): Promise<void> {
  const { queue, ...meta } = next;
  const writes: Promise<unknown>[] = [setMeta(meta as RoomMeta)];
  if (queueChanged) writes.push(setQueue(queue));
  await Promise.all(writes);
}
