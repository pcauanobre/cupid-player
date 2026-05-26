import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { getPusherServer } from '@/lib/pusher-server';
import { ROOM_CHANNEL } from '@/lib/room';

export const dynamic = 'force-dynamic';

const SLOTS = 30;

function parseSlot(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n >= SLOTS) return null;
  return n;
}

export async function PUT(req: NextRequest, { params }: { params: { slot: string } }) {
  const slot = parseSlot(params.slot);
  if (slot === null) return NextResponse.json({ error: 'invalid slot' }, { status: 400 });
  let body: { dataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const dataUrl = body?.dataUrl;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'expected data:image/... dataUrl' }, { status: 400 });
  }
  // Hard cap so a runaway payload can't blow past Upstash's 1MB request limit
  if (dataUrl.length > 900_000) {
    return NextResponse.json({ error: 'image too large after compression' }, { status: 413 });
  }
  try {
    await kv.set(`gallery:slot:${slot}`, dataUrl);
    try {
      await getPusherServer().trigger(ROOM_CHANNEL, 'gallery:update', { slot, dataUrl });
    } catch { /* pusher non-fatal */ }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'kv error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { slot: string } }) {
  const slot = parseSlot(params.slot);
  if (slot === null) return NextResponse.json({ error: 'invalid slot' }, { status: 400 });
  try {
    await kv.del(`gallery:slot:${slot}`);
    try {
      await getPusherServer().trigger(ROOM_CHANNEL, 'gallery:update', { slot, dataUrl: null });
    } catch { /* non-fatal */ }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'kv error' }, { status: 500 });
  }
}
