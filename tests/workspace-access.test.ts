import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ paid: false, auth: true, access: vi.fn() }));
vi.mock('@/lib/config', () => ({ configured: () => true }));
vi.mock('@/lib/supabase', () => ({ authenticatedUser: async () => mocks.auth ? { user: { id: 'verified', email: 'student@example.invalid' }, client: {} } : null }));
vi.mock('@/lib/access', () => ({ semesterAccessForPage: mocks.access }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement('a', { href }, children) }));
vi.mock('@/components/auth-form', () => ({ AuthForm: () => createElement('div', null, 'Account form') }));
vi.mock('@/components/graph-helper', () => ({ GraphHelper: ({ savingEnabled }: { savingEnabled: boolean }) => createElement('div', { 'data-saving': String(savingEnabled) }, 'Graph helper') }));
import Workspace from '@/app/workspace/page';
import Upgrade from '@/app/upgrade/page';
beforeEach(() => { mocks.auth = true; mocks.access.mockResolvedValue({ available: true, paid: false }); });
describe('paid report content stays behind the server gate', () => {
  it('does not emit full report examples in free-user HTML', async () => {
    const html = renderToStaticMarkup(await Workspace());
    expect(html).toContain('View the semester pass');
    expect(html).not.toContain('Good example');
    expect(html).not.toContain('retort stand');
  });
  it('renders the full static guide only for confirmed paid access', async () => {
    mocks.access.mockResolvedValue({ available: true, paid: true });
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
  it('keeps the graph helper available but never renders paid content when access cannot be checked', async () => {
    mocks.access.mockResolvedValue({ available: false, paid: false });
    const html = renderToStaticMarkup(await Workspace());
    expect(html).toContain('Graph helper');
    expect(html).toContain('temporarily unavailable');
    expect(html).toContain('data-saving="false"');
    expect(html).not.toContain('Good example');
    expect(html).not.toContain('Your semester pass is active');
    expect(html).not.toContain('Free account:');
  });
  it('pauses checkout rather than treating an unavailable pass lookup as a free account', async () => {
    mocks.access.mockResolvedValue({ available: false, paid: false });
    const html = renderToStaticMarkup(await Upgrade());
    expect(html).toContain('Checkout is paused');
    expect(html).not.toContain('Pay with Paystack');
  });
});
