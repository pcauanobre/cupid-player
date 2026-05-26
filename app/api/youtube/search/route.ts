import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions, getCachedAdminToken } from '@/lib/auth';
import { searchVideos } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // Use the requester's token if signed in; otherwise fall back to the
  // cached admin token so anonymous /user visitors can still search.
  const token = session?.accessToken ?? (await getCachedAdminToken());
  if (!token) {
    return NextResponse.json(
      { error: 'admin precisa logar pelo menos uma vez pra liberar a busca' },
      { status: 401 },
    );
  }
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchVideos(q, token, 10);
    return NextResponse.json({ tracks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
