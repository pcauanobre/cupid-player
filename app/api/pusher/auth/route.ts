import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPusherServer } from '@/lib/pusher-server';
import { ADMIN_CHANNEL } from '@/lib/room';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  const form = await req.formData();
  const socketId = String(form.get('socket_id') ?? '');
  const channel = String(form.get('channel_name') ?? '');

  if (!socketId || !channel) {
    return NextResponse.json({ error: 'missing socket or channel' }, { status: 400 });
  }

  // Admin-only private channel
  if (channel === ADMIN_CHANNEL) {
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'not admin' }, { status: 403 });
    }
    const pusher = getPusherServer();
    const auth = pusher.authenticate(socketId, channel);
    return NextResponse.json(auth);
  }

  // Presence room channel — allow signed-in users; guests get an anonymous id
  if (channel.startsWith('presence-room-')) {
    const pusher = getPusherServer();
    const userId = session?.user?.id ?? `guest-${crypto.randomUUID()}`;
    const userInfo = {
      name: session?.user?.name ?? 'guest',
      email: session?.user?.email ?? null,
      isAdmin: Boolean(session?.user?.isAdmin),
    };
    const auth = pusher.authorizeChannel(socketId, channel, { user_id: userId, user_info: userInfo });
    return NextResponse.json(auth);
  }

  return NextResponse.json({ error: 'unknown channel' }, { status: 400 });
}
