import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ paid: false, auth: true, access: vi.fn() }));
vi.mock('@/lib/config', () => ({ configured: () => true }));
vi.mock('@/lib/supabase', () => ({ authenticatedUser: async () => mocks.auth ? { user: { id: 'verified', email: 'student@example.invalid' }, client: {} } : null }));
vi.mock('@/lib/access', () => ({ hasSemesterPass: mocks.access }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement('a', { href }, children) }));
vi.mock('@/components/auth-form', () => ({ AuthForm: () => createElement('div', null, 'Account form') }));
vi.mock('@/components/graph-helper', () => ({ GraphHelper: () => createElement('div', null, 'Graph helper') }));
import Workspace from '@/app/workspace/page';
beforeEach(() => { mocks.auth = true; mocks.access.mockResolvedValue(false); });
describe('paid report content stays behind the server gate', () => {
  it('does not emit full report examples in free-user HTML', async () => {
    const html = renderToStaticMarkup(await Workspace());
    expect(html).toContain('View the semester pass');
    expect(html).not.toContain('Good example');
    expect(html).not.toContain('retort stand');
  });
  it('renders the full static guide only for confirmed paid access', async () => {
    mocks.access.mockResolvedValue(true);
    const html = renderToStaticMarkup(await Workspace());
    expect(html).toContain('Good example');
    expect(html).toContain('retort stand');
    expect(html).toContain('Video walkthrough');
  });
  it('rejects a signed-out request before checking the guide entitlement', async () => {
    mocks.auth = false;
    await expect(Workspace()).rejects.toThrow('redirect:/login');
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('fails closed if the paid-access service is unavailable', async () => {
    mocks.access.mockRejectedValue(new Error('offline'));
    await expect(Workspace()).rejects.toThrow('offline');
  });
});
