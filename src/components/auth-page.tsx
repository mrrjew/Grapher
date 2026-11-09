import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticatedUser } from '@/lib/supabase';
import { configured } from '@/lib/config';
import { AuthForm } from './auth-form';
import { emailVerificationRequired } from '@/lib/auth-settings';

type Mode = 'login' | 'signup' | 'forgot-password' | 'resend';
const content = {
  login: { title: 'Log in', description: 'Use your verified email address to open your workspace.' },
  signup: { title: 'Create an account', description: 'We’ll send a link to verify your email before you can log in.' },
  'forgot-password': { title: 'Reset your password', description: 'Enter your email address. We’ll send a link to set a new password.' },
  resend: { title: 'Verify your email', description: 'Need another verification link? Enter the email address you used to sign up.' },
};

export async function AuthPage({ mode, notice }: { mode: Mode; notice?: string }) {
  const ready = configured();
  const verificationRequired = emailVerificationRequired();
  if (ready) {
    const auth = await authenticatedUser();
    if (auth) redirect('/workspace');
  }
  const item = !verificationRequired && mode === 'signup'
    ? { title: 'Create an account', description: 'Enter your email and password. Your workspace will open after signup.' }
    : !verificationRequired && mode === 'login'
      ? { title: 'Log in', description: 'Enter your email and password to open your workspace.' }
      : content[mode];
  return <main id="main" className="auth-layout">
    <section className="introduction" aria-labelledby="intro-title">
      <p className="eyebrow">For the practical lab</p>
      <h1 id="intro-title">Physics Graph Helper</h1>
      <p className="intro-copy">Learn the method.<br />Do the work yourself.</p>
      <div className="ruled-paper" aria-hidden="true"><span>x</span><span>y</span></div>
      <p className="intro-note">A quiet place for careful work.</p>
    </section>
    <section className="form-panel" aria-labelledby="form-title">
      <p className="section-label">Your account</p><h2 id="form-title">{item.title}</h2><p className="description">{item.description}</p>
      {!ready && <p className="message" role="status">The account service is not connected yet. Please return when setup is complete.</p>}
      {notice === 'deleted' && <p className="message" role="status">Your account has been deleted.</p>}
      {notice === 'password-updated' && <p className="message" role="status">Your password has changed. Log in with your new password.</p>}
      <AuthForm mode={mode} disabled={!ready} />
      <nav className="auth-links" aria-label="Account help">
        {mode === 'login' ? <><Link href="/signup">Create an account</Link><Link href="/forgot-password">Forgot password?</Link>{verificationRequired && <Link href="/resend-verification">Resend verification email</Link>}</> : <Link href="/login">Back to log in</Link>}
      </nav>
      {['forgot-password', 'resend'].includes(mode) && <p className="hint email-note">Emails may take a few minutes. Check your spam folder. You can request another link after one minute.</p>}
    </section>
  </main>;
}
