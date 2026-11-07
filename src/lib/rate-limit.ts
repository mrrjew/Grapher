import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { config } from './config';
import { adminSupabase } from './supabase';

export class RateLimitError extends Error {}

export async function rateLimit(request: Request, action: string, email?: string) {
  // Only Vercel's overwritten header is trusted. Local requests share one bucket.
  const raw = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') : '127.0.0.1';
  const ip = raw?.trim();
  if (!ip || !isIP(ip)) throw new Error('Client address is unavailable.');
  const emailAction = ['forgot-password', 'resend'].includes(action);
  const rules = [ { identity: `ip:${ip}:${action}`, limit: emailAction ? 10 : 30, seconds: 900 } ];
  if (email) rules.push({ identity: `email:${email}:${action}`, limit: emailAction ? 1 : 8, seconds: emailAction ? 60 : 900 });
  const db = adminSupabase();
  for (const rule of rules) {
    const key = createHmac('sha256', config().secret).update(rule.identity).digest('hex');
    const { data, error } = await db.rpc('consume_rate_limit', { p_key: key, p_limit: rule.limit, p_window_seconds: rule.seconds });
    if (error) throw new Error('Rate limiting is unavailable.');
    if (data !== true) throw new RateLimitError('Too many attempts. Wait a little before trying again. Email requests can be sent once a minute.');
  }
}
