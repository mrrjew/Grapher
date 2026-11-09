import 'server-only';

/** Temporary opt-out must be explicit. Supabase's Confirm email setting must match. */
export function emailVerificationRequired() {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== 'false';
}
