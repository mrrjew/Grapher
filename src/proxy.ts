import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { configured, config as serverConfig } from '@/lib/config';

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${development ? ' ws: wss:' : ''}; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  headers.set('x-nonce', nonce);
  let response = NextResponse.next({ request: { headers } });
  if (configured()) {
    const cfg = serverConfig();
    const supabase = createServerClient(cfg.url, cfg.key, {
      cookieOptions: { httpOnly: true, secure: cfg.origin.startsWith('https:'), sameSite: 'lax', path: '/' },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12000) }) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          headers.set('cookie', request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, httpOnly: true, secure: cfg.origin.startsWith('https:'), sameSite: 'lax', path: '/' }));
        },
      },
    });
    try { await supabase.auth.getUser(); } catch { /* Protected routes fail closed in their own server checks. */ }
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
