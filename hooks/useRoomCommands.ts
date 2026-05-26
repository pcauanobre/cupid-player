'use client';

import { useCallback } from 'react';
import type { ClientCommand, RoomState } from '@/lib/room';

type Role = 'admin' | 'user';

export default function useRoomCommands(role: Role = 'user') {
  const send = useCallback(async (cmd: ClientCommand): Promise<RoomState | null> => {
    try {
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cupid-role': role,
        },
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
  }, [role]);
  return { send };
}
