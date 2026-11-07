import { describe, expect, it } from 'vitest';
import { confirmationValues, emailValue, passwordValue, sameOrigin } from '@/lib/validation';

describe('authentication input boundaries', () => {
  it('normalizes email identity for authentication and throttling', () => {
    expect(emailValue('  STUDENT@University.edu ')).toBe('student@university.edu');
  });
  it.each(['', 'a@b', '<student>', 'a b@university.edu', null, 2, 'a'.repeat(255) + '@u.edu'])('rejects invalid email %s', (email) => {
    expect(() => emailValue(email)).toThrow();
  });
  it.each(['shortA1', 'longpassword1', 'LONGPASSWORD1', 'LongPassword', 'X'.repeat(129) + 'a1'])('rejects weak or overlong new passwords', (password) => {
    expect(() => passwordValue(password)).toThrow();
  });
  it('accepts a strong passphrase, preserves spaces and permits older login passwords', () => {
    expect(passwordValue('Useful Lab Notes 17')).toBe('Useful Lab Notes 17');
    expect(passwordValue('old', false)).toBe('old');
  });
  it('only accepts known confirmation types and bounded token hashes', () => {
    expect(confirmationValues({ token_hash: 'a'.repeat(64), type: 'recovery' }).type).toBe('recovery');
    for (const data of [{ token_hash: 'token', type: 'email' }, { token_hash: 'a'.repeat(64), type: 'invite' }, { token_hash: ['a'.repeat(64)], type: 'email' }]) expect(() => confirmationValues(data)).toThrow();
  });
  it('rejects missing, lookalike and cross-origin mutation origins', () => {
    for (const value of [null, 'https://example.edu.evil.test', 'http://example.edu', 'null']) expect(sameOrigin(value, 'https://example.edu')).toBe(false);
    expect(sameOrigin('https://example.edu', 'https://example.edu')).toBe(true);
  });
});
