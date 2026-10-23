import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const { env } = JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8')).build.preview;
const projectRef = new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const baseUrl = process.env.QA_APP_URL ?? 'http://localhost:8082';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
let checks = 0;
const session = {
  access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'qa-user', aud: 'authenticated', role: 'authenticated', email: 'qa@example.test',
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
  key: `sb-${projectRef}-auth-token`, session,
});
await context.route('**/functions/v1/soflo-api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.split('/soflo-api')[1];
  let body;
  if (path === '/me') body = { id: 'qa-user', name: 'QA Customer', email: 'qa@example.test', points: 0 };
  else if (path === '/services') body = [{ id: 's1', name: 'Interior Detailing', category: 'Detailing', priceCents: 17500 }];
  else if (path === '/vehicles') body = [{ id: 'v1', name: '2024 Porsche 911', year: 2024, make: 'Porsche', model: '911' }];
  else if (path === '/bookings/handoff' && request.method() === 'POST') body = { attemptId: '11111111-1111-4111-8111-111111111111', expiresAt: new Date(Date.now() + 3600000).toISOString() };
  else if (path.startsWith('/bookings/handoff/')) body = ++checks === 1 ? { state: 'pending' } : {
    state: 'matched', booking: { id: 'job-qa', serviceName: 'Interior Detailing', vehicleName: '2024 Porsche 911', status: 'scheduled', paymentStatus: 'unpaid', scheduledAt: new Date(Date.now() + 86400000).toISOString() },
  };
  else body = [];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
await context.route('**/auth/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/user') ? session.user : session) });
});
await context.route('**/rest/v1/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

try {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto(`${baseUrl}/booking?serviceId=s1`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.getByText('2024 Porsche 911').first().waitFor({ timeout: 30000 });
  await page.getByText('Choose a time  →', { exact: true }).click();
  await page.getByText(/Open secure booking/).waitFor();
  await page.getByText('Close', { exact: true }).click();
  await page.getByText('checking Urable for your appointment').waitFor();
  await page.getByText('Check again').click();
  await page.getByText('Booking found').waitFor();
  await page.getByText('Payment: unpaid').waitFor();
  assert.deepEqual(errors, []);
  console.log('Booking web QA passed: start handoff → checkout → pending → matched (unpaid shown honestly).');
} finally {
  await context.close();
  await browser.close();
}
