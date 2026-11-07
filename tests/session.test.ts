import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), createServerClient: vi.fn(),
  getAll: vi.fn(), set: vi.fn(), createClient: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
vi.mock('@/lib/config', () => ({ config: () => ({
  origin: 'https://graph.example.edu', url: 'https://project.supabase.co', key: 'sb_publishable_test_key', secretKey: 'sb_secret_test_key',
}) }));

import { adminSupabase, authenticatedUser, serverSupabase } from '@/lib/supabase';

const user = { id: 'user-a', email: 'a@lab.edu', email_confirmed_at: '2026-11-07T12:00:00Z' };
const client = { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerClient.mockReturnValue(client);
  mocks.getAll.mockReturnValue([]);
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('authoritative session gate', () => {
  it('denies unverified accounts before invoking the session RPC', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    expect(await authenticatedUser()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies missing or provider-rejected accounts before invoking the session RPC', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await authenticatedUser()).toBeNull();
    mocks.getUser.mockResolvedValueOnce({ data: { user }, error: { message: 'revoked token' } });
    expect(await authenticatedUser()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([false, null, 'true', 1])('requires an explicit true session result, not %s', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await authenticatedUser()).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('current_session_is_active');
  });

  it('fails closed when the authoritative session check is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(authenticatedUser()).rejects.toThrow('Session check is unavailable.');
  });

  it('returns only the provider-verified user and its scoped client after both checks pass', async () => {
    expect(await authenticatedUser()).toEqual({ user, client });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('current_session_is_active');
  });
});

describe('server session cookie adapter', () => {
  it('uses the new server secret key only for the nonpersistent administrative client', () => {
    adminSupabase();
    expect(mocks.createClient).toHaveBeenCalledWith('https://project.supabase.co', 'sb_secret_test_key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: expect.any(Function) },
    });
  });
  it('overrides unsafe cookie options emitted by the SDK', async () => {
    await serverSupabase();
    const options = mocks.createServerClient.mock.calls[0][2];
    options.cookies.setAll([{ name: 'sb-test', value: 'session', options: { httpOnly: false, secure: false, sameSite: 'none', path: '/unsafe' } }]);
    expect(mocks.set).toHaveBeenCalledWith('sb-test', 'session', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    });
  });
});
