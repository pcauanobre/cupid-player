import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPusherServer } from '@/lib/pusher-server';
import { ADMIN_CHANNEL, ROOM_CHANNEL, type ClientCommand } from '@/lib/room';
import { applyCommand, getRoom, persist } from '@/lib/room-store';

export const dynamic = 'force-dynamic';

// Only the admin's iframe reports realtime playback ticks — others can't tick.
const ADMIN_ONLY: ClientCommand['type'][] = ['tick'];
// Loading a whole playlist requires the admin to be signed in.
const SIGNIN_REQUIRED: ClientCommand['type'][] = ['loadQueue'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isAdmin = Boolean(session?.user?.isAdmin);
  // Use the explicit role header — same Google session can be active on
  // both /admin and /user simultaneously, so we can't infer the role from
  // the session alone.
  const role = req.headers.get('x-cupid-role');
  const isUserRoleRequest = role === 'user';

  let cmd: ClientCommand;
  try {
    cmd = (await req.json()) as ClientCommand;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!cmd?.type) {
    return NextResponse.json({ error: 'missing type' }, { status: 400 });
  }

  if (ADMIN_ONLY.includes(cmd.type) && !isAdmin) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  if (SIGNIN_REQUIRED.includes(cmd.type) && !isAdmin) {
    return NextResponse.json({ error: 'admin sign-in required' }, { status: 401 });
  }

  try {
    const current = await getRoom();
    const { next, queueChanged } = applyCommand(current, cmd, session?.user?.id);
    await persist(next, queueChanged);

    const pusher = getPusherServer();
    await pusher.trigger(ROOM_CHANNEL, 'state:update', { state: next });

    // Mirror user-initiated commands to admin's private channel so the
    // YouTube IFrame on admin's device can react in real time.
    // Admin's own commands don't need mirroring — they already executed
    // locally via the iframe. We route by the explicit role header so it
    // works even when admin and user pages share a browser session.
    const mirror: ClientCommand['type'][] = [
      'skip', 'prev', 'playpause', 'seek',
      'reorder', 'add', 'remove', 'loadQueue',
      'trackChanged',
    ];
    if (mirror.includes(cmd.type) && isUserRoleRequest) {
      await pusher.trigger(ADMIN_CHANNEL, `cmd:${cmd.type}`, cmd);
    }

    return NextResponse.json({ state: next });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
