/**
 * Captures every route at desktop, laptop and phone widths with a real Chromium,
 * plus the calculator before and after an edit.
 *
 * Run:  bun scripts/screenshots.ts [--base http://127.0.0.1:4181] [--out <dir>] [--tag <label>] [--insecure] [--widths 1440,1024,390]
 * Default output: ./screenshots (gitignored).
 *
 * Reduced motion is requested so the capture shows the settled page, not a
 * frame mid-animation. Fonts are awaited before every capture. A document wider
 * than the viewport or any console error fails the run.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const base = arg('base', 'http://127.0.0.1:4181').replace(/\/$/, '');
const out = arg('out', join(process.cwd(), 'screenshots'));
const insecure = args.includes('--insecure');
const tag = arg('tag', 'halvard-wis');
const widths = arg('widths', '1440,1024,390').split(',').map((w) => Number(w));

const pages = [
  { path: '/', name: 'overview' },
  { path: '/capacity', name: 'capacity' },
  { path: '/aging', name: 'aging' },
  { path: '/replenishment', name: 'replenishment' },
  { path: '/cost', name: 'cost' },
  { path: '/calculator?v=cooling', name: 'calculator' },
  { path: '/inbound', name: 'inbound' },
  { path: '/data-basis', name: 'data-basis' },
  { path: '/g/air-handling-unit-sections', name: 'group-air-handling-unit-sections' },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of widths) {
    const mobile = width < 700;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', ignoreHTTPSErrors: insecure, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const p of pages) {
      await page.goto(`${base}${p.path}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForSelector('section.sec', { timeout: 15000 });
      await page.waitForTimeout(400);
      const docW = await page.evaluate(() => document.documentElement.scrollWidth);
      if (docW > width) {
        console.error(`Document width ${docW}px exceeds viewport ${width}px on ${p.path}`);
        process.exitCode = 1;
      }
      await page.screenshot({ path: join(out, `${tag} ${p.name} ${width}.png`), fullPage: false });
      await page.screenshot({ path: join(out, `${tag} ${p.name} ${width} full.png`), fullPage: true });
      console.log(`wrote ${p.name} at ${width}`);
      if (p.name === 'calculator') {
        /* the edit: add 200 units to the first row, capture, then reset */
        const qty = page.locator('#calc-table tbody tr').first().locator('input[data-field="q"]');
        const before = await qty.inputValue();
        await qty.fill(String(Number(before) + 200));
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(out, `${tag} calculator edited ${width}.png`), fullPage: false });
        await page.screenshot({ path: join(out, `${tag} calculator edited ${width} full.png`), fullPage: true });
        console.log(`wrote calculator edited at ${width}`);
        await page.locator('#calc-reset').click();
      }
    }
    await context.close();
    if (errors.length) {
      console.error(`Console errors at ${width}:`);
      for (const e of errors) console.error('  ' + e);
      process.exitCode = 1;
    } else {
      console.log(`No console errors at ${width}.`);
    }
  }
} finally {
  await browser.close();
}
