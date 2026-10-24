import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setup } from './helpers.ts';

let t: Awaited<ReturnType<typeof setup>>;
before(async () => { t = await setup(); });
after(async () => { await t.stop(); });
const login = (email: string, password: string, ip = '203.0.113.7') => t.call('POST', '/auth/login', { body: { email, password }, headers: { 'x-forwarded-for': ip + ', 10.0.0.1' } });

describe('POST /auth/login (handbook 6 and 7)', () => {
  test('a correct login returns the session tokens and needs no token', async () => {
    const r = await login('A@T.test', 'right-password');
    assert.equal(r.status, 200); assert.equal(r.json.access_token, 'acc'); assert.equal(r.json.refresh_token, 'ref');
  });
  test('wrong password is a 401 with our wording; bad input is a 400; unconfirmed and unexpected failures are told apart', async () => {
    const bad = await login('a@t.test', 'nope'); assert.equal(bad.status, 401); assert.equal(bad.json.error.code, 'INVALID_CREDENTIALS');
    assert.equal((await t.call('POST', '/auth/login', { body: { email: 'not-an-email', password: 'x' } })).status, 400);
    assert.equal((await login('unconfirmed@t.test', 'x')).json.error.code, 'EMAIL_NOT_CONFIRMED');
    assert.equal((await login('broken@t.test', 'x')).json.error.code, 'AUTH_FAILED');
  });
  test('the 6th failed attempt in 15 minutes from the same IP is refused, even with the right password', async () => {
    await t.sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 5; i++) assert.equal((await login('a@t.test', 'wrong' + i, '198.51.100.1')).status, 401);
    const locked = await login('a@t.test', 'right-password', '198.51.100.1');
    assert.equal(locked.status, 429); assert.equal(locked.json.error.code, 'LOGIN_RATE_LIMITED');
  });
  test('another IP is not locked by that, and a success clears that IP\'s failures', async () => {
    assert.equal((await login('a@t.test', 'right-password', '198.51.100.2')).status, 200);
    await t.sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 3; i++) await login('a@t.test', 'wrong', '198.51.100.3');
    assert.equal((await login('a@t.test', 'right-password', '198.51.100.3')).status, 200);
    assert.equal((await t.sql`SELECT count(*)::int AS n FROM login_attempts WHERE email='a@t.test' AND ip='198.51.100.3'`)[0].n, 0);
  });
  test('rotating IPs does not help: 20 failures on one email lock it everywhere', async () => {
    await t.sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 20; i++) await t.sql`INSERT INTO login_attempts (email, ip) VALUES ('a@t.test', ${'192.0.2.' + i})`;
    assert.equal((await login('a@t.test', 'right-password', '192.0.2.200')).status, 429);
  });
  test('failures older than 15 minutes no longer count', async () => {
    await t.sql`UPDATE login_attempts SET at = now() - interval '16 minutes'`;
    assert.equal((await login('a@t.test', 'right-password', '192.0.2.201')).status, 200);
  });
});
