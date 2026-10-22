import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.CONCEPT_URL ?? 'http://localhost:8099/soflo.html';
const output = resolve('docs/visual-validation/concept-live');
const routes = ['home', 'services', 'booking', 'garage', 'appointments', 'rewards', 'referrals', 'shop', 'notifications', 'account', 'history', 'payments'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const results = [];

try {
  await mkdir(output, { recursive: true });
  for (const width of [390, 350]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 760 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const name of routes) {
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on('pageerror', onError);
      const response = await page.goto(`${baseUrl}#${name}`, { waitUntil: 'networkidle' });
      await page.locator('#main h1').first().waitFor();
      const metrics = await page.evaluate(() => {
        const box = selector => { const element = document.querySelector(selector); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; };
        return { title: document.querySelector('#main h1')?.textContent?.trim(), scrollWidth: document.documentElement.scrollWidth, header: box('#header'), main: box('#main'), titleBox: box('#main h1'), dock: box('#bottom-nav') };
      });
      const directory = resolve(output, String(width));
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
      results.push({ width, name, status: response?.status(), ...metrics, errors });
      page.off('pageerror', onError);
    }
    await context.close();
  }
  const interactionContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(`${baseUrl}#services`, { waitUntil: 'networkidle' });
  await interactionPage.locator('[data-action^="service:"]').first().click();
  await interactionPage.screenshot({ path: resolve(output, '390', 'service-detail.png') });
  await interactionPage.goto(`${baseUrl}#booking`, { waitUntil: 'networkidle' });
  await interactionPage.reload({ waitUntil: 'networkidle' });
  await interactionPage.locator('[data-action="booking-next"]').click();
  await interactionPage.screenshot({ path: resolve(output, '390', 'booking-location.png'), fullPage: true });
  await interactionPage.locator('.calendar-day.available:not([disabled])').first().click();
  await interactionPage.locator('.time-slot.available-slot:not([disabled])').first().click();
  await interactionPage.locator('#booking-address').fill('Miami, FL');
  await interactionPage.locator('[data-action="booking-next"]').click();
  await interactionPage.screenshot({ path: resolve(output, '390', 'booking-review.png'), fullPage: true });
  await interactionPage.goto(`${baseUrl}#garage`, { waitUntil: 'networkidle' });
  await interactionPage.reload({ waitUntil: 'networkidle' });
  await interactionPage.locator('[data-action="vehicle:1"]').click();
  await interactionPage.screenshot({ path: resolve(output, '390', 'garage-selected.png'), fullPage: true });
  await interactionContext.close();
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Captured ${results.length} live concept routes.`);
} finally {
  await browser.close();
}
