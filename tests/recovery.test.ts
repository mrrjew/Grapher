import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  origin: 'https://graph.example.edu',
  secret: 'a-test-secret-with-at-least-32-characters',
}));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => mocks.values.has(name) ? { value: mocks.values.get(name)! } : undefined,
  set: mocks.set,
}) }));
vi.mock('@/lib/config', () => ({ config: () => ({ origin: mocks.origin, secret: mocks.secret }) }));

import { hasRecovery, setRecovery } from '@/lib/recovery';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  mocks.values.clear();
  mocks.origin = 'https://graph.example.edu';
  mocks.set.mockImplementation((name: string, value: string) => mocks.values.set(name, value));
});
afterEach(() => vi.useRealTimers());

describe('password recovery proof', () => {
  it('sets a short-lived HttpOnly cookie restricted to HTTPS and the same site', async () => {
    await setRecovery('user-a', 'session-a');
    expect(mocks.set).toHaveBeenCalledWith('physics-recovery', expect.any(String), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900,
    });
    expect(await hasRecovery('user-a', 'session-a')).toBe(true);
  });

  it('binds proof to both the verified account and its provider session', async () => {
    await setRecovery('user-a', 'session-a');
    expect(await hasRecovery('user-b', 'session-a')).toBe(false);
    expect(await hasRecovery('user-a', 'session-b')).toBe(false);
  });

  it('expires at 15 minutes even if the browser sends the old cookie', async () => {
    await setRecovery('user-a', 'session-a');
    vi.advanceTimersByTime(899999);
    expect(await hasRecovery('user-a', 'session-a')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(await hasRecovery('user-a', 'session-a')).toBe(false);
  });

  it('rejects absent proof and payload tampering', async () => {
    expect(await hasRecovery('user-a', 'session-a')).toBe(false);
    await setRecovery('user-a', 'session-a');
    const [, mac] = mocks.values.get('physics-recovery')!.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ userId: 'user-b', sessionId: 'session-a', expires: Date.now() + 900000 })).toString('base64url');
    mocks.values.set('physics-recovery', `${forgedPayload}.${mac}`);
    expect(await hasRecovery('user-b', 'session-a')).toBe(false);
  });

  it.each(['', '0'.repeat(63), '0'.repeat(65), 'é'.repeat(64), 'a'.repeat(63) + '💡', 'A'.repeat(64)])('rejects a malformed signature safely: %s', async (mac) => {
    await setRecovery('user-a', 'session-a');
    const [payload] = mocks.values.get('physics-recovery')!.split('.');
    mocks.values.set('physics-recovery', `${payload}.${mac}`);
    expect(await hasRecovery('user-a', 'session-a')).toBe(false);
  });

  it('rejects an invalid signed payload without throwing', async () => {
    const payload = Buffer.from('not valid JSON').toString('base64url');
    const mac = createHmac('sha256', mocks.secret).update(`recovery:${payload}`).digest('hex');
    mocks.values.set('physics-recovery', `${payload}.${mac}`);
    expect(await hasRecovery('user-a', 'session-a')).toBe(false);
  });
});
