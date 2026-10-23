import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateFor, isOutdated } from './system.ts';

test('version comparison', () => {
  assert.equal(isOutdated('1.0.0', '1.0.1'), true);
  assert.equal(isOutdated('1.0.0', '1.0.0'), false);
  assert.equal(isOutdated('1.2', '1.10.0'), true);
  assert.equal(isOutdated('2.0.0', '1.9.9'), false);
});
test('blank or malformed minimums never block', () => {
  for (const min of [undefined, null, '', 'abc', '1.x']) assert.equal(isOutdated('1.0.0', min), false);
});
test('maintenance wins over forced update; blank message is up', () => {
  assert.equal(gateFor({ maintenanceMessage: 'Back soon', minAppVersion: '9.0.0' }, '1.0.0'), 'maintenance');
  assert.equal(gateFor({ maintenanceMessage: '   ', minAppVersion: '9.0.0' }, '1.0.0'), 'update');
  assert.equal(gateFor({ minAppVersion: '1.0.0' }, '1.0.0'), 'ok');
  assert.equal(gateFor(undefined, '1.0.0'), 'ok');
});
