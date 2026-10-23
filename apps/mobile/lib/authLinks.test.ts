import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkProblem } from './authLinks.ts';

test('a link with a code is usable', () => assert.equal(linkProblem({ code: 'abc' }), null));
test('expired, errored and empty links explain themselves', () => {
  assert.match(linkProblem({ error: 'access_denied', error_code: 'otp_expired' }) ?? '', /expired/);
  assert.match(linkProblem({ error: 'access_denied' }) ?? '', /not valid/);
  assert.match(linkProblem({}) ?? '', /incomplete/);
});
