import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { fetchMyPlaylists } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.isAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const playlists = await fetchMyPlaylists(session.accessToken);
    return NextResponse.json({ playlists });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
