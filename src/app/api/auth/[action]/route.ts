import { NextResponse } from 'next/server';
import { config, configured } from '@/lib/config';
import { adminSupabase, authenticatedUser, clearAuthCookies, reauthenticate, serverSupabase } from '@/lib/supabase';
import { confirmationValues, emailValue, InputError, passwordValue, sameOrigin } from '@/lib/validation';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { hasRecovery, setRecovery } from '@/lib/recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const actions = ['login', 'signup', 'logout', 'forgot-password', 'resend', 'confirm', 'reset-password', 'change-password', 'delete-account'];
const messageSent = 'If this address can receive an email, a link is on its way. Check your spam folder. It may take a few minutes. You can request another after 60 seconds.';
function reply(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!actions.includes(action)) return reply({ message: 'This action is unavailable.' }, 404);
  if (!configured()) return reply({ message: 'Accounts are not connected yet. Please try again after setup.' }, 503);
  try {
    if (!sameOrigin(request.headers.get('origin'), config().origin)) return reply({ message: 'Open this form on the app’s own website and try again.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ message: 'Send this form using the app.' }, 415);
    // Read a bounded stream, even when Content-Length is missing or dishonest.
    const reader = request.body?.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 8192) { await reader.cancel(); return reply({ message: 'This form is too large. Check your entries.' }, 413); }
        chunks.push(part.value);
      }
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    } catch { return reply({ message: 'The form could not be read. Check your entries and try again.' }, 400); }
    const email = ['login', 'signup', 'forgot-password', 'resend'].includes(action) ? emailValue(data.email) : undefined;
    await rateLimit(request, action === 'login' ? 'password' : action, email);
    const client = await serverSupabase();

    if (action === 'login') {
      const { data: result, error } = await client.auth.signInWithPassword({ email: email!, password: passwordValue(data.password, false) });
      if (error || !result.user?.email_confirmed_at) return reply({ message: 'We could not sign you in. Check your email and password, and verify your email first.' }, 400);
      return reply({ redirect: '/workspace' });
    }
    if (action === 'signup') {
      const password = passwordValue(data.password);
      if (data.password !== data.confirmPassword) throw new InputError('The passwords do not match. Enter them again.');
      const { data: result, error } = await client.auth.signUp({ email: email!, password, options: { emailRedirectTo: `${config().origin}/auth/confirm` } });
      // A session here means the provider incorrectly allows unverified signup.
      if (result.session) { await client.auth.signOut({ scope: 'local' }); await clearAuthCookies(); return reply({ message: 'Email verification is not configured. Please contact the app owner.' }, 503); }
      if (error && !['user_already_exists', 'email_exists'].includes(error.code ?? '')) return reply({ message: 'We could not create the account right now. Check the password rules and try again later.' }, 400);
      return reply({ message: messageSent, cooldown: 60 });
    }
    if (action === 'forgot-password' || action === 'resend') {
      const { error } = action === 'forgot-password'
        ? await client.auth.resetPasswordForEmail(email!, { redirectTo: `${config().origin}/auth/confirm` })
        : await client.auth.resend({ type: 'signup', email: email!, options: { emailRedirectTo: `${config().origin}/auth/confirm` } });
      // Do not reveal whether an email/account exists, including provider throttling.
      if (error) console.warn('auth_email_request_not_sent', { action, code: error.status });
      return reply({ message: messageSent, cooldown: 60 });
    }
    if (action === 'confirm') {
      const values = confirmationValues(data);
      const { data: result, error } = await client.auth.verifyOtp(values);
      if (error || !result.user || !result.session || !result.user.email_confirmed_at) return reply({ message: 'This link has expired or has already been used. Request a new email link.' }, 400);
      const claims = await client.auth.getClaims();
      const sessionId = claims.data?.claims.session_id;
      if (typeof sessionId !== 'string') throw new Error('Missing session.');
      if (values.type === 'recovery') await setRecovery(result.user.id, sessionId);
      return reply({ redirect: values.type === 'recovery' ? '/reset-password' : '/workspace' });
    }
    if (action === 'logout') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && error.status !== 403 && error.status !== 401) return reply({ message: 'We could not end the session. Please try logging out again.' }, 503);
      await clearAuthCookies();
      return reply({ redirect: '/login' });
    }

    const auth = await authenticatedUser();
    if (!auth) return reply({ message: 'Your session has ended. Log in again.', redirect: '/login' }, 401);
    if (action === 'change-password' || action === 'delete-account') {
      await rateLimit(request, 'password', auth.user.email!.toLowerCase());
    }
    if (action === 'delete-account') {
      if (data.confirmation !== 'DELETE') throw new InputError('Type DELETE to confirm account deletion.');
      if (!await reauthenticate(auth.user.email!, passwordValue(data.currentPassword, false), auth.user.id)) return reply({ message: 'Your current password did not match. Check it and try again.' }, 400);
      const { error } = await adminSupabase().auth.admin.deleteUser(auth.user.id);
      if (error) throw new Error('Account deletion failed.');
      await clearAuthCookies();
      return reply({ redirect: '/login?notice=deleted' });
    }
    const password = passwordValue(data.password);
    if (data.password !== data.confirmPassword) throw new InputError('The passwords do not match. Enter them again.');
    let currentPassword: string | undefined;
    if (action === 'change-password') {
      currentPassword = passwordValue(data.currentPassword, false);
      if (!await reauthenticate(auth.user.email!, currentPassword, auth.user.id)) return reply({ message: 'Your current password did not match. Check it and try again.' }, 400);
    } else {
      const claims = await auth.client.auth.getClaims();
      const sessionId = claims.data?.claims.session_id;
      if (typeof sessionId !== 'string' || !await hasRecovery(auth.user.id, sessionId)) return reply({ message: 'Request a new password reset link before setting your password.' }, 403);
    }
    const { error } = await auth.client.auth.updateUser({ password, ...(currentPassword ? { current_password: currentPassword } : {}) });
    if (error) return reply({ message: 'We could not change the password. Choose a different password, or request a fresh reset email.' }, 400);
    const signedOut = await auth.client.auth.signOut({ scope: 'global' });
    if (signedOut.error) return reply({ message: 'Your password changed, but we could not end all sessions. Use Log out and sign in with the new password.' }, 503);
    await clearAuthCookies();
    return reply({ redirect: '/login?notice=password-updated' });
  } catch (error) {
    if (error instanceof InputError) return reply({ message: error.message }, 400);
    if (error instanceof RateLimitError) return reply({ message: error.message }, 429);
    console.error('auth_operation_failed', { action });
    return reply({ message: 'We could not reach the account service. Your account has not been unlocked. Please try again shortly.' }, 503);
  }
}
