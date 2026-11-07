import { AuthForm } from '@/components/auth-form';
import { configured } from '@/lib/config';
import { confirmationValues } from '@/lib/validation';
import Link from 'next/link';

export default async function Confirm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  let values;
  try { values = confirmationValues(params); } catch { /* Show a safe message; never consume links on GET. */ }
  return <main id="main" className="narrow-page"><p className="section-label">Email confirmation</p><h1>{values?.type === 'recovery' ? 'Reset your password' : 'Confirm your email'}</h1>{values ? <><p>Continue to use this email link. The link can only be used once.</p><AuthForm mode="confirm" tokenHash={values.token_hash} tokenType={values.type} disabled={!configured()} /></> : <p role="alert">This link is incomplete. Request a new email link.</p>}<nav className="auth-links" aria-label="Email help"><Link href="/forgot-password">Request a password reset</Link><Link href="/resend-verification">Request email verification</Link><Link href="/login">Back to log in</Link></nav></main>;
}
