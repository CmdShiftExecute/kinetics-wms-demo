/**
 * Cross-table reconciliation of the WRITTEN data files.
 *
 * Run:  bun scripts/reconcile.ts
 * Out:  public/data/reconciliation.json, exit 1 if any assertion fails.
 *
 * The generator asserts its own arithmetic in memory; this script re-reads the
 * JSON the browser will read and checks that every independently published
 * figure ties to every other one, and that every derived figure follows the
 * stated rule. The result is shown on the Data basis page.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { r1, r2, sumCbm, totalCbm, unitCbm, utilPct } from '../data/cbm';
import type { AbcClass, Assertion, Group, IndexEntry, ProjectionPoint, Reconciliation, ReplenishmentStatus, Rollup } from '../data/schema';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');
const read = <T,>(rel: string): T => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as T;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const H = (n: number) => Math.round(n * 100);
const pctOf = (a: number, b: number) => (b === 0 ? 0 : r1((a / b) * 100));

function gstStamp(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}+04:00`;
}

const rollup = read<Rollup>('rollup.json');
const index = read<IndexEntry[]>('index.json');
const groups = index.flatMap((v) => v.groups.map((g) => read<Group>(g.file)));

const assertions: Assertion[] = [];
/** Integers and one-decimal percentages: exact. */
const eq = (id: string, statement: string, left: number, right: number) => assertions.push({ id, statement, left, right, pass: Math.round(left * 10) === Math.round(right * 10) });
/** Two-decimal CBM figures: compared in hundredths. */
const eq2 = (id: string, statement: string, left: number, right: number) => assertions.push({ id, statement, left, right, pass: H(left) === H(right) });
const ok = (id: string, statement: string, pass: boolean, left = 1, right = pass ? 1 : 0) => assertions.push({ id, statement, left, right, pass });

const { site, total, overview, verticals, cost, inbound, aging, replenishment, calculator, meta } = rollup;
const statusRule = (quantity: number, reorderPoint: number, daysOfCover: number | null, leadTimeDays: number): ReplenishmentStatus => (quantity <= reorderPoint ? 'below' : daysOfCover != null && daysOfCover <= leadTimeDays + 30 ? 'lead' : 'healthy');
/** Calendar days added to a date-only value; UTC fields are the only correct reader of such a value. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
/**
 * The projection rule, written again here from the definition, independently of the generator,
 * as a day-by-day walk: the balance falls by demand per day and never below zero; an arrival lands on
 * that floored balance on its day; an order for max stock less the balance is placed on the first day
 * the balance is at or under the reorder point while nothing is on order and lands lead-time days later;
 * a group already below on the stock date orders that day; month-end CBM is unit CBM times the rounded balance.
 */
