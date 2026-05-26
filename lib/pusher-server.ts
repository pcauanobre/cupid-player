import Pusher from 'pusher';

let cached: Pusher | null = null;

export function getPusherServer(): Pusher {
  if (cached) return cached;
  cached = new Pusher({
    appId: process.env.PUSHER_APP_ID ?? '',
    key: process.env.PUSHER_KEY ?? '',
    secret: process.env.PUSHER_SECRET ?? '',
    cluster: process.env.PUSHER_CLUSTER ?? 'us2',
    useTLS: true,
  });
  return cached;
}
