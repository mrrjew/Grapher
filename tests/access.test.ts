import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSemesterPass, semesterAccessForPage } from '@/lib/access';
function client(data: unknown, error: unknown = null) { return { rpc: vi.fn().mockResolvedValue({ data, error }) } as unknown as SupabaseClient; }
describe('access check outage handling', () => {
  it('retains strict rejection for protected actions when the migration is missing', async () => {
    await expect(hasSemesterPass(client(null, { code: 'PGRST202' }))).rejects.toThrow('Access check is unavailable.');
  });
  it('returns an unavailable page state without ever granting access', async () => {
    expect(await semesterAccessForPage(client(null, { code: 'PGRST202' }))).toEqual({ available: false, paid: false });
    const offline = { rpc: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as SupabaseClient;
    expect(await semesterAccessForPage(offline)).toEqual({ available: false, paid: false });
  });
  it('distinguishes verified free and paid states from outages', async () => {
    expect(await semesterAccessForPage(client(false))).toEqual({ available: true, paid: false });
    expect(await semesterAccessForPage(client(true))).toEqual({ available: true, paid: true });
    expect(await hasSemesterPass(client('true'))).toBe(false);
  });
});
