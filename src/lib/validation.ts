export class InputError extends Error {}

export function emailValue(value: unknown): string {
  if (typeof value !== 'string') throw new InputError('Enter your email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.');
  return email;
}

export function passwordValue(value: unknown, strong = true): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new InputError('Enter a password of at most 128 characters.');
  if (strong && (value.length < 12 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value))) throw new InputError('Use 12–128 characters, with an uppercase letter, a lowercase letter and a number.');
  return value;
}

export function confirmationValues(data: Record<string, unknown>) {
  if (typeof data.token_hash !== 'string' || !/^[a-f0-9]{32,256}$/i.test(data.token_hash) || !['email', 'recovery'].includes(String(data.type))) throw new InputError('This email link is incomplete. Request a new link.');
  return { token_hash: data.token_hash, type: data.type as 'email' | 'recovery' };
}

export function sameOrigin(origin: string | null, expected: string) {
  return origin === expected;
}
