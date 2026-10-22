import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_APP_URL ?? 'http://localhost:8082';
const output = resolve('docs/visual-validation');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
const photo = `${baseUrl}/assets/?unstable_path=.%2Fassets%2Fbrand%2Fhero.jpg`;
const interior = `${baseUrl}/assets/?unstable_path=.%2Fassets%2Fbrand%2Finterior.jpg`;
const booking = { id: 'visual-job', serviceName: 'Ceramic Coating', vehicleName: '2024 Porsche 911 Carrera S', scheduledAt: '2026-11-02T15:00:00.000Z', status: 'scheduled', paymentStatus: 'unpaid', location: 'In-shop service' };
const fixtures = {
  '/me': { id: 'visual', name: 'Marco Visual', email: 'visual@example.invalid', points: 850 },
  '/config': {},
  '/services': [
    { id: 'visual-service', name: 'Paint Protection Film', category: 'Protection', description: 'Clear protection for paintwork.', priceCents: 129900 },
    { id: 'visual-detail', name: 'Interior Detailing', category: 'Detailing', description: 'Careful interior cleaning.', priceCents: 24900 },
  ],
  '/bookings': [booking], '/bookings/visual-job': booking,
  '/vehicles': [{ id: 'visual-vehicle', name: '2024 Porsche 911 Carrera S', year: 2024, make: 'Porsche', model: '911 Carrera S', color: 'Jet Black' }],
  '/rewards': { points: 850, rewards: [{ id: 'visual-reward', name: '$25 service credit', pointsCost: 1000, description: 'Use on your next visit.' }], activity: [], redemptions: [], referralCode: 'SOFLO1' },
  '/protection': [{ id: 'visual-record', vehicleName: '2024 Porsche 911 Carrera S', serviceName: 'Ceramic Coating', appliedOn: '2026-09-01', product: 'Feynlab Ceramic', coverage: '5 years', expiresOn: '2031-09-01' }],
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
const captures390 = new Set(['home', 'services', 'booking', 'bookings', 'protection', 'rewards', 'gallery', 'shop', 'profile', 'vehicles']);
const captures350 = new Set(['home', 'services', 'rewards', 'shop']);

async function check(page, width, name, path, screenshot) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, textLength: document.body.innerText.trim().length }));
  if (screenshot) {
    const directory = resolve(output, String(width));
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${name}.png`) });
  }
  const result = { width, name, status: response?.status(), ...layout, errors };
  results.push(result);
  if (result.status !== 200 || layout.scrollWidth > width || layout.textLength < 40 || errors.length) {
    throw new Error(`Visual route check failed: ${JSON.stringify(result)}`);
  }
}

try {
  for (const width of [390, 350, 320]) {
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const [name, path] of [['welcome', '/welcome'], ['login', '/login'], ['signup', '/signup'], ['forgot', '/forgot'], ['reset', '/reset?token=visual-token']]) {
    await check(page, 390, name, path, true);
  }
  await context.close();
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Checked ${results.length} screens; no overflow or browser errors.`);
} finally {
  await browser.close();
}
