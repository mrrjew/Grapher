import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config } from './config';

const name = 'physics-recovery';
function signature(payload: string) { return createHmac('sha256', config().secret).update(`recovery:${payload}`).digest('hex'); }
export async function setRecovery(userId: string, sessionId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, sessionId, expires: Date.now() + 900000 })).toString('base64url');
  (await cookies()).set(name, `${payload}.${signature(payload)}`, { httpOnly: true, secure: config().origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 900 });
}
export async function hasRecovery(userId: string, sessionId: string) {
  const value = (await cookies()).get(name)?.value;
  if (!value) return false;
  const [payload, mac] = value.split('.');
  const expected = signature(payload);
  if (!mac || !/^[a-f0-9]{64}$/.test(mac) || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.userId === userId && data.sessionId === sessionId && Number.isFinite(data.expires) && data.expires > Date.now();
  } catch { return false; }
}
