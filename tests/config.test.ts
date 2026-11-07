import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, configured } from '@/lib/config';

beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', 'https://graph.example.edu');
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_only');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_only');
  vi.stubEnv('RATE_LIMIT_SECRET', 'a-test-limiter-secret-with-32-characters');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-must-not-be-used');
});
afterEach(() => vi.unstubAllEnvs());

describe('modern Supabase API key configuration', () => {
  it('uses the publishable and secret keys, ignoring the legacy variable', () => {
    expect(configured()).toBe(true);
    expect(config()).toMatchObject({ key: 'sb_publishable_test_only', secretKey: 'sb_secret_test_only' });
  });
  it('does not fall back to a legacy service-role key', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    expect(configured()).toBe(false);
    expect(() => config()).toThrow('Server configuration is incomplete.');
  });
  it.each([
    ['SUPABASE_PUBLISHABLE_KEY', 'eyJlegacy-anon-jwt'],
    ['SUPABASE_SECRET_KEY', 'eyJlegacy-service-role-jwt'],
    ['SUPABASE_PUBLISHABLE_KEY', 'sb_secret_wrong_role'],
    ['SUPABASE_SECRET_KEY', 'sb_publishable_wrong_role'],
  ])('rejects legacy or swapped keys in %s without exposing their value', (name, value) => {
    vi.stubEnv(name, value);
    expect(() => config()).toThrow(`${name} must use the new`);
    try { config(); } catch (error) { expect((error as Error).message).not.toContain(value); }
  });
});
