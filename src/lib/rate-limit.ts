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
  const profile = action === 'payment-status' ? { ip: 3000, account: 60, seconds: 60 }
    : action === 'graph-save' ? { ip: 1200, account: 60, seconds: 900 }
    : { ip: emailAction ? 10 : 30, account: emailAction ? 1 : 8, seconds: emailAction ? 60 : 900 };
  const rules = [ { identity: `ip:${ip}:${action}`, limit: profile.ip, seconds: emailAction ? 900 : profile.seconds } ];
  if (email) rules.push({ identity: `email:${email}:${action}`, limit: profile.account, seconds: profile.seconds });
  const db = adminSupabase();
  for (const rule of rules) {
    const key = createHmac('sha256', config().secret).update(rule.identity).digest('hex');
    const { data, error } = await db.rpc('consume_rate_limit', { p_key: key, p_limit: rule.limit, p_window_seconds: rule.seconds });
    if (error) throw new Error('Rate limiting is unavailable.');
    if (data !== true) throw new RateLimitError(emailAction ? 'Too many attempts. Email requests can be sent once a minute. Please wait before trying again.' : 'Too many requests. Wait a little before trying again.');
  }
}
