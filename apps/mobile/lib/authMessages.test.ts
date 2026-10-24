import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authMessage, LOGIN_LOCKED } from './authMessages.ts';

test('known codes map to friendly wording; unknown ones use the fallback and never leak raw text', () => {
  assert.equal(authMessage({ code: 'invalid_credentials', message: 'raw' }, 'x'), 'Email or password is incorrect.');
  assert.equal(authMessage({ code: 'weird', message: 'database exploded: secret' }, 'Try again'), 'Try again');
  assert.equal(authMessage(null, 'Fallback'), 'Fallback');
});
test('the server login lock is recognised under any error code', () => {
  assert.equal(authMessage({ code: 'hook_rejected', message: 'Too many failed attempts. Please wait 15 minutes or reset your password.' }, 'x'), LOGIN_LOCKED);
  assert.equal(authMessage({ message: 'Too many failed attempts.' }, 'x'), LOGIN_LOCKED);
});
