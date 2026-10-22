import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_APP_URL ?? 'http://localhost:8082';
const output = resolve('docs/visual-validation');
const interactionsOnly = process.env.VISUAL_INTERACTIONS_ONLY === '1';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
const photo = `${baseUrl}/assets/?unstable_path=.%2Fassets%2Fbrand%2Fhero.jpg`;
const interior = `${baseUrl}/assets/?unstable_path=.%2Fassets%2Fbrand%2Finterior.jpg`;
const booking = { id: 'visual-job', serviceName: 'Ceramic Coating', vehicleName: '2024 Porsche 911 Carrera S', scheduledAt: '2026-11-02T15:00:00.000Z', status: 'scheduled', paymentStatus: 'unpaid', location: 'In-shop service' };
const pastBooking = { id: 'visual-past-job', serviceId: 'visual-detail', vehicleId: 'visual-vehicle', serviceName: 'Interior Detailing', vehicleName: '2024 Porsche 911 Carrera S', scheduledAt: '2026-08-03T15:00:00.000Z', status: 'completed', paymentStatus: 'paid', location: 'In-shop service' };
const fixtures = {
  '/me': { id: 'visual', name: 'Marco Visual', email: 'visual@example.invalid', points: 850 },
  '/config': {},
  '/services': [
    { id: 'visual-service', name: 'Paint Protection Film', category: 'Protection', description: 'Clear protection for paintwork.', priceCents: 129900 },
    { id: 'visual-detail', name: 'Interior Detailing', category: 'Detailing', description: 'Careful interior cleaning.', priceCents: 24900 },
  ],
  '/bookings': [booking, pastBooking], '/bookings/visual-job': booking, '/bookings/visual-past-job': pastBooking,
  '/vehicles': [{ id: 'visual-vehicle', name: '2024 Porsche 911 Carrera S', year: 2024, make: 'Porsche', model: '911 Carrera S', color: 'Jet Black' }, { id: 'visual-bmw', name: '2023 BMW X7', year: 2023, make: 'BMW', model: 'X7', color: 'Black' }],
  '/rewards': { points: 850, rewards: [{ id: 'visual-reward', name: '$25 service credit', pointsCost: 1000, description: 'Use on your next visit.' }], activity: [], redemptions: [], referralCode: 'SOFLO1' },
  '/protection': [{ id: 'visual-record', vehicleId: 'visual-vehicle', vehicleName: '2024 Porsche 911 Carrera S', serviceName: 'Ceramic Coating', appliedOn: '2026-09-01', product: 'Feynlab Ceramic', coverage: '5 years', expiresOn: '2031-09-01' }],
  '/gallery': [{ id: 'visual-gallery', title: 'Fresh finish', caption: 'Careful finish for a premium vehicle.', tag: 'Detailing', beforeUrl: photo, afterUrl: interior }],
  '/reviews': [{ id: 'visual-review', rating: 5, body: 'The team took great care of my car.', customerName: 'Customer', createdAt: '2026-10-01' }],
  '/shop/products': [{ id: 'visual-product', name: 'Premium care kit', brand: 'SoFlo Suds', category: 'Care', priceCents: 3500, imageUrl: interior }],
  '/payments': [{ id: 'visual-payment', status: 'paid', totalCents: 25000, jobIds: ['visual-job'] }],
};

const routes = [
  ['home', '/'], ['services', '/services'], ['booking', '/booking?serviceId=visual-service'],
  ['bookings', '/bookings'], ['booking-detail', '/booking-detail?id=visual-job'],
  ['vehicles', '/vehicles'], ['vehicle-form', '/vehicle-form'], ['protection', '/protection'],
  ['rewards', '/rewards'], ['gallery', '/gallery'], ['shop', '/shop'], ['profile', '/profile'],
  ['payments', '/payments'], ['notifications', '/notifications'], ['contact', '/contact'],
  ['privacy', '/privacy'], ['edit-profile', '/edit-profile'], ['delete-account', '/delete-account'],
  ['review', '/review?id=visual-job'],
];
const captures390 = new Set(routes.map(([name]) => name));
const captures350 = new Set(['home', 'services', 'rewards', 'shop']);

