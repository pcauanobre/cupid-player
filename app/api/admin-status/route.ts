import { NextResponse } from 'next/server';
import { getCachedAdminToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await getCachedAdminToken();
  return NextResponse.json({ signedIn: Boolean(token) });
}
