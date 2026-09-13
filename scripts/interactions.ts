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

import { createHash } from 'node:crypto';
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

/**
 * Reads a hoverable row's first cell at rest and under the pointer. The pointer
 * is parked away from the table first, because a cell left under the mouse by an
 * earlier check would report the hovered tone as its resting tone.
 */
async function rowHover(page: Page, rowSel: string) {
  const cell = page.locator(rowSel).first().locator('xpath=*[1]');
  await cell.scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
  const before = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
  const box = (await cell.boundingBox())!;
  const widthBefore = await cell.evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(220);
  const after = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
  const marker = await cell.evaluate((el) => getComputedStyle(el).boxShadow);
  const widthAfter = await cell.evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
  return { before, after, marker, widthBefore, widthAfter, shifted: before !== after, marked: /inset/.test(marker), steady: Math.abs(widthBefore - widthAfter) < 0.5 };
}

/**
 * Moves the pointer across a chart's blank plot area (never a click, never a key)
 * and reports the readout and the outlined mark it produced.
 */
async function chartHover(page: Page, id: string, fx: number, fy: number) {
  const svg = page.locator(`svg#${id}`);
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy - 2);
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(180);
  const n = await svg.locator('.readbox text').count();
  const read = n === 0 ? '' : ((await svg.locator('.readbox text').first().textContent()) ?? '').trim();
  const marks = await svg.locator('.mk-on').count();
  return { read, marks, live: read.length > 0 };
}

