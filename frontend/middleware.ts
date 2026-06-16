import { NextRequest, NextResponse } from 'next/server';

// Host-based routing. This one Vercel project serves both the marketing site and
// the web app:
//   www.persistence.finance      -> 308 redirect to the apex (canonical)
//   persistence.finance          -> static landing page at "/" (other paths pass through)
//   app.persistence.finance      -> the Next.js web app (and the *.vercel.app URL)
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();

  // www -> apex, preserving the path + query string.
  if (host === 'www.persistence.finance') {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    url.host = 'persistence.finance';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  // Marketing apex: the root shows the static landing page; the app lives on
  // app.persistence.finance. Every other path (/security.html, /privacy.html,
  // /terms.html, /developers, app routes, assets) passes through untouched.
  if (host === 'persistence.finance' && req.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/landing.html', req.url));
  }

  return NextResponse.next();
}

// Run on everything except Next internals so the www redirect covers all paths.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
