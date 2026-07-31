import { NextResponse } from 'next/server';

// Explicit runtime per DEPENDENCY DISCIPLINE — never assume Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    phase: 1,
    service: 'nva-web-solutions',
    time: new Date().toISOString(),
  });
}
