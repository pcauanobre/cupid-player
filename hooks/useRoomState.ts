'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_ROOM, ROOM_CHANNEL, type RoomState } from '@/lib/room';
import { getPusherClient } from '@/lib/pusher-client';

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
    const onUpdate = (data: { state: RoomState }) => {
      if (data?.state) {
        setState((prev) => (data.state.version >= prev.version ? data.state : prev));
      }
    };
    channel.bind('state:update', onUpdate);
    return () => {
      channel.unbind('state:update', onUpdate);
      pusher.unsubscribe(ROOM_CHANNEL);
    };
  }, []);

  return { state, ready, error, refresh, setState };
}
