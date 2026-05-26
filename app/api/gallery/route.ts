import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export const dynamic = 'force-dynamic';

const SLOTS = 30;

export async function GET() {
  try {
    const keys = Array.from({ length: SLOTS }, (_, i) => `gallery:slot:${i}`);
    const values = await Promise.all(keys.map((k) => kv.get<string>(k)));
    // Return null for empty slots so client knows the indexes
    return NextResponse.json({ slots: values.map((v) => v ?? null) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'kv error' }, { status: 500 });
  }
}