function replayProjection(vg: Group[]): ProjectionPoint[] {
  const days = meta.projectionDays;
  const cum = days.map((_, i) => days.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const dayOf = (iso: string) => {
    const t = (s: string) => {
      const [y, m, d] = s.split('-').map(Number) as [number, number, number];
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((t(iso) - t(meta.stockDate)) / 86400000);
  };
  const bal = new Map(vg.map((g) => [g.slug, g.quantity as number]));
  const orders = new Map<string, { day: number; quantity: number }[]>();
  for (const g of vg) {
    const list: { day: number; quantity: number }[] = [];
    if (g.inTransit) list.push({ day: dayOf(g.inTransit.expectedArrival), quantity: g.inTransit.quantity });
    else if (g.status === 'below') list.push({ day: g.leadTimeDays, quantity: Math.max(0, g.maxStock - g.quantity) });
    orders.set(g.slug, list);
  }
  const out: ProjectionPoint[] = [];
  for (let day = 1; day <= cum[cum.length - 1]!; day++) {
    for (const g of vg) {
      const list = orders.get(g.slug)!;
      let b = Math.max(0, bal.get(g.slug)! - g.demandPerDay) + sum(list.filter((o) => o.day === day).map((o) => o.quantity));
      if (b <= g.reorderPoint && g.demandPerDay > 0 && !list.some((o) => o.day > day)) list.push({ day: day + g.leadTimeDays, quantity: Math.max(0, g.maxStock - Math.round(b)) });
      bal.set(g.slug, b);
    }
    const mi = cum.indexOf(day);
    if (mi >= 0) out.push({ month: meta.projectionMonths[mi]!, index: mi + 1, cbm: sumCbm(vg.map((g) => totalCbm(g.unitCbm, Math.round(bal.get(g.slug)!)))) });
  }
  return out;
}

/* ---------- the CBM rule itself, on decimal half boundaries ---------- */
eq2('cbm-rule-half-up', 'The CBM rule rounds a true half up: 1.13 x 1.00 x 0.50 is 0.57, not 0.56', unitCbm(1.13, 1.0, 0.5), 0.57);
eq2('cbm-rule-half-total', 'Group CBM at that unit and 100,000 units is 57,000.00', totalCbm(unitCbm(1.13, 1.0, 0.5), 100000), 57000);
eq2('cbm-rule-below-half', 'The CBM rule rounds just under a half down: 1.13 x 1.00 x 0.49 is 0.55', unitCbm(1.13, 1.0, 0.49), 0.55);

/* ---------- site parameters ---------- */
eq('site-net-sqft', 'Net usable sq ft equals floor area times the net usable percent', site.netUsableSqFt, Math.round((site.floorAreaSqFt * site.netUsablePct) / 100));
eq2('site-net-m2', 'Net usable m2 equals net usable sq ft times 0.09290304', site.netUsableM2, r2(site.netUsableSqFt * 0.09290304));
eq2('site-capacity', 'Capacity CBM equals net usable m2 times the stacking height', site.capacityCbm, r2(site.netUsableM2 * site.stackingHeightM));
eq('site-rent', 'Annual rent equals floor area times the rate per sq ft', site.annualRent, site.floorAreaSqFt * site.rentPerSqFtYear);
ok('site-rate', 'Daily rate per CBM equals annual rent over 365 over capacity, four decimals', Math.round(site.dailyRatePerCbm * 10000) === Math.round((site.annualRent / 365 / site.capacityCbm) * 10000), site.dailyRatePerCbm, Math.round((site.annualRent / 365 / site.capacityCbm) * 10000) / 10000);
eq2('site-overflow-used', 'Overflow CBM in use equals the store total overflow CBM', site.overflow.usedCbm, total.overflowCbm);
ok('site-overflow-cap', 'Overflow CBM in use is within the overflow capacity', site.overflow.usedCbm <= site.overflow.capacityCbm, site.overflow.usedCbm, site.overflow.capacityCbm);
eq2('allocations-capacity', 'Vertical allocations sum to the store capacity', sumCbm(verticals.map((v) => v.allocatedCbm)), site.capacityCbm);

/* ---------- store totals against the vertical rows ---------- */
eq('total-value', 'Vertical stock values sum to the store total', sum(verticals.map((v) => v.stockValue)), total.stockValue);
eq2('total-cbm', 'Vertical CBM sums to the store total', sumCbm(verticals.map((v) => v.totalCbm)), total.totalCbm);
eq2('total-rackable', 'Vertical rackable CBM sums to the store rackable CBM', sumCbm(verticals.map((v) => v.rackableCbm)), total.rackableCbm);
eq2('total-nonrackable', 'Vertical non-rackable CBM sums to the store non-rackable CBM', sumCbm(verticals.map((v) => v.nonRackableCbm)), total.nonRackableCbm);
eq2('total-rack-split', 'Store rackable plus non-rackable equals store CBM', sumCbm([total.rackableCbm, total.nonRackableCbm]), total.totalCbm);
eq2('total-overflow', 'Vertical overflow CBM sums to the store overflow CBM', sumCbm(verticals.map((v) => v.overflowCbm)), total.overflowCbm);
eq2('total-idle', 'Store idle CBM equals allocation less stock', total.idleCbm, r2(total.allocatedCbm - total.totalCbm));
eq('total-util', 'Store utilisation equals store CBM over capacity', total.utilPct, utilPct(total.totalCbm, site.capacityCbm));
eq('total-daily', 'Vertical daily storage costs sum to the store daily cost', sum(verticals.map((v) => v.dailyStorageCost)), total.dailyStorageCost);
eq('total-below', 'Vertical below-reorder counts sum to the store count', sum(verticals.map((v) => v.belowReorder)), total.belowReorder);
eq('total-age', 'Store age bands sum to store stock value', total.age.under90 + total.age.d90to180 + total.age.d180to365 + total.age.over365, total.stockValue);
eq2('total-age-cbm', 'Store CBM by age band sums to store CBM', sumCbm([total.ageCbm.under90, total.ageCbm.d90to180, total.ageCbm.d180to365, total.ageCbm.over365]), total.totalCbm);
eq('total-issues', 'Vertical annualised issues sum to the store figure', sum(verticals.map((v) => v.annualIssueValue)), total.annualIssueValue);
eq('total-turnover', 'Store turnover equals annualised issues over stock value', total.turnover, r1(total.annualIssueValue / total.stockValue));
eq('total-mapped', 'Vertical mapped-to-PO values sum to the store figure', sum(verticals.map((v) => v.mappedToPo)), total.mappedToPo);
eq('total-free', 'Store mapped plus free equals store stock value', total.mappedToPo + total.freeStock, total.stockValue);
eq('total-transit-qty', 'Vertical in-transit quantities sum to the store figure', sum(verticals.map((v) => v.inTransitQuantity)), total.inTransitQuantity);
eq('total-transit-value', 'Vertical in-transit values sum to the store figure', sum(verticals.map((v) => v.inTransitValue)), total.inTransitValue);
for (const p of total.projection) {
  eq2(`total-projection-${p.index}`, `Store projected CBM for ${p.month} equals the sum of the vertical projections`, sumCbm(verticals.map((v) => v.projection[p.index - 1]!.cbm)), p.cbm);
  eq2(`projection-total-${p.index}`, `projectionTotal for ${p.month} equals the store projection row`, rollup.projectionTotal[p.index - 1]!.cbm, p.cbm);
}
for (const m of total.monthly) {
  eq(`total-monthly-value-${m.index}`, `Store month-end value ${m.month} equals the sum of the verticals`, sum(verticals.map((v) => v.monthly[m.index - 1]!.value)), m.value);
}

/* ---------- overview ---------- */
eq('overview-value', 'Overview stock value equals the store total', overview.stockValue, total.stockValue);
eq2('overview-cbm', 'Overview CBM equals the store total', overview.totalCbm, total.totalCbm);
eq2('overview-capacity', 'Overview capacity equals the site capacity', overview.capacityCbm, site.capacityCbm);
eq('overview-util', 'Overview utilisation equals CBM over capacity', overview.utilPct, utilPct(overview.totalCbm, overview.capacityCbm));
eq('overview-daily', 'Overview daily storage cost equals the store total', overview.dailyStorageCost, total.dailyStorageCost);
eq('overview-annualised', 'Overview annualised storage cost is the daily cost times 365', overview.annualisedStorageCost, overview.dailyStorageCost * 365);
eq('overview-overflow-daily', 'Overview overflow charge per day is overflow CBM times the overflow rate', overview.overflowDailyCost, Math.round(site.overflow.usedCbm * site.overflow.dailyRatePerCbm));
{
  const peak = [...total.projection].sort((a, b) => b.cbm - a.cbm)[0]!;
  eq2('overview-peak-cbm', `Overview projection peak (${overview.projectionPeak.month}) equals the highest projected month`, overview.projectionPeak.cbm, peak.cbm);
  eq('overview-peak-pct', 'Overview projection peak percent derives from the peak over capacity', overview.projectionPeak.pctOfCapacity, pctOf(peak.cbm, site.capacityCbm));
}
eq('verticals-value-shares', 'Vertical value shares sum to 100.0', Math.round(sum(verticals.map((v) => v.valueSharePct)) * 10) / 10, 100);
eq('verticals-cost-shares', 'Vertical daily-cost shares sum to 100.0', Math.round(sum(verticals.map((v) => v.dailyCostSharePct)) * 10) / 10, 100);
eq('overview-below', 'Overview groups below reorder point equals the replenishment count', overview.belowReorder, replenishment.counts.below);
eq('overview-age', 'Overview age bands sum to stock value', overview.age.under90 + overview.age.d90to180 + overview.age.d180to365 + overview.age.over365, overview.stockValue);
eq('overview-age-pct-u90', 'Overview under-90 percent derives from the band sum', overview.agePct.under90, pctOf(overview.age.under90, overview.stockValue));
eq('overview-age-pct-90', 'Overview 90-to-180 percent derives from the band sum', overview.agePct.d90to180, pctOf(overview.age.d90to180, overview.stockValue));
eq('overview-age-pct-180', 'Overview 180-to-365 percent derives from the band sum', overview.agePct.d180to365, pctOf(overview.age.d180to365, overview.stockValue));
eq('overview-age-pct-365', 'Overview over-365 percent derives from the band sum', overview.agePct.over365, pctOf(overview.age.over365, overview.stockValue));
{
  const stocked = verticals.filter((v) => v.groups > 0);
  const hi = Math.max(...stocked.map((v) => v.utilPct));
  const lo = Math.min(...stocked.map((v) => v.utilPct));
  eq('overview-over', `Overview names the most over-used vertical (${overview.overVertical.name})`, overview.overVertical.utilPct, hi);
  eq('overview-under', `Overview names the least used stocked vertical (${overview.underVertical.name})`, overview.underVertical.utilPct, lo);
  ok('overview-one-over', 'Exactly one vertical is over its allocation', stocked.filter((v) => v.utilPct > 100).length === 1, stocked.filter((v) => v.utilPct > 100).length, 1);
}
{
  const expected = groups.filter((g) => g.status === 'below' || (g.daysOfCover != null && g.daysOfCover <= 60)).map((g) => g.slug).sort();
  const listed = overview.needsOrder.map((s) => s.slug).sort();
  eq('overview-needs-order-count', 'Overview needs-order list has one row per group at or under its reorder point or within 60 days of cover', listed.length, expected.length);
  ok('overview-needs-order-members', 'Overview needs-order list holds exactly those groups', listed.join('|') === expected.join('|'));
  for (const s of overview.needsOrder) {
    const g = groups.find((x) => x.slug === s.slug)!;
    eq(`needs-order-${s.slug}`, `${g.name}: overview days of cover equal the group days of cover`, s.daysOfCover ?? -1, g.daysOfCover ?? -1);
    ok(`needs-order-status-${s.slug}`, `${g.name}: overview status equals the group status`, s.status === g.status);
  }
}

/* ---------- aging ---------- */
{
  const classes: AbcClass[] = ['A', 'B', 'C'];
  for (const c of classes) {
    const row = aging.abc.find((r) => r.cls === c)!;
    const gs = groups.filter((g) => g.abc === c);
    eq(`abc-${c}-groups`, `ABC class ${c} group count equals the groups so classed`, row.groups, gs.length);
    eq(`abc-${c}-value`, `ABC class ${c} value equals the sum of its groups`, row.stockValue, sum(gs.map((g) => g.stockValue)));
  }
  eq('abc-shares', 'ABC shares sum to 100.0', Math.round(sum(aging.abc.map((r) => r.sharePct)) * 10) / 10, 100);
  for (const c of classes) eq(`abc-${c}-share-members`, `ABC class ${c} share equals the sum of its member groups' shares`, aging.abc.find((r) => r.cls === c)!.sharePct, Math.round(sum(groups.filter((g) => g.abc === c).map((g) => g.valueSharePct)) * 10) / 10);
  eq('abc-value', 'ABC class values sum to the store stock value', sum(aging.abc.map((r) => r.stockValue)), total.stockValue);
  const ranked = [...groups].sort((a, b) => b.stockValue - a.stockValue);
  let cum = 0;
  let ruleOk = true;
  for (const g of ranked) {
    cum = Math.round((cum + g.valueSharePct) * 10) / 10;
    const expect: AbcClass = cum <= 70 ? 'A' : cum <= 90 ? 'B' : 'C';
    if (expect !== g.abc) ruleOk = false;
  }
  ok('abc-rule', 'Every group class follows the 70/90 cumulative-share rule', ruleOk);
  eq('shares-100', 'Group value shares sum to 100.0', Math.round(sum(groups.map((g) => g.valueSharePct)) * 10) / 10, 100);
  eq('slow-movers-count', 'Fifteen slow movers are listed', aging.slowMovers.length, 15);
  const byOver = [...groups].map((g) => g.age.d180to365 + g.age.over365).sort((a, b) => b - a);
  aging.slowMovers.forEach((s, i) => {
    const g = groups.find((x) => x.slug === s.slug)!;
    eq(`slow-${s.slug}`, `${g.name}: slow-mover value over 180 days equals its two oldest bands`, s.valueOver180, g.age.d180to365 + g.age.over365);
    eq(`slow-${s.slug}-pct`, `${g.name}: slow-mover share over 180 days derives from the bands`, s.over180Pct, pctOf(s.valueOver180, g.stockValue));
    eq(`slow-${s.slug}-turnover`, `${g.name}: slow-mover turnover equals the group's published turnover`, s.turnover, g.turnover);
    eq(`slow-rank-${i + 1}`, `Slow mover ${i + 1} carries the ${i + 1}th largest value over 180 days`, s.valueOver180, byOver[i]!);
  });
}

/* ---------- replenishment ---------- */
eq('repl-rows', 'Replenishment lists every material group', replenishment.rows.length, groups.length);
eq('repl-counts', 'Replenishment status counts sum to the group count', replenishment.counts.below + replenishment.counts.lead + replenishment.counts.healthy, groups.length);
eq('repl-below', 'Below-reorder count equals the rows so marked', replenishment.counts.below, replenishment.rows.filter((r) => r.status === 'below').length);
eq('repl-lead', 'Within-lead-time count equals the rows so marked', replenishment.counts.lead, replenishment.rows.filter((r) => r.status === 'lead').length);
for (const r of replenishment.rows) {
  ok(`repl-rule-${r.slug}`, `${r.name}: status "${r.status}" follows the stated rule`, statusRule(r.quantity, r.reorderPoint, r.daysOfCover, r.leadTimeDays) === r.status);
  eq(`repl-rop-${r.slug}`, `${r.name}: reorder point is safety stock plus lead time times demand per day, rounded up`, r.reorderPoint, Math.ceil(r.safetyStock + r.leadTimeDays * r.demandPerDay));
}

/* ---------- cost ---------- */
for (const r of cost.rows) {
  eq(`cost-row-${r.slug}`, `Cost, ${r.name}: parts sum to the row total`, r.rent + r.handlingFixed + r.handlingVariable + r.utilities + r.overflow, r.total);
  const v = verticals.find((x) => x.slug === r.slug);
  if (v) {
    const vg = groups.filter((g) => g.vertical === v.slug);
    eq2(`cost-cbm-${r.slug}`, `Cost, ${r.name}: main-store CBM equals the vertical CBM less its overflow CBM`, r.mainCbm, r2(v.totalCbm - v.overflowCbm));
    eq2(`cost-overflow-cbm-${r.slug}`, `Cost, ${r.name}: overflow CBM equals the vertical figure`, r.overflowCbm, v.overflowCbm);
    eq(`cost-daily-${r.slug}`, `Cost, ${r.name}: daily storage cost equals the vertical figure`, r.dailyStorageCost, v.dailyStorageCost);
    eq(`cost-rent-rule-${r.slug}`, `Cost, ${r.name}: rent charged is main CBM times the rate times the days, per group`, r.rent, sum(vg.map((g) => Math.round((g.totalCbm - g.overflowCbm) * site.dailyRatePerCbm * cost.daysInMonth))));
    eq(`cost-overflow-rule-${r.slug}`, `Cost, ${r.name}: overflow charge is overflow CBM times the overflow rate times the days, per group`, r.overflow, sum(vg.map((g) => Math.round(g.overflowCbm * site.overflow.dailyRatePerCbm * cost.daysInMonth))));
  }
}
for (const key of ['rent', 'handlingFixed', 'handlingVariable', 'utilities', 'overflow', 'total', 'dailyStorageCost'] as const) eq(`cost-total-${key}`, `Cost total ${key} equals the sum of the rows`, sum(cost.rows.map((r) => r[key])), cost.total[key]);
eq2('cost-total-main-cbm', 'Cost CBM column, including idle capacity, adds to the store capacity', sumCbm(cost.rows.map((r) => r.mainCbm)), site.capacityCbm);
eq2('cost-total-main-cbm-row', 'Cost total row CBM equals the store capacity', cost.total.mainCbm, site.capacityCbm);
eq2('cost-total-overflow-cbm', 'Cost overflow CBM column adds to the store overflow CBM', sumCbm(cost.rows.map((r) => r.overflowCbm)), total.overflowCbm);
eq('cost-rent-month', 'Rent rows, including idle capacity, add to one month of the annual rent', cost.total.rent, Math.round(site.annualRent / 12));
eq('cost-rent-charged', 'Rent charged to stock equals the sum of the vertical rent rows', cost.rentChargedToStock, sum(cost.rows.filter((r) => r.slug !== 'idle').map((r) => r.rent)));
eq('cost-shares', 'Cost shares of the month total sum to 100.0', Math.round(sum(cost.rows.map((r) => r.sharePct)) * 10) / 10, 100);
eq2('cost-idle-cbm', 'Idle capacity CBM equals capacity less every vertical main-store CBM', cost.rows.find((r) => r.slug === 'idle')!.mainCbm, r2(site.capacityCbm - sumCbm(cost.rows.filter((r) => r.slug !== 'idle').map((r) => r.mainCbm))));
for (const o of cost.siteOptions) {
  eq(`option-${o.key}-rent`, `Site option ${o.key}: annual rent is the sum of its parts, each an area at a rate`, o.annualRent, sum(o.components.map((c) => c.sizeSqFt * c.ratePerSqFtYear)));
  eq(`option-${o.key}-size`, `Site option ${o.key}: size is the sum of its parts`, o.sizeSqFt, sum(o.components.map((c) => c.sizeSqFt)));
  eq(`option-${o.key}-monthly`, `Site option ${o.key}: monthly rent is annual over 12`, o.monthlyRent, Math.round(o.annualRent / 12));
  eq2(`option-${o.key}-rate`, `Site option ${o.key}: monthly rate per sq ft is monthly rent over size`, o.monthlyRatePerSqFt, r2(o.monthlyRent / o.sizeSqFt));
  eq2(`option-${o.key}-effective`, `Site option ${o.key}: effective rate spreads the commission over the term`, o.effectiveRatePerSqFt, r2((o.monthlyRent + o.commission / o.termMonths) / o.sizeSqFt));
  eq(`option-${o.key}-sqm`, `Site option ${o.key}: size in m2 is size in sq ft times 0.09290304`, o.sizeSqM, Math.round(o.sizeSqFt * 0.09290304));
}

/* ---------- inbound ---------- */
for (const r of inbound.rows) {
  const v = verticals.find((x) => x.slug === r.slug)!;
  eq(`inbound-${r.slug}-split`, `Inbound, ${r.name}: mapped plus free equals stock value`, r.mappedToPo + r.freeStock, r.stockValue);
  eq(`inbound-${r.slug}-value`, `Inbound, ${r.name}: stock value equals the vertical row`, r.stockValue, v.stockValue);
  eq(`inbound-${r.slug}-transit`, `Inbound, ${r.name}: in-transit value equals the vertical row`, r.inTransitValue, v.inTransitValue);
  eq(`inbound-${r.slug}-free-pct`, `Inbound, ${r.name}: free share derives from free over stock value`, r.freeSharePct, pctOf(r.freeStock, r.stockValue));
}
eq('inbound-total-mapped', 'Inbound total mapped equals the sum of the rows', sum(inbound.rows.map((r) => r.mappedToPo)), inbound.total.mappedToPo);
eq('inbound-total-transit', 'Inbound total in transit equals the sum of the rows', sum(inbound.rows.map((r) => r.inTransitValue)), inbound.total.inTransitValue);
eq('inbound-items-count', 'In-transit items list every group with material in transit', inbound.items.length, groups.filter((g) => g.inTransit).length);
eq('inbound-items-value', 'In-transit item values sum to the store in-transit value', sum(inbound.items.map((i) => i.value)), total.inTransitValue);

/* ---------- calculator ---------- */
for (const c of calculator) {
  const v = verticals.find((x) => x.slug === c.slug)!;
  eq(`calc-${c.slug}-rows`, `Calculator, ${c.name}: one row per material group`, c.rows.length, groups.filter((g) => g.vertical === c.slug).length);
  eq2(`calc-${c.slug}-alloc`, `Calculator, ${c.name}: allocation equals the vertical allocation`, c.allocatedCbm, v.allocatedCbm);
  eq2(`calc-${c.slug}-total`, `Calculator, ${c.name}: row CBM sums to the vertical CBM`, sumCbm(c.rows.map((r) => r.totalCbm)), v.totalCbm);
  eq2(`calc-${c.slug}-rack`, `Calculator, ${c.name}: rackable rows sum to the vertical rackable CBM`, sumCbm(c.rows.filter((r) => r.rackable).map((r) => r.totalCbm)), v.rackableCbm);
  eq2(`calc-${c.slug}-nonrack`, `Calculator, ${c.name}: non-rackable rows sum to the vertical non-rackable CBM`, sumCbm(c.rows.filter((r) => !r.rackable).map((r) => r.totalCbm)), v.nonRackableCbm);
  for (const r of c.rows) {
    eq2(`calc-${r.slug}-unit`, `Calculator, ${r.name}: unit CBM is length times breadth times height`, r.unitCbm, unitCbm(r.lengthM, r.breadthM, r.heightM));
    eq2(`calc-${r.slug}-total`, `Calculator, ${r.name}: total CBM is unit CBM times quantity`, r.totalCbm, totalCbm(r.unitCbm, r.quantity));
  }
}

/* ---------- vertical rows against their group files ---------- */
for (const v of verticals) {
  const vg = groups.filter((g) => g.vertical === v.slug);
  eq(`${v.slug}-groups`, `${v.name}: group count equals the group files`, v.groups, vg.length);
  eq(`${v.slug}-value`, `${v.name}: group stock values sum to the vertical value`, sum(vg.map((g) => g.stockValue)), v.stockValue);
  for (const g of vg) {
    if (g.status !== 'lead' || g.inTransit || g.demandPerDay === 0) continue;
    /* control: a group above its reorder point with nothing on order crosses on day ceil((quantity - reorderPoint) / demandPerDay) and lands that day plus lead time later */
    const crossDay = Math.ceil((g.quantity - g.reorderPoint) / g.demandPerDay);
    const landDay = crossDay + g.leadTimeDays;
    const cumD = meta.projectionDays.map((_, i) => meta.projectionDays.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const landMonth = cumD.findIndex((c) => landDay <= c);
    ok(`${g.slug}-lands-in`, `${g.name}: crosses its reorder point on day ${crossDay}, lands on day ${landDay}${landMonth >= 0 ? ' in ' + meta.projectionMonths[landMonth] : ' beyond the window'}`, crossDay > 0 && landDay > crossDay);
  }
  {
    const replay = replayProjection(vg);
    for (const p of replay) eq2(`${v.slug}-projection-rule-${p.index}`, `${v.name}: projected CBM for ${p.month} follows the stated projection rule`, v.projection[p.index - 1]!.cbm, p.cbm);
  }
  eq2(`${v.slug}-cbm`, `${v.name}: group CBM sums to the vertical CBM`, sumCbm(vg.map((g) => g.totalCbm)), v.totalCbm);
  eq2(`${v.slug}-rackable`, `${v.name}: rackable groups sum to the vertical rackable CBM`, sumCbm(vg.filter((g) => g.rackable).map((g) => g.totalCbm)), v.rackableCbm);
  eq2(`${v.slug}-rack-split`, `${v.name}: rackable plus non-rackable equals total CBM`, sumCbm([v.rackableCbm, v.nonRackableCbm]), v.totalCbm);
  eq2(`${v.slug}-idle`, `${v.name}: idle CBM equals allocation less stock`, v.idleCbm, r2(v.allocatedCbm - v.totalCbm));
  eq2(`${v.slug}-overflow`, `${v.name}: group overflow CBM sums to the vertical figure`, sumCbm(vg.map((g) => g.overflowCbm)), v.overflowCbm);
  eq(`${v.slug}-util`, `${v.name}: utilisation equals CBM over allocation`, v.utilPct, utilPct(v.totalCbm, v.allocatedCbm));
  eq(`${v.slug}-daily`, `${v.name}: group daily costs sum to the vertical daily cost`, sum(vg.map((g) => g.dailyStorageCost)), v.dailyStorageCost);
  eq(`${v.slug}-below`, `${v.name}: below-reorder count equals the groups so marked`, v.belowReorder, vg.filter((g) => g.status === 'below').length);
  eq(`${v.slug}-age-sum`, `${v.name}: age bands sum to the vertical value`, v.age.under90 + v.age.d90to180 + v.age.d180to365 + v.age.over365, v.stockValue);
  eq(`${v.slug}-age-u90`, `${v.name}: under-90 band equals the sum of the groups`, sum(vg.map((g) => g.age.under90)), v.age.under90);
  eq(`${v.slug}-age-365`, `${v.name}: over-365 band equals the sum of the groups`, sum(vg.map((g) => g.age.over365)), v.age.over365);
  eq2(`${v.slug}-age-cbm`, `${v.name}: CBM by age band sums to the vertical CBM`, sumCbm([v.ageCbm.under90, v.ageCbm.d90to180, v.ageCbm.d180to365, v.ageCbm.over365]), v.totalCbm);
  eq(`${v.slug}-issues`, `${v.name}: annualised issues equal twice the forecast at unit price`, sum(vg.map((g) => g.demandH2 * g.unitPrice)) * 2, v.annualIssueValue);
  eq(`${v.slug}-turnover`, `${v.name}: turnover equals annualised issues over stock value`, v.turnover, v.stockValue === 0 ? 0 : r1(v.annualIssueValue / v.stockValue));
  eq(`${v.slug}-mapped`, `${v.name}: mapped-to-PO sums from the groups`, sum(vg.map((g) => g.mappedToPo)), v.mappedToPo);
  eq(`${v.slug}-free`, `${v.name}: mapped plus free equals stock value`, v.mappedToPo + v.freeStock, v.stockValue);
  eq(`${v.slug}-transit`, `${v.name}: in-transit value sums from the groups`, sum(vg.filter((g) => g.inTransit).map((g) => g.inTransit!.value)), v.inTransitValue);
  for (const m of v.monthly) eq(`${v.slug}-monthly-${m.index}`, `${v.name}: month-end value ${m.month} equals the sum of the groups`, sum(vg.map((g) => g.monthly[m.index - 1]!.value)), m.value);
  ok(`${v.slug}-projection-months`, `${v.name}: projection covers the stated months`, v.projection.map((p) => p.month).join('|') === meta.projectionMonths.join('|'));
}

/* ---------- group files ---------- */
for (const g of groups) {
  const s = rollup.groups.find((x) => x.slug === g.slug)!;
  eq2(`${g.slug}-unit`, `${g.name}: unit CBM is length times breadth times height`, g.unitCbm, unitCbm(g.lengthM, g.breadthM, g.heightM));
  eq2(`${g.slug}-total-cbm`, `${g.name}: total CBM is unit CBM times quantity`, g.totalCbm, totalCbm(g.unitCbm, g.quantity));
  eq(`${g.slug}-value`, `${g.name}: stock value is quantity times unit price`, g.stockValue, g.quantity * g.unitPrice);
  eq(`${g.slug}-rate`, `${g.name}: carries the store daily rate`, g.dailyRatePerCbm * 10000, site.dailyRatePerCbm * 10000);
  eq(`${g.slug}-overflow-rate`, `${g.name}: carries the overflow daily rate`, g.overflowRatePerCbm * 100, site.overflow.dailyRatePerCbm * 100);
  eq(`${g.slug}-value-per-cbm`, `${g.name}: value per CBM is stock value over group CBM, whole AED`, g.valuePerCbm, g.totalCbm === 0 ? 0 : Math.round(g.stockValue / g.totalCbm));
  eq(`${g.slug}-age-pct`, `${g.name}: age band percents sum to 100.0`, Math.round((g.agePct.under90 + g.agePct.d90to180 + g.agePct.d180to365 + g.agePct.over365) * 10) / 10, g.stockValue === 0 ? 0 : 100);
  eq(`${g.slug}-turnover`, `${g.name}: turnover is annualised issues at cost over stock value`, g.turnover, g.stockValue === 0 ? 0 : r1((g.demandH2 * g.unitPrice * 2) / g.stockValue));
  ok(`${g.slug}-stockout`, `${g.name}: stock-out date is the stock date plus days of cover`, g.daysOfCover == null ? g.stockOutDate === null : g.stockOutDate === addDays(meta.stockDate, g.daysOfCover));
  for (const m of g.monthly) eq(`${g.slug}-month-${m.index}-value`, `${g.name}: month-end value ${m.month} is quantity times unit price`, m.value, m.quantity * g.unitPrice);
  eq(`${g.slug}-summary-vpc`, `${g.name}: the roll-up summary carries the same value per CBM`, s.valuePerCbm, g.valuePerCbm);
  eq(`${g.slug}-age`, `${g.name}: age bands sum to stock value`, g.age.under90 + g.age.d90to180 + g.age.d180to365 + g.age.over365, g.stockValue);
  eq(`${g.slug}-po`, `${g.name}: mapped plus free equals stock value`, g.mappedToPo + g.freeStock, g.stockValue);
  eq2(`${g.slug}-dpd`, `${g.name}: demand per day is the forecast over ${meta.forecastDays} days`, g.demandPerDay, r2(g.demandH2 / meta.forecastDays));
  eq(`${g.slug}-rop`, `${g.name}: reorder point is safety plus lead time times demand per day, rounded up`, g.reorderPoint, Math.ceil(g.safetyStock + g.leadTimeDays * g.demandPerDay));
  eq(`${g.slug}-cover`, `${g.name}: days of cover is quantity over demand per day, rounded down`, g.daysOfCover ?? -1, g.demandPerDay > 0 ? Math.floor(g.quantity / g.demandPerDay) : -1);
  ok(`${g.slug}-status`, `${g.name}: status "${g.status}" follows the stated rule`, statusRule(g.quantity, g.reorderPoint, g.daysOfCover, g.leadTimeDays) === g.status);
  eq(`${g.slug}-daily`, `${g.name}: daily storage cost is main CBM times the rate plus overflow CBM times the overflow rate`, g.dailyStorageCost, Math.round((g.totalCbm - g.overflowCbm) * site.dailyRatePerCbm + g.overflowCbm * site.overflow.dailyRatePerCbm));
  eq(`${g.slug}-share`, `${g.name}: space share is group CBM over the vertical allocation`, g.spaceSharePct, pctOf(g.totalCbm, verticals.find((v) => v.slug === g.vertical)!.allocatedCbm));
  eq(`${g.slug}-month-12`, `${g.name}: the last month-end quantity is the current quantity`, g.monthly[11]!.quantity, g.quantity);
  eq(`${g.slug}-summary`, `${g.name}: the roll-up summary carries the same stock value`, s.stockValue, g.stockValue);
  eq(`${g.slug}-summary-daily`, `${g.name}: the roll-up summary carries the same daily storage cost`, s.dailyStorageCost, g.dailyStorageCost);
  if (g.inTransit) eq(`${g.slug}-transit`, `${g.name}: in-transit value is quantity times unit price`, g.inTransit.value, g.inTransit.quantity * g.unitPrice);
}

const failed = assertions.filter((a) => !a.pass);
const out: Reconciliation = { checkedAt: gstStamp(), policy: rollup.precisionPolicy, assertions, passed: assertions.length - failed.length, failed: failed.length };
const target = join(dataDir, 'reconciliation.json');
let previous: Reconciliation | null = null;
try {
  previous = JSON.parse(readFileSync(target, 'utf8')) as Reconciliation;
} catch {
  previous = null;
}
const same = previous && JSON.stringify(previous.assertions) === JSON.stringify(out.assertions) && JSON.stringify(previous.policy) === JSON.stringify(out.policy);
if (!same) writeFileSync(target, JSON.stringify(out, null, 1));
else console.log('Reconciliation result unchanged; file not rewritten.');
console.log(`Reconciliation: ${out.passed} of ${assertions.length} assertions pass.`);
for (const f of failed) console.error(`FAIL  ${f.id}: ${f.statement} (${f.left} vs ${f.right})`);
if (failed.length) process.exit(1);