async function check(page, width, name, path, screenshot) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.trim().length > 40, undefined, { timeout: 60000 });
  await page.waitForTimeout(1200);
  if (name === 'gallery' && width === 390) {
    const comparison = page.getByLabel('Compare before and after photos');
    const box = await comparison.boundingBox();
    if (!box) throw new Error('Gallery comparison control is missing');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();
    const divider = await page.getByTestId('before-after-divider').boundingBox();
    const position = divider ? (divider.x - box.x) / box.width : 0;
    if (position < 0.7 || position > 0.8) throw new Error(`Gallery comparison did not move: ${position}`);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.up();
  }
  const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, textLength: document.body.innerText.trim().length }));
  if (screenshot) {
    const directory = resolve(output, String(width));
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${name}.png`) });
  }
  const result = { width, name, status: response?.status(), ...layout, errors };
  results.push(result);
  if (result.status !== 200 || layout.scrollWidth > width || layout.textLength < (name === 'welcome' ? 20 : 40) || errors.length) {
    throw new Error(`Visual route check failed: ${JSON.stringify(result)}`);
  }
}

try {
  for (const width of interactionsOnly ? [] : [390, 350, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 700 : 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('soflo_access_token', 'visual-check'));
    await context.route('http://localhost:3000/**', async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[path] ?? []) });
    });
    const page = await context.newPage();
    const selected = width === 350 ? routes.filter(([name]) => captures350.has(name)) : routes;
    for (const [name, path] of selected) await check(page, width, name, path, width === 390 ? captures390.has(name) : width === 350);
    await context.close();
  }
  const interactionContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await interactionContext.addInitScript(() => localStorage.setItem('soflo_access_token', 'visual-check'));
  await interactionContext.route('http://localhost:3000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'PATCH' && path === '/me' ? { ...fixtures['/me'], ...JSON.parse(route.request().postData() ?? '{}') } : fixtures[path] ?? [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const interactionPage = await interactionContext.newPage();
  const interactionErrors = [];
  interactionPage.on('pageerror', error => interactionErrors.push(error.message));
  interactionPage.on('console', message => { if (message.type() === 'error') interactionErrors.push(message.text()); });
  await interactionPage.goto(`${baseUrl}/services`, { waitUntil: 'domcontentloaded' });
  await interactionPage.getByText('Paint Protection Film').first().click();
  await interactionPage.getByText(/Book this service/).waitFor();
  await interactionPage.waitForTimeout(500);
  await interactionPage.screenshot({ path: resolve(output, '390', 'service-detail.png') });
  await interactionPage.getByText(/Book this service/).click();
  await interactionPage.getByText(/Choose a time/).waitFor();
  await interactionPage.getByText(/Choose a time/).click();
  await interactionPage.waitForTimeout(1200);
  await interactionPage.getByText(/Open secure booking/).waitFor();
  await interactionPage.screenshot({ path: resolve(output, '390', 'booking-checkout-handoff.png') });
  await interactionPage.goto(`${baseUrl}/bookings`, { waitUntil: 'domcontentloaded' });
  await interactionPage.getByText('Past', { exact: true }).click();
  await interactionPage.getByText('Interior Detailing').waitFor();
  await interactionPage.screenshot({ path: resolve(output, '390', 'bookings-past.png') });
  await interactionPage.goto(`${baseUrl}/vehicles`, { waitUntil: 'domcontentloaded' });
  await interactionPage.getByText('BMW X7').first().click();
  await interactionPage.screenshot({ path: resolve(output, '390', 'vehicles-selected.png') });
  await interactionPage.getByText(/Book for this vehicle/).click();
  await interactionPage.getByText('Paint Protection Film').first().click();
  await interactionPage.getByText(/Book this service/).click();
  await interactionPage.getByRole('button', { name: 'Choose vehicle' }).getByText('2023 BMW X7').waitFor();
  await interactionPage.screenshot({ path: resolve(output, '390', 'booking-selected-vehicle.png') });
  await interactionPage.goto(`${baseUrl}/edit-profile`, { waitUntil: 'domcontentloaded' });
  await interactionPage.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === 'Marco Visual'));
  await interactionPage.screenshot({ path: resolve(output, '390', 'edit-profile-loaded.png') });
  await interactionPage.goto(`${baseUrl}/shop`, { waitUntil: 'domcontentloaded' });
  await interactionPage.getByPlaceholder('Search products').fill('not in catalog');
  await interactionPage.getByText('No matching products').waitFor();
  await interactionPage.screenshot({ path: resolve(output, '390', 'shop-no-results.png') });
  await interactionPage.getByText('Clear filters').click();
  await interactionPage.getByText('Premium care kit').waitFor();
  await interactionPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
  const promoPreference = interactionPage.getByRole('checkbox', { name: 'Offers & promotional messages' });
  await promoPreference.click();
  await interactionPage.waitForTimeout(250);
  if (await promoPreference.getAttribute('aria-checked') !== 'true') throw new Error(`Promotional notification preference did not update: ${await promoPreference.evaluate(element => element.outerHTML.slice(0, 700))}`);
  await interactionPage.screenshot({ path: resolve(output, '390', 'notifications-selected.png') });
  if (interactionErrors.length) throw new Error(`App interaction errors: ${interactionErrors.join('; ')}`);
  await interactionContext.close();
  const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await emptyContext.addInitScript(() => localStorage.setItem('soflo_access_token', 'visual-check'));
  await emptyContext.route('http://localhost:3000/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = ['/bookings', '/vehicles', '/shop/products'].includes(path) ? [] : fixtures[path] ?? [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const emptyPage = await emptyContext.newPage();
  await emptyPage.goto(`${baseUrl}/bookings`, { waitUntil: 'domcontentloaded' });
  await emptyPage.getByText('Your next visit starts here.').waitFor();
  await emptyPage.screenshot({ path: resolve(output, '390', 'bookings-empty.png') });
  await emptyPage.goto(`${baseUrl}/vehicles`, { waitUntil: 'domcontentloaded' });
  await emptyPage.getByText('Your garage is ready').waitFor();
  await emptyPage.screenshot({ path: resolve(output, '390', 'vehicles-empty.png') });
  await emptyContext.close();
  if (!interactionsOnly) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const [name, path] of [['welcome', '/welcome'], ['login', '/login'], ['signup', '/signup'], ['forgot', '/forgot'], ['reset', '/reset?token=visual-token']]) {
      await check(page, 390, name, path, true);
    }
    await context.close();
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(`Checked ${results.length} screens; no overflow or browser errors.`);
  } else {
    console.log('Checked app interactions.');
  }
} finally {
  await browser.close();
}
