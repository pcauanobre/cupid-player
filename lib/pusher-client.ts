'use client';

import PusherClient from 'pusher-js';

let cached: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (cached) return cached;
  cached = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY ?? '', {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? 'us2',
    authEndpoint: '/api/pusher/auth',
  });
  return cached;
}
