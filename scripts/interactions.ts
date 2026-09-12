/**
 * Interaction, keyboard, structure and resilience gate, run against a served build.
 *
 * Run:  bun scripts/interactions.ts [--base http://127.0.0.1:4181] [--out <dir>] [--insecure]
 *
 * Every check prints PASS or FAIL with its evidence. Exit code 1 on any failure.
 * The alignment gate is proven with a negative control: a cell is removed in
 * browser memory and the gate must report it. The calculator checks compute
 * the expected figures from what the page displays and from data/cbm.ts, so
 * a wrong live figure is caught against the rule, not against a snapshot.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { r2, totalCbm, utilPct } from '../data/cbm';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const base = arg('base', 'http://127.0.0.1:4181').replace(/\/$/, '');
const out = arg('out', join(process.cwd(), 'screenshots'));
const insecure = args.includes('--insecure');
mkdirSync(out, { recursive: true });

const results: { ok: boolean; what: string }[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  results.push({ ok, what });
};
const num = (s: string) => Number(s.replace(/[^\d.\-−]/g, '').replace('−', '-'));

/** Every logical column of a table must have a cell under it, and spanning cells must end where their last header ends. */
const ALIGN_FN = `(sel) => {
  const table = document.querySelector(sel);
  if (!table) return { out: ['no table'], rows: 0, cols: 0 };
  const ths = Array.from(table.querySelectorAll('thead tr:last-child th, thead tr:last-child td'));
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const out = [];
  for (const row of rows) {
    const cells = Array.from(row.children);
    let col = 0;
    for (const cell of cells) {
      const span = cell.colSpan || 1;
      const first = ths[col];
      const last = ths[col + span - 1];
      if (!first || !last) { out.push('row ' + rows.indexOf(row) + ' overflows headers at col ' + col); break; }
      const a = first.getBoundingClientRect();
      const z = last.getBoundingClientRect();
      const b = cell.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 0.5) out.push('row ' + rows.indexOf(row) + ' col ' + col + ' left off by ' + (b.left - a.left).toFixed(1));
      if (Math.abs(z.right - b.right) > 0.5) out.push('row ' + rows.indexOf(row) + ' col ' + col + ' right off by ' + (b.right - z.right).toFixed(1));
      col += span;
    }
    if (col !== ths.length) out.push('row ' + rows.indexOf(row) + ' covers ' + col + ' of ' + ths.length + ' columns');
  }
  return { out, rows: rows.length, cols: ths.length };
}`;
async function alignment(page: Page, sel: string) {
  return page.evaluate(`(${ALIGN_FN})(${JSON.stringify(sel)})`) as Promise<{ out: string[]; rows: number; cols: number }>;
}

const browser = await chromium.launch();
const errors: string[] = [];
let expectMissing = false;
let expected404 = 0;
async function newPage(width: number, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: insecure, reducedMotion });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectMissing && /404|500/.test(m.text())) {
      expected404++;
      return;
    }
    errors.push(`[${width}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${width}] ${String(e)}`));
  return { context, page };
}

interface RollupLite {
  site: { capacityCbm: number };
  total: { totalCbm: number; utilPct: number };
  replenishment: { counts: { below: number } };
  overview: { needsOrder: unknown[] };
  calculator: { slug: string; allocatedCbm: number; totalCbm: number; rows: { slug: string; unitCbm: number; quantity: number; totalCbm: number }[] }[];
}

