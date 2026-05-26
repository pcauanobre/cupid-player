import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPusherServer } from '@/lib/pusher-server';
import { ADMIN_CHANNEL, ROOM_CHANNEL, type ClientCommand } from '@/lib/room';
import { applyCommand, getRoom, persist } from '@/lib/room-store';

export const dynamic = 'force-dynamic';

const ADMIN_ONLY: ClientCommand['type'][] = ['tick', 'trackChanged'];
const SIGNIN_REQUIRED: ClientCommand['type'][] = ['loadQueue'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  let cmd: ClientCommand;
  try {
    cmd = (await req.json()) as ClientCommand;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!cmd?.type) {
    return NextResponse.json({ error: 'missing type' }, { status: 400 });
  }

  if (ADMIN_ONLY.includes(cmd.type) && !session?.user?.isAdmin) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  if (SIGNIN_REQUIRED.includes(cmd.type) && !session?.user) {
    return NextResponse.json({ error: 'sign-in required' }, { status: 401 });
  }

  try {
    const current = await getRoom();
    const { next, queueChanged } = applyCommand(current, cmd, session?.user?.id);
    await persist(next, queueChanged);

    const pusher = getPusherServer();

    // Tick updates: send a lightweight progress patch on the room channel.
    // Everyone gets the snapshot in `state:update`.
    await pusher.trigger(ROOM_CHANNEL, 'state:update', { state: next });

    // Mirror command intents to admin's private channel so the IFrame
    // can react to user-initiated skips/seeks/etc.
    const mirror: ClientCommand['type'][] = ['skip', 'prev', 'playpause', 'seek', 'reorder', 'add', 'remove', 'loadQueue'];
    if (mirror.includes(cmd.type) && session?.user && !session.user.isAdmin) {
      await pusher.trigger(ADMIN_CHANNEL, `cmd:${cmd.type}`, cmd);
    }

    return NextResponse.json({ state: next });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
