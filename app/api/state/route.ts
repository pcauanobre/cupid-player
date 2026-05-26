import { NextResponse } from 'next/server';
import { getRoom } from '@/lib/room-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getRoom();
    return NextResponse.json({ state });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