/** Puts a stylesheet into the page that defeats a hover rule, so a probe can be proven to fail. */
async function breakHover(page: Page, css: string) {
  await page.evaluate((text) => {
    const el = document.createElement('style');
    el.id = 'negative-control';
    el.textContent = text;
    document.head.appendChild(el);
  }, css);
}
async function unbreakHover(page: Page) {
  await page.evaluate(() => document.getElementById('negative-control')?.remove());
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
    const sizes = await page.evaluate(() => [getComputedStyle(document.querySelector('.mast-system')!).fontSize, getComputedStyle(document.querySelector('h1.page-title')!).fontSize]);
    check(sizes[0] === sizes[1], `Masthead system title is set at the page-title size at ${w}px (${sizes[0]})`);
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

  /* 4b. the hover is perceptible: the row changes tone and takes an ink marker, each proven
     against a negative control that defeats the rule in browser memory */
  const rh = await rowHover(page, '#value tbody tr.hov');
  check(rh.shifted && rh.marked, `Hovering a row changes its background from ${rh.before} to ${rh.after} and marks its first cell (${rh.marker})`);
  /* the marker is an inset shadow, never a border: the table must not shift sideways under the pointer */
  check(rh.steady, `The hover marker does not move the table: first cell is ${rh.widthBefore.toFixed(1)}px at rest and ${rh.widthAfter.toFixed(1)}px hovered`);
  await breakHover(page, 'table.mis tr.hov:hover td, table.mis tr.hov:hover th { background: var(--paper) !important; box-shadow: none !important; }');
  const rhNeg = await rowHover(page, '#value tbody tr.hov');
  check(!rhNeg.shifted && !rhNeg.marked, `Row-hover gate reports a defeated hover rule (negative control: ${rhNeg.before} to ${rhNeg.after}, marker "${rhNeg.marker}")`);
  await unbreakHover(page);
  const rhAgain = await rowHover(page, '#value tbody tr.hov');
  check(rhAgain.shifted && rhAgain.marked, 'Row-hover gate passes again once the hover rule is restored');

  /* 4c. the utilisation chart answers to plain pointer movement over blank plot area, with no click */
  const ch = await chartHover(page, 'ov-util', 0.82, 0.2);
  check(ch.live && ch.marks > 0, `Moving the pointer over the utilisation chart reads out "${ch.read}" and outlines ${ch.marks} mark(s), with no click`);
  await breakHover(page, 'svg.chart { pointer-events: none !important; }');
  await page.mouse.move(4, 4);
  const chNeg = await chartHover(page, 'ov-util', 0.82, 0.2);
  check(!chNeg.live, `Chart-hover gate reports a chart that ignores the pointer (negative control: readout "${chNeg.read}", ${chNeg.marks} marks)`);
  await unbreakHover(page);
  await page.mouse.move(4, 4);
  const chAgain = await chartHover(page, 'ov-util', 0.82, 0.2);
  check(chAgain.live, `Chart-hover gate passes again once the pointer reaches the chart ("${chAgain.read}")`);
  await page.mouse.move(4, 4);

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
  await page.mouse.move(4, 4);
  await page.keyboard.press('Escape');
  const projHover = await chartHover(page, 'cap-proj', 0.55, 0.35);
  check(projHover.live && projHover.marks > 0, `Projection chart reads out on plain pointer movement ("${projHover.read}"), no click`);
  const utilHover = await chartHover(page, 'cap-util', 0.82, 0.25);
  check(utilHover.live && utilHover.marks > 0, `Capacity utilisation chart reads out on plain pointer movement ("${utilHover.read}"), no click`);
  const capRow = await rowHover(page, '#util tbody tr.hov');
  check(capRow.shifted && capRow.marked, `Capacity rows change tone on hover (${capRow.before} to ${capRow.after})`);
  await page.mouse.move(4, 4);
  const overCells = await page.locator('#projection td.bad').count();
  check(overCells > 0, `Projection table marks ${overCells} month cells over their allocation in red`);

  /* 7. aging page */
  await page.goto(`${base}/aging`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#slow table.mis');
  const slowRows = await page.locator('#slow tbody tr').count();
  check(slowRows === 15, `Slow movers table lists ${slowRows} groups`);
  const ageHover = await chartHover(page, 'age-chart', 0.75, 0.3);
  check(ageHover.live && ageHover.marks > 0, `Age chart reads out on plain pointer movement ("${ageHover.read}"), no click`);
  await page.mouse.move(4, 4);
  /* the same chart by keyboard: focus lands on the first row, the arrow keys walk it, Escape clears it */
  const ageSvg = page.locator('svg#age-chart');
  await ageSvg.focus();
  await page.waitForTimeout(120);
  const ageKey0 = ((await ageSvg.locator('.readbox text').first().textContent()) ?? '').trim();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  const ageKey1 = ((await ageSvg.locator('.readbox text').first().textContent()) ?? '').trim();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const ageCleared = await ageSvg.locator('.readbox text').count();
  check(ageKey0.length > 0 && ageKey1 !== ageKey0 && ageCleared === 0, `Age chart walks its rows by keyboard ("${ageKey0}" to "${ageKey1}") and Escape clears the readout`);
  await page.mouse.move(4, 4);
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
  await page.keyboard.press('Escape');
  await page.mouse.move(4, 4);
  const lineHover = await chartHover(page, 'g-line', 0.5, 0.5);
  check(lineHover.live && lineHover.marks > 0, `Stock line reads out on plain pointer movement ("${lineHover.read}"), no click`);
  await page.mouse.move(4, 4);
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

  /* 13b. Every route must actually animate on entry, measured as rendered frames.
     Nothing in this gate could previously tell an animated page from a dead one: the
     row-reveal fade is imperceptible on its own, so a page with no headline strip and
     no chart rendered identically from first paint. Measured 13 Sep 2026, that was
     true of /calculator and /data-basis while every other check passed. */
  // Read the nav from a REAL page. The step before this one deliberately breaks the
  // data fetch, so reading `nav a` without navigating first returns an empty list and
  // the loop below runs zero times while reporting nothing: a check that cannot fail.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('nav a');
  const routes = await page.$$eval('nav a', (as) => as.map((a) => a.getAttribute('href')!).filter(Boolean));
  check(routes.length >= 5, `The nav offers ${routes.length} routes to test for entry motion (a zero here would silently skip every check below)`);
  for (const r of routes) {
    const seen = new Set<string>();
    await page.goto(`${base}${r}`, { waitUntil: 'commit' });
    // Sample from NAVIGATION on fixed offsets, not from the h1. Anchoring on the h1 was
    // wrong once the entry animation started from a 0.6 opacity floor: the title is
    // visible on frame one, so waitForSelector plus its round trip resolves AFTER most
    // of the motion and every page read as static. Verified 12 Sep 2026 against an
    // independent probe that reported 4 to 6 distinct frames on the same routes. The
    // window runs to 1.4s so a late-painting page is still covered.
    for (const gap of [120, 80, 100, 150, 250, 700]) {
      await page.waitForTimeout(gap);
      seen.add(createHash('md5').update(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 860 } })).digest('hex'));
    }
    check(seen.size >= 3, `${r} animates on entry (${seen.size} distinct rendered frames across the first 1.4s; a static page gives 2)`);
  }
  await context.close();

  /* 14. reduced motion */
  const { context: rc, page: rp } = await newPage(1440, 'reduce');
  await rp.goto(`${base}/calculator?v=cooling`, { waitUntil: 'networkidle' });
  await rp.waitForSelector('#calc-table');
  await rp.waitForTimeout(400);
  const anims = await rp.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  const opacityOk = await rp.evaluate(() => Array.from(document.querySelectorAll('section.sec, tr')).every((el) => getComputedStyle(el).opacity === '1'));
  check(anims === 0 && opacityOk, `Under reduced motion nothing is animating and every section and row is fully visible (${anims} running animations)`);
  // Negative control for 13b: with motion off the same route must render static.
  const staticFrames = new Set<string>();
  await rp.goto(`${base}/`, { waitUntil: 'commit' });
  await rp.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
  for (const gap of [120, 80, 100, 150, 250, 700]) {
    await rp.waitForTimeout(gap);
    staticFrames.add(createHash('md5').update(await rp.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 860 } })).digest('hex'));
  }
  check(staticFrames.size <= 2, `Negative control: under reduced motion the overview renders static (${staticFrames.size} distinct frames, against 3 or more with motion on)`);
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