try {
  const { context, page } = await newPage(1440);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('#value table.mis');
  await page.waitForTimeout(1200);
  const rollup = (await page.evaluate(async () => (await fetch('/data/rollup.json')).json())) as RollupLite;

  /* 1. document width never exceeds the viewport */
  for (const w of [1440, 1024, 390]) {
    const { context: c2, page: p2 } = await newPage(w);
    await p2.goto(`${base}/`, { waitUntil: 'networkidle' });
    await p2.waitForSelector('#value table.mis');
    const docW = await p2.evaluate(() => document.documentElement.scrollWidth);
    check(docW <= w, `Overview document width at ${w}px is ${docW}px`);
    await c2.close();
  }

  /* 2. the five questions are on one screen, in order */
  const blocks = await page.evaluate(() => Array.from(document.querySelectorAll('.overview-grid section.sec')).map((s) => s.id));
  check(blocks.join(',') === 'value,space,cost,aging,runout', `Overview carries the five question blocks in order (${blocks.join(', ')})`);
  for (const w of [1440, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const bottom = await page.evaluate(() => Math.round(document.querySelector('#answers')!.getBoundingClientRect().bottom));
    const cells = await page.locator('#answers > div').count();
    check(cells === 5 && bottom <= 900, `The five answers sit within the first screen at ${w}px (${cells} answers, bottom at ${bottom}px)`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const navSecond = (await page.locator('nav.nav a').nth(1).innerText()).trim();
  check(navSecond === 'CBM calculator', `The calculator is the second report in the navigation (${navSecond})`);
  const listRows = await page.locator('#runout tbody tr').count();
  const listBelow = await page.locator('#runout .tag.hz').count();
  check(listRows === rollup.overview.needsOrder.length && listBelow === rollup.replenishment.counts.below, `The run-out list shows every group needing an order (${listRows} rows, ${listBelow} below their reorder point)`);
  for (const w of [1440, 1024, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const sizes = await page.evaluate(() => [getComputedStyle(document.querySelector('.wordmark')!).fontSize, getComputedStyle(document.querySelector('.mast-system')!).fontSize]);
    check(sizes[0] === sizes[1], `Masthead wordmark and system title share one size at ${w}px (${sizes[0]})`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* 3. sorting on the value table */
  const values = await page.locator('#value tbody tr:not(.total) td:nth-child(2)').allInnerTexts();
  const desc = values.map(num).every((v, i, a) => i === 0 || v <= a[i - 1]!);
  check(desc, `Overview value rows sort by stock value, largest first (${values[0]} first)`);
  const firstBefore = (await page.locator('#value tbody tr td').first().innerText()).trim();
  await page.locator('#value th[aria-sort] button', { hasText: 'Stock value' }).click();
  await page.waitForTimeout(500);
  const firstAfter = (await page.locator('#value tbody tr td').first().innerText()).trim();
  const sortAttr = await page.locator('#value th[aria-sort="ascending"]').count();
  check(firstAfter !== firstBefore && sortAttr === 1, `Clicking the header flips the sort and sets aria-sort (first row now ${firstAfter})`);
  await page.locator('#value th[aria-sort] button', { hasText: 'Stock value' }).click();

  /* 4. utilisation chart: one bar per stocked vertical, the over-allocation part in hazard */
  const bars = await page.locator('#ov-util rect.vbar:not(.neg)').count();
  const hz = await page.locator('#ov-util rect.vbar.neg').count();
  check(bars >= 8 && hz === 1, `Overview utilisation chart draws ${bars} vertical bars and ${hz} over-allocation mark in hazard`);
  const bandLabel = (await page.locator('#ov-util .fc-zone text').evaluate((el) => el.textContent)) ?? '';
  check(/OPTIMAL 60 TO 80/.test(bandLabel), `The 60 to 80 band is drawn and labelled ("${bandLabel}")`);

  /* 5. real keyboard traversal */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#value table.mis');
  await page.waitForTimeout(800);
  const seq: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    seq.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return 'body';
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}:${label}`;
      }),
    );
  }
  const idx = (re: RegExp) => seq.findIndex((s) => re.test(s));
  const order = [idx(/^a:Space and capacity$/), idx(/button:Sort by Vertical/), idx(/button:Sort by Stock value/), idx(/^a:(Cooling|Electrical|Mechanical)/), idx(/summary:Definitions/)];
  check(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]!)), `Tab reaches nav, sort buttons, vertical links and the definitions disclosure in reading order (${seq.filter((s) => s !== 'body').length} stops)`);
  writeFileSync(join(out, 'tab-sequence.json'), JSON.stringify(seq, null, 1));
  const ring = await page.evaluate(() => {
    const a = document.querySelector('#value a.vlink') as HTMLElement;
    a.focus();
    const cs = getComputedStyle(a);
    return `${cs.outlineStyle} ${cs.outlineWidth}`;
  });
  check(/solid/.test(ring) && !/0px/.test(ring), `Focus ring is visible on links (${ring})`);
  const defs = page.locator('#value details.defs summary');
  await defs.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const defsOpen = await page.locator('#value details.defs').evaluate((el) => (el as HTMLDetailsElement).open);
  const defsRows = await page.locator('#value details.defs dl > div').count();
  check(defsOpen && defsRows >= 3, `Definitions disclosure opens by keyboard with ${defsRows} entries`);

  /* 6. capacity page: alignment with a negative control, projection chart keyboard */
  await page.goto(`${base}/capacity`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#util table.mis');
  await page.waitForTimeout(600);
  for (const w of [1440, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    const a = await alignment(page, '#util table.mis');
    check(a.out.length === 0 && a.rows > 0, `Capacity table cells cover every logical column at ${w}px (${a.rows} rows, ${a.cols} columns${a.out.length ? '; ' + a.out.slice(0, 3).join('; ') : ''})`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const negative = await page.evaluate(`(() => {
    const row = document.querySelector('#util table.mis tbody tr');
    const removed = row.lastElementChild;
    removed.remove();
    const res = (${ALIGN_FN})('#util table.mis');
    row.appendChild(removed);
    return res;
  })()`) as { out: string[] };
  check(negative.out.length > 0, `Alignment gate reports a removed cell (negative control: ${negative.out[0] ?? 'nothing reported'})`);
  const after = await alignment(page, '#util table.mis');
  check(after.out.length === 0, 'Alignment gate passes again once the cell is restored');
  const proj = page.locator('svg#cap-proj');
  await proj.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const readbox = (await proj.locator('.readbox text').first().evaluate((el) => el.textContent)) ?? '';
  check(/OCT 2026/.test(readbox), `Projection chart crosshair moves with arrow keys (read "${readbox}")`);
  const overCells = await page.locator('#projection td.bad').count();
  check(overCells > 0, `Projection table marks ${overCells} month cells over their allocation in red`);

  /* 7. aging page */
  await page.goto(`${base}/aging`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#slow table.mis');
  const slowRows = await page.locator('#slow tbody tr').count();
  check(slowRows === 15, `Slow movers table lists ${slowRows} groups`);
  const ageFirst = (await page.locator('#slow tbody tr td').first().innerText()).trim();
  await page.locator('#slow th[aria-sort] button', { hasText: 'Average age' }).click();
  await page.waitForTimeout(500);
  const ages = (await page.locator('#slow tbody tr td:nth-child(6)').allInnerTexts()).map(num);
  const ageSorted = ages.every((v, i) => i === 0 || v <= ages[i - 1]!);
  check(ageSorted && (await page.locator('#slow th[aria-sort="descending"]').count()) === 1, `Slow movers re-sort by average age, oldest first (was ${ageFirst})`);
  const abcShares = (await page.locator('#abc tbody tr:not(.total) td:nth-child(4)').allInnerTexts()).map(num);
  check(Math.round(abcShares.reduce((a, b) => a + b, 0) * 10) === 1000, `ABC shares on the page sum to 100.0 (${abcShares.join(' + ')})`);

  /* 8. replenishment: every group, status counts match the strip, sticky column on a phone */
  await page.goto(`${base}/replenishment`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#groups table.mis');
  const replRows = await page.locator('#groups tbody tr').count();
  const belowTags = await page.locator('#groups .tag.hz').count();
  check(replRows === rollup.calculator.reduce((a, v) => a + v.rows.length, 0) && belowTags === rollup.replenishment.counts.below, `Replenishment lists ${replRows} groups with ${belowTags} below their reorder point, matching the published counts`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const sticky = await page.evaluate(async () => {
    const box = document.querySelector('#groups .scroll-x') as HTMLElement;
    const first = box.querySelector('tbody td:first-child') as HTMLElement;
    const before = first.getBoundingClientRect().left;
    box.scrollLeft = 400;
    await new Promise((r) => setTimeout(r, 100));
    const afterL = first.getBoundingClientRect().left;
    const scrolled = box.scrollLeft;
    box.scrollLeft = 0;
    return { before, afterL, scrolled };
  });
  check(sticky.scrolled > 0 && Math.abs(sticky.before - sticky.afterL) < 1, `Group name stays in place while the table scrolls ${sticky.scrolled}px on a 390px screen`);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* 9. cost page: the month total column foots */
  await page.goto(`${base}/cost`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#split table.mis');
  const monthCells = (await page.locator('#split tbody tr:not(.total) td:nth-child(10)').allInnerTexts()).map(num);
  const monthTotal = num(await page.locator('#split tbody tr.total td:nth-child(10)').innerText());
  check(monthCells.reduce((a, b) => a + b, 0) === monthTotal, `Cost split rows foot to the month total on the page (${monthTotal})`);
  const cbmCells = (await page.locator('#split tbody tr:not(.total) td:nth-child(2)').allInnerTexts()).map(num);
  const cbmTotal = num(await page.locator('#split tbody tr.total td:nth-child(2)').innerText());
  check(Math.round(cbmCells.reduce((a, b) => a + b, 0) * 100) === Math.round(cbmTotal * 100), `Cost CBM column, including idle capacity, foots to the store capacity on the page (${cbmTotal})`);
  const shareCells = (await page.locator('#split tbody tr:not(.total) td:nth-child(11)').allInnerTexts()).map(num);
  check(Math.round(shareCells.reduce((a, b) => a + b, 0) * 10) === 1000, `Cost share column foots to 100.0 on the page (${shareCells.join(' + ')})`);

  /* 10. the calculator */
  const cooling = rollup.calculator.find((v) => v.slug === 'cooling')!;
  await page.goto(`${base}/calculator?v=cooling`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#calc-table');
  await page.waitForTimeout(400);
  const selected = await page.locator('#calc-vertical').inputValue();
  const totalShown = num(await page.locator('#calc-total').innerText());
  check(selected === 'cooling' && totalShown === cooling.totalCbm, `Calculator opens on the vertical in the address with the published total (${totalShown} CBM)`);
  const row1 = page.locator('#calc-table tbody tr').first();
  const unit = num(await row1.locator('[data-cell="unit"]').innerText());
  const groupBefore = num(await row1.locator('[data-cell="total"]').innerText());
  const qtyInput = row1.locator('input[data-field="q"]');
  const q0 = Number(await qtyInput.inputValue());
  await qtyInput.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(String(q0 + 200));
  await page.waitForTimeout(300);
  const groupAfter = num(await row1.locator('[data-cell="total"]').innerText());
  const expectGroup = totalCbm(unit, q0 + 200);
  check(groupAfter === expectGroup && r2(groupAfter - groupBefore) === r2(unit * 200), `Adding 200 units by keyboard raises the group CBM by unit CBM times 200 (${groupBefore} to ${groupAfter}, +${r2(unit * 200)})`);
  const totalAfter = num(await page.locator('#calc-total').innerText());
  check(r2(totalAfter - totalShown) === r2(groupAfter - groupBefore), `The vertical grand total moves by the same amount (${totalShown} to ${totalAfter})`);
  const utilShown = num(await page.locator('#calc-util').innerText());
  check(utilShown === utilPct(totalAfter, cooling.allocatedCbm), `The vertical utilisation equals the new total over the allocation (${utilShown}%)`);
  const storeShown = num(await page.locator('#calc-store-util').innerText());
  check(storeShown === utilPct(r2(rollup.total.totalCbm - cooling.totalCbm + totalAfter), rollup.site.capacityCbm), `The store utilisation moves by the added CBM over capacity (${rollup.total.utilPct}% to ${storeShown}%)`);
  const delta = (await row1.locator('[data-cell="delta"]').innerText()).trim();
  check(/^\+/.test(delta), `The row shows its change against the published figure (${delta})`);
  const verdict = await page.locator('#calc-verdict').innerText();
  const utilBad = await page.locator('#calc-util.bad').count();
  check(/over its allocation/i.test(verdict) && utilBad === 1, `The page says plainly that the vertical is over its allocation (${verdict.slice(0, 70)})`);
  await page.screenshot({ path: join(out, 'gate calculator edited.png') });

  /* a true decimal half rounds up, and the store total counts edits kept in other verticals */
  await page.locator('#calc-reset').click();
  await page.waitForTimeout(200);
  await row1.locator('input[data-field="l"]').fill('1.13');
  await row1.locator('input[data-field="b"]').fill('1.00');
  await row1.locator('input[data-field="h"]').fill('0.50');
  await qtyInput.fill('100000');
  await page.waitForTimeout(300);
  const halfUnit = num(await row1.locator('[data-cell="unit"]').innerText());
  const halfTotal = num(await row1.locator('[data-cell="total"]').innerText());
  check(halfUnit === 0.57 && halfTotal === 57000, `1.13 x 1.00 x 0.50 rounds up to 0.57 CBM and 100,000 units make 57,000.00 CBM (${halfUnit}, ${halfTotal})`);
  await page.locator('#calc-reset').click();
  await page.waitForTimeout(200);
  await qtyInput.fill(String(q0 + 200));
  await page.waitForTimeout(200);
  await page.locator('#calc-vertical').selectOption('trading');
  await page.waitForTimeout(300);
  const tRow = page.locator('#calc-table tbody tr').first();
  const tUnit = num(await tRow.locator('[data-cell="unit"]').innerText());
  const tQty = tRow.locator('input[data-field="q"]');
  const tq0 = Number(await tQty.inputValue());
  await tQty.fill(String(tq0 + 200));
  await page.waitForTimeout(300);
  const storeBoth = num(await page.locator('#calc-store-util').innerText());
  const expectBoth = utilPct(r2(rollup.total.totalCbm + unit * 200 + tUnit * 200), rollup.site.capacityCbm);
  const storeSub = await page.locator('#calc-store-util + .sub').innerText();
  check(storeBoth === expectBoth && /includes your edits to Cooling/.test(storeSub), `Store utilisation counts edits kept in Cooling while Trading is on screen (${storeBoth}%, expected ${expectBoth}%)`);
  await page.locator('#calc-reset').click();
  await page.locator('#calc-vertical').selectOption('cooling');
  await page.waitForTimeout(300);
  await page.locator('#calc-reset').click();
  await page.waitForTimeout(200);
  /* a breach of a fraction of a cubic metre is still a breach */
  const roomLeft = r2(rollup.site.capacityCbm - rollup.total.totalCbm);
  const breachQty = q0 + Math.ceil((roomLeft + 0.05) / unit);
  await qtyInput.fill(String(breachQty));
  await page.waitForTimeout(300);
  const tinyVerdict = await page.locator('#calc-verdict').innerText();
  const tinyStore = num(await page.locator('#calc-store-util').innerText());
  check(/over capacity/i.test(tinyVerdict), `A breach of under one cubic metre is still called over capacity (store reads ${tinyStore}%; "${tinyVerdict.slice(0, 60)}")`);
  await page.locator('#calc-reset').click();
  await page.waitForTimeout(200);
  await qtyInput.fill(String(q0 + 200));
  await page.waitForTimeout(200);

  /* hostile values: totals hold the last valid value and the field says why */
  const dimInput = row1.locator('input[data-field="l"]');
  const totalHold = num(await page.locator('#calc-total').innerText());
  const cases: [string, RegExp, string][] = [
    ['-5', /cannot be negative/, 'negative'],
    ['abc', /Not a number/, 'non-numeric'],
    ['25', /Above the 20 m limit/, 'absurd'],
    ['', /Enter a length/, 'empty'],
    ['2.345', /Metres to two decimals/, 'three-decimal'],
    ['1e3', /Not a number/, 'exponent-form'],
  ];
  for (const [value, re, label] of cases) {
    await dimInput.fill(value);
    await page.waitForTimeout(150);
    const err = (await row1.locator('td:nth-child(2) .field-err').innerText().catch(() => '')).trim();
    const invalid = await dimInput.getAttribute('aria-invalid');
    const describedBy = await dimInput.getAttribute('aria-describedby');
    const described = describedBy ? await page.locator(`#${describedBy}`).count() : 0;
    const held = num(await page.locator('#calc-total').innerText());
    check(re.test(err) && invalid === 'true' && described === 1 && held === totalHold, `A ${label} length is refused with a readable message the input points to, and totals hold (${err || 'no message'})`);
  }
  await qtyInput.fill('1.5');
  await page.waitForTimeout(150);
  const qErr = (await row1.locator('td.qty .field-err').innerText().catch(() => '')).trim();
  check(/whole number/.test(qErr), `A fractional quantity is refused (${qErr})`);
  const notice = await page.locator('#calc-verdict').innerText();
  check(/last valid value/.test(notice), 'The verdict box says totals use the last valid value while a field is invalid');

  /* push the store itself over capacity and confirm it is said, not clipped */
  await dimInput.fill('2.40');
  const ahuRow = page.locator('#calc-table tbody tr[data-slug="air-handling-unit-sections"]');
  const ahuQty = ahuRow.locator('input[data-field="q"]');
  await ahuQty.fill('600');
  await page.waitForTimeout(300);
  const storeOver = num(await page.locator('#calc-store-util').innerText());
  const verdict2 = await page.locator('#calc-verdict').innerText();
  check(storeOver > 100 && /over capacity/i.test(verdict2), `Six hundred air handling sections push the store to ${storeOver}% and the page says it is over capacity`);

  /* reset restores the published figures */
  await page.locator('#calc-reset').click();
  await page.waitForTimeout(300);
  const totalReset = num(await page.locator('#calc-total').innerText());
  const q1 = Number(await qtyInput.inputValue());
  const resetDisabled = await page.locator('#calc-reset').isDisabled();
  check(totalReset === cooling.totalCbm && q1 === q0 && resetDisabled, `Reset restores the published total (${totalReset}) and quantity (${q1}) and disables itself`);

  /* switching vertical */
  await page.locator('#calc-vertical').selectOption('trading');
  await page.waitForTimeout(400);
  const tradingRows = await page.locator('#calc-table tbody tr:not(.total)').count();
  check(/v=trading/.test(page.url()) && tradingRows === rollup.calculator.find((v) => v.slug === 'trading')!.rows.length, `Choosing another vertical updates the address and the table (${tradingRows} rows)`);
  await page.goto(`${base}/calculator?v=no-such-vertical`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#calc-table');
  await page.waitForTimeout(300);
  const fallbackSel = await page.locator('#calc-vertical').inputValue();
  check(new URL(page.url()).searchParams.get('v') === fallbackSel, `An unknown vertical in the address falls back and the address is corrected to match the select (${fallbackSel})`);
  await page.locator('#calc-vertical').selectOption('services');
  await page.waitForTimeout(400);
  const empty = await page.locator('.empty').innerText().catch(() => '');
  check(/holds nothing/.test(empty), `An empty vertical shows a readable empty state ("${empty.slice(0, 50)}")`);

  /* 11. material group page */
  await page.goto(`${base}/g/air-handling-unit-sections`, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg#g-line');
  const gSections = await page.locator('section.sec').count();
  const gTitle = (await page.locator('h1').first().innerText()).trim();
  check(gSections === 5 && /air handling unit sections/i.test(gTitle), `Group page renders five blocks (h1 "${gTitle}")`);
  const crumbs = await page.locator('.crumbs').innerText();
  check(/overview/i.test(crumbs) && /material groups/i.test(crumbs), `Group breadcrumb leads back through the material groups ("${crumbs.replace(/\n/g, ' / ')}")`);
  const gl = page.locator('svg#g-line');
  await gl.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  const gRead = (await gl.locator('.readbox text').first().evaluate((el) => el.textContent)) ?? '';
  check(/JUL 2026/.test(gRead), `Stock line crosshair moves with arrow keys (read "${gRead}")`);
  const vs = page.locator('#g-values summary');
  await vs.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const vRows = await page.locator('#g-values tbody tr').count();
  check(vRows === 12 && (await page.locator('#g-values').evaluate((el) => (el as HTMLDetailsElement).open)), `Monthly values open by keyboard with ${vRows} rows`);

  /* 12. every report route renders its heading */
  for (const [path, h] of [
    ['/capacity', 'Space and capacity'],
    ['/aging', 'Aging and turnover'],
    ['/replenishment', 'Replenishment'],
    ['/cost', 'Cost'],
    ['/calculator', 'CBM calculator'],
    ['/inbound', 'Inbound and commitments'],
    ['/data-basis', 'Data basis'],
  ] as const) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    const title = (await page.locator('h1').first().innerText()).trim();
    check(new RegExp(`^${h}$`, 'i').test(title), `${path} renders (h1 "${title}")`);
  }
  const recText = await page.locator('#reconciliation').innerText();
  check(/all pass/i.test(recText), `Data basis page shows the reconciliation result ("${(recText.match(/[\d,]+ of [\d,]+ assertions pass/) ?? [''])[0]}")`);

  /* 13. invalid route, missing data, malformed data */
  await page.goto(`${base}/no/such/page`, { waitUntil: 'networkidle' });
  const nf = (await page.locator('h1').first().innerText()).trim();
  check(/nothing here/i.test(nf), `Invalid route shows the not-found page (h1 "${nf}")`);
  expectMissing = true;
  await page.goto(`${base}/g/no-such-group`, { waitUntil: 'networkidle' });
  const missing = await page.locator('.errbox').innerText();
  expectMissing = false;
  check(/no such material group/i.test(missing) && /not found|HTTP|valid JSON/i.test(missing), `Missing group data shows a readable error ("${missing.replace(/\n/g, ' ').slice(0, 90)}"; ${expected404} expected 404 in the console)`);
  await page.route('**/data/rollup.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"meta": {}}' }));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const malformed = await page.locator('.errbox').innerText();
  check(/expected shape/i.test(malformed), `Malformed data shows a readable shape error ("${malformed.replace(/\n/g, ' ').slice(0, 110)}")`);
  await page.unroute('**/data/rollup.json');
  await page.route('**/data/rollup.json', async (route) => {
    const real = await (await fetch(`${base}/data/rollup.json`)).json();
    real.overview.utilPct = null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(real) });
  });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const nested = await page.locator('.errbox').innerText();
  check(/overview\.utilPct/.test(nested), `A null nested metric is refused, never shown as zero ("${nested.replace(/\n/g, ' ').slice(0, 90)}")`);
  await page.unroute('**/data/rollup.json');
  await page.route('**/data/rollup.json', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }));
  expectMissing = true;
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  const failed500 = await page.locator('.errbox').innerText();
  expectMissing = false;
  const retry = await page.locator('.errbox button', { hasText: 'Try again' }).count();
  check(/could not deliver/i.test(failed500) && !/not found/i.test(failed500) && retry === 1, `A server failure is named as such, not as missing data, and offers a retry ("${failed500.replace(/\n/g, ' ').slice(0, 70)}")`);
  await page.unroute('**/data/rollup.json');
  await context.close();

  /* 14. reduced motion */
  const { context: rc, page: rp } = await newPage(1440, 'reduce');
  await rp.goto(`${base}/calculator?v=cooling`, { waitUntil: 'networkidle' });
  await rp.waitForSelector('#calc-table');
  await rp.waitForTimeout(400);
  const anims = await rp.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  const opacityOk = await rp.evaluate(() => Array.from(document.querySelectorAll('section.sec, tr')).every((el) => getComputedStyle(el).opacity === '1'));
  check(anims === 0 && opacityOk, `Under reduced motion nothing is animating and every section and row is fully visible (${anims} running animations)`);
  await rc.close();

  /* 15. console errors */
  check(errors.length === 0, `No console errors (${errors.length})`);
  for (const e of errors) console.log('   ' + e);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} interaction checks pass.`);
