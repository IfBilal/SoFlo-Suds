import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authMessage, loginErrorMessage, LOGIN_LOCKED } from './authMessages.ts';

test('known codes map to friendly wording; unknown ones use the fallback and never leak raw text', () => {
  assert.equal(authMessage({ code: 'invalid_credentials', message: 'raw' }, 'x'), 'Email or password is incorrect.');
  assert.equal(authMessage({ code: 'weird', message: 'database exploded: secret' }, 'Try again'), 'Try again');
  assert.equal(authMessage(null, 'Fallback'), 'Fallback');
});
test('the server login lock is recognised under any error code', () => {
  assert.equal(authMessage({ code: 'hook_rejected', message: 'Too many failed attempts. Please wait 15 minutes or reset your password.' }, 'x'), LOGIN_LOCKED);
  assert.equal(authMessage({ message: 'Too many failed attempts.' }, 'x'), LOGIN_LOCKED);
});
test('login endpoint codes map to friendly wording', () => {
  assert.equal(loginErrorMessage('LOGIN_RATE_LIMITED'), LOGIN_LOCKED);
  assert.equal(loginErrorMessage('INVALID_CREDENTIALS'), 'Email or password is incorrect.');
  assert.match(loginErrorMessage('EMAIL_NOT_CONFIRMED'), /confirm your email/);
  assert.equal(loginErrorMessage('SOMETHING_NEW'), 'Could not log in. Please try again.');
  assert.equal(loginErrorMessage(undefined), 'Could not log in. Please try again.');
});
