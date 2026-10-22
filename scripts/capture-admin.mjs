import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.ADMIN_URL ?? 'http://localhost:5173';
const output = resolve('docs/visual-validation/admin');
const pages = ['dashboard', 'promos', 'rewards', 'redemptions', 'referrals', 'reviews', 'gallery', 'protection', 'shop-products', 'push', 'settings'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const results = [];

try {
  await mkdir(output, { recursive: true });
  for (const width of [1365, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => sessionStorage.setItem('soflo_admin_token', 'visual-check'));
    await context.route('http://localhost:3000/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const body = path === '/admin/dashboard' ? { users: 42, bookingsThisWeek: 8, pointsIssued: 12500, activePromos: 2 } : path === '/admin/settings' ? { shop_address: 'SoFlo Suds', shop_phone: '305-555-0100', shop_email: 'shop@example.invalid' } : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    for (const name of pages) {
      if (width === 390) await page.locator('#mobile-admin-page').selectOption(name);
      else await page.locator(`.nav-list .nav`).filter({ hasText: ({ dashboard: 'Dashboard', promos: 'Promo codes', rewards: 'Loyalty & rewards', redemptions: 'Redemptions', referrals: 'Referrals', reviews: 'Reviews', gallery: 'Gallery', protection: 'Protection records', 'shop-products': 'Shop products', push: 'Push', settings: 'Settings' })[name] }).click();
      await page.waitForTimeout(350);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, title: document.querySelector('main h1')?.textContent?.trim() }));
      await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: true });
      results.push({ width, name, ...layout, errors: [...errors] });
      if (layout.scrollWidth > width || errors.length) throw new Error(`Admin visual check failed: ${name} ${width}: ${JSON.stringify({ layout, errors })}`);
      if (name === 'gallery') {
        await page.getByRole('button', { name: 'Add new' }).click();
        await page.getByRole('dialog').waitFor();
        await page.screenshot({ path: resolve(output, `gallery-form-${width}.png`) });
        await page.getByRole('dialog').getByRole('button', { name: 'Save' }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `gallery-form-bottom-${width}.png`) });
        await page.getByRole('button', { name: 'Close' }).click();
      }
    }
    await context.close();
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Checked ${results.length} admin views and two gallery forms.`);
} finally {
  await browser.close();
}
