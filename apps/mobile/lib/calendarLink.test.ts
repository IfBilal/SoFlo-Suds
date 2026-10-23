import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarUrl } from './calendarLink.ts';

test('builds a calendar link with UTC start/end and the service in the title', () => {
  const url = new URL(calendarUrl({ serviceName: 'Detail Reset', vehicleName: '2020 Honda Civic', scheduledAt: '2027-03-05T15:00:00.000Z', location: '1 Main St' })!);
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('text'), 'SoFlo Suds: Detail Reset');
  assert.equal(url.searchParams.get('dates'), '20270305T150000Z/20270305T160000Z');
  assert.equal(url.searchParams.get('location'), '1 Main St');
  assert.match(url.searchParams.get('details') ?? '', /Civic/);
});
test('no usable date means no link', () => {
  assert.equal(calendarUrl({ serviceName: 'x' }), null);
  assert.equal(calendarUrl({ serviceName: 'x', scheduledAt: 'not a date' }), null);
});
