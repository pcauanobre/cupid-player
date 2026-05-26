'use client';

import { useCallback } from 'react';
import type { ClientCommand, RoomState } from '@/lib/room';

export default function useRoomCommands() {
  const send = useCallback(async (cmd: ClientCommand): Promise<RoomState | null> => {
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('cmd failed:', err);
        return null;
      }
      const data = await res.json();
      return data.state ?? null;
    } catch (err) {
      console.error('cmd network error:', err);
      return null;
    }
  }, []);
  return { send };
}
