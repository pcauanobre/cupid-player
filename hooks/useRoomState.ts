'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_ROOM, ROOM_CHANNEL, type RoomState, type Track } from '@/lib/room';
import { getPusherClient } from '@/lib/pusher-client';

type MetaUpdate = Omit<RoomState, 'queue'>;

export default function useRoomState() {
  const [state, setState] = useState<RoomState>(EMPTY_ROOM);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch (err: any) {
      setError(err.message ?? 'failed to load state');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(ROOM_CHANNEL);

    // state:update carries meta-only (queue is omitted to stay under
    // Pusher's ~10KB payload cap on big playlists). Keep the previous
    // queue in place when merging.
    const onUpdate = (data: { state: MetaUpdate & { queue?: Track[] } }) => {
      if (!data?.state) return;
      setState((prev) => {
        if (data.state.version < prev.version) return prev;
        return {
          ...prev,
          ...data.state,
          queue: data.state.queue ?? prev.queue,
        };
      });
    };

    // queue:invalidate is fired separately whenever the queue changed.
    // Pull the fresh state (which includes the queue) via HTTP.
    const onQueueInvalidate = () => { refresh(); };

    channel.bind('state:update', onUpdate);
    channel.bind('queue:invalidate', onQueueInvalidate);
    return () => {
      channel.unbind('state:update', onUpdate);
      channel.unbind('queue:invalidate', onQueueInvalidate);
      pusher.unsubscribe(ROOM_CHANNEL);
    };
  }, [refresh]);

  return { state, ready, error, refresh, setState };
}
