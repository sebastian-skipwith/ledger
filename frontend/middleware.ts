import { NextRequest, NextResponse } from 'next/server';

// Host-based routing. This one Vercel project serves both the marketing site and
// the web app:
//   persistence.finance / www.persistence.finance  -> static landing page
//   app.persistence.finance (and the *.vercel.app URL) -> the Next.js web app
// We only rewrite the ROOT of the marketing hosts to /landing.html; every other
// path (/developers, /security.html, app routes, etc.) is left untouched.
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host === 'persistence.finance' || host === 'www.persistence.finance') {
    return NextResponse.rewrite(new URL('/landing.html', req.url));
  }
  return NextResponse.next();
}

// Only run on the root path — the only path whose destination differs by host.
export const config = { matcher: '/' };
