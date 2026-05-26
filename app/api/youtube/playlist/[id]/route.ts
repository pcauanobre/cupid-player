import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { fetchPlaylistTracks } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.isAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const all = await fetchPlaylistTracks(params.id, session.accessToken);
    // Cap + slim so the whole queue fits Upstash 1 MB body limit on free tier.
    // art is derivable from videoId, drop it from storage.
    const tracks = all.slice(0, 500).map((t) => ({
      videoId: t.videoId,
      title: (t.title ?? '').slice(0, 140),
      artist: (t.artist ?? '').slice(0, 80),
      art: '',
    }));
    return NextResponse.json({ tracks, truncated: all.length > tracks.length, total: all.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
