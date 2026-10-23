import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeForDeepLink } from './pushRouting.ts';

test('known deep links map to app routes', () => {
  assert.equal(routeForDeepLink('/bookings/abc123'), '/booking-detail?id=abc123');
  assert.equal(routeForDeepLink('/review/abc_1-2'), '/review?id=abc_1-2');
  assert.equal(routeForDeepLink('/rewards'), '/rewards');
  assert.equal(routeForDeepLink('/bookings'), '/bookings');
});
test('anything else is ignored', () => {
  for (const bad of [undefined, null, 42, '', '/admin', 'https://evil.example', '/bookings/a/b', '/bookings/a?x=1', '/review/<script>', '/../etc'])
    assert.equal(routeForDeepLink(bad), null, String(bad));
});
