import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: true,
  origin: 'https://graph.example.edu',
  rateLimit: vi.fn(), authenticatedUser: vi.fn(), reauthenticate: vi.fn(), clearAuthCookies: vi.fn(),
  hasRecovery: vi.fn(), setRecovery: vi.fn(), deleteUser: vi.fn(),
  client: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), resend: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), getClaims: vi.fn(), updateUser: vi.fn() } },
}));
vi.mock('@/lib/config', () => ({ configured: () => mocks.ready, config: () => ({ origin: mocks.origin }) }));
vi.mock('@/lib/supabase', () => ({ serverSupabase: () => mocks.client, adminSupabase: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }), authenticatedUser: mocks.authenticatedUser, reauthenticate: mocks.reauthenticate, clearAuthCookies: mocks.clearAuthCookies }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit, RateLimitError: class RateLimitError extends Error {} }));
vi.mock('@/lib/recovery', () => ({ hasRecovery: mocks.hasRecovery, setRecovery: mocks.setRecovery }));
import { POST } from '@/app/api/auth/[action]/route';

const user = { id: 'verified-user', email: 'student@lab.edu', email_confirmed_at: '2026-11-07T00:00:00Z' };
function request(action: string, data: Record<string, unknown> = {}, origin = mocks.origin) {
  return POST(new Request(`https://graph.example.edu/api/auth/${action}`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), { params: Promise.resolve({ action }) });
}

beforeEach(() => {
  vi.resetAllMocks(); mocks.ready = true;
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'true');
  mocks.rateLimit.mockResolvedValue(undefined);
  mocks.authenticatedUser.mockResolvedValue({ user, client: mocks.client });
  mocks.reauthenticate.mockResolvedValue(true);
  mocks.clearAuthCookies.mockResolvedValue(undefined);
  mocks.client.auth.signOut.mockResolvedValue({ error: null });
  mocks.client.auth.updateUser.mockResolvedValue({ error: null });
  mocks.client.auth.getClaims.mockResolvedValue({ data: { claims: { session_id: 'session-1' } } });
  mocks.deleteUser.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('server authentication boundaries', () => {
  it('opens the workspace when direct signup is explicitly enabled and Supabase auto-confirms', async () => {
    vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
    mocks.client.auth.signUp.mockResolvedValue({ data: { user, session: {} }, error: null });
    const response = await request('signup', { email: user.email, password: 'GoodPassword123', confirmPassword: 'GoodPassword123' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirect: '/workspace' });
    expect(mocks.client.auth.signOut).not.toHaveBeenCalled();
  });
  it('does not pretend direct signup worked when Supabase confirmation is still enabled', async () => {
    vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
    mocks.client.auth.signUp.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null }, session: null }, error: null });
    expect((await request('signup', { email: user.email, password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(503);
  });
  it('does not accept an unconfirmed identity even with the direct-signup opt-out', async () => {
    vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
    mocks.client.auth.signUp.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null }, session: {} }, error: null });
    expect((await request('signup', { email: user.email, password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(503);
    expect(mocks.clearAuthCookies).toHaveBeenCalled();
  });
  it('rejects cross-origin requests before provider or limiter calls', async () => {
    expect((await request('login', { email: user.email, password: 'password' }, 'https://evil.test')).status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled(); expect(mocks.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('fails closed when persistent rate limiting is unavailable', async () => {
    mocks.rateLimit.mockRejectedValue(new Error('offline'));
    expect((await request('login', { email: user.email, password: 'password' })).status).toBe(503);
    expect(mocks.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('denies unverified login even when the provider returns a user', async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    expect((await request('login', { email: user.email, password: 'password' })).status).toBe(400);
  });
  it('forces email verification if hosted signup has been misconfigured', async () => {
    mocks.client.auth.signUp.mockResolvedValue({ data: { user, session: {} }, error: null });
    expect((await request('signup', { email: user.email, password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(503);
    expect(mocks.clearAuthCookies).toHaveBeenCalled();
  });
  it('uses indistinguishable responses for missing email and provider failures', async () => {
    mocks.client.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { status: 429 } });
    const first = await (await request('forgot-password', { email: user.email })).json();
    const second = await (await request('forgot-password', { email: 'absent@lab.edu' })).json();
    expect(first).toEqual(second);
  });
  it('denies deletion after authoritative session expiry or revocation', async () => {
    mocks.authenticatedUser.mockResolvedValue(null);
    expect((await request('delete-account', { confirmation: 'DELETE', currentPassword: 'password' })).status).toBe(401);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it('requires current password for deletion and ignores browser user IDs', async () => {
    mocks.reauthenticate.mockResolvedValueOnce(false);
    expect((await request('delete-account', { user_id: 'victim', confirmation: 'DELETE', currentPassword: 'wrong' })).status).toBe(400);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect((await request('delete-account', { user_id: 'victim', confirmation: 'DELETE', currentPassword: 'correct' })).status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith('verified-user');
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), 'password', user.email);
  });
  it('does not allow a normal login session to submit a recovery reset', async () => {
    mocks.hasRecovery.mockResolvedValue(false);
    expect((await request('reset-password', { password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(403);
    expect(mocks.client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('requires matching passwords and password reauthentication before a change', async () => {
    mocks.reauthenticate.mockResolvedValue(false);
    expect((await request('change-password', { currentPassword: 'wrong', password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(400);
    expect(mocks.client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('ends all sessions after recovery and binds the recovery marker to the verified session', async () => {
    mocks.hasRecovery.mockResolvedValue(true);
    expect((await request('reset-password', { password: 'GoodPassword123', confirmPassword: 'GoodPassword123' })).status).toBe(200);
    expect(mocks.hasRecovery).toHaveBeenCalledWith(user.id, 'session-1');
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(mocks.clearAuthCookies).toHaveBeenCalled();
  });
  it('only sets recovery proof after successful provider verification', async () => {
    mocks.client.auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: {} });
    expect((await request('confirm', { token_hash: 'a'.repeat(64), type: 'recovery' })).status).toBe(400);
    expect(mocks.setRecovery).not.toHaveBeenCalled();
    mocks.client.auth.verifyOtp.mockResolvedValueOnce({ data: { user, session: {} }, error: null });
    const response = await request('confirm', { token_hash: 'a'.repeat(64), type: 'recovery' });
    expect(await response.json()).toEqual({ redirect: '/reset-password' });
    expect(mocks.setRecovery).toHaveBeenCalledWith(user.id, 'session-1');
  });
  it('rejects oversized bodies before using the provider', async () => {
    expect((await request('login', { email: user.email, password: 'a'.repeat(9000) })).status).toBe(413);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});
