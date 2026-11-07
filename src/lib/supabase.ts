import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { config } from './config';

const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12000) });

export async function serverSupabase() {
  const cfg = config();
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    global: { fetch: timedFetch },
    cookieOptions: { httpOnly: true, secure: cfg.origin.startsWith('https:'), sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => jar.set(name, value, { ...options, httpOnly: true, secure: cfg.origin.startsWith('https:'), sameSite: 'lax', path: '/' })); }
        catch { /* Server components cannot write cookies. Proxy refreshes them first. */ }
      },
    },
  });
}

export function adminSupabase() {
  const cfg = config();
  return createClient(cfg.url, cfg.secretKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } });
}

export async function reauthenticate(email: string, password: string, userId: string) {
  const cfg = config();
  const client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  const valid = !error && data.user?.id === userId && Boolean(data.user.email_confirmed_at);
  if (data.session) await client.auth.signOut({ scope: 'local' });
  return valid;
}

export async function authenticatedUser() {
  const client = await serverSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return null;
  const session = await client.rpc('current_session_is_active');
  if (session.error) throw new Error('Session check is unavailable.');
  return session.data === true ? { user: data.user, client } : null;
}

export async function clearAuthCookies() {
  const jar = await cookies();
  for (const item of jar.getAll()) {
    if (item.name.startsWith('sb-') || item.name === 'physics-recovery') jar.set(item.name, '', { maxAge: 0, path: '/', httpOnly: true, secure: config().origin.startsWith('https:'), sameSite: 'lax' });
  }
}
