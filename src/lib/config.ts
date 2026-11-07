import 'server-only';

export function configured() {
  return Boolean(process.env.APP_ORIGIN && process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY && process.env.RATE_LIMIT_SECRET);
}

export function config() {
  if (!configured()) throw new Error('Server configuration is incomplete.');
  const origin = new URL(process.env.APP_ORIGIN!);
  const supabase = new URL(process.env.SUPABASE_URL!);
  if (origin.origin !== process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact HTTPS origin in production.');
  if (process.env.RATE_LIMIT_SECRET!.length < 32) throw new Error('RATE_LIMIT_SECRET is too short.');
  if (supabase.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(supabase.hostname)) throw new Error('Supabase requires HTTPS.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_PUBLISHABLE_KEY!)) throw new Error('SUPABASE_PUBLISHABLE_KEY must use the new sb_publishable_ key format.');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(process.env.SUPABASE_SECRET_KEY!)) throw new Error('SUPABASE_SECRET_KEY must use the new sb_secret_ key format.');
  return { origin: origin.origin, url: supabase.href.replace(/\/$/, ''), key: process.env.SUPABASE_PUBLISHABLE_KEY!, secretKey: process.env.SUPABASE_SECRET_KEY!, secret: process.env.RATE_LIMIT_SECRET! };
}
