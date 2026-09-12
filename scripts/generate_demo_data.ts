/**
 * Deterministic synthetic data for the Halvard Central Store demo.
 *
 * Run:  bun scripts/generate_demo_data.ts
 * Out:  public/data/rollup.json, index.json, groups/<slug>.json
 *
 * Everything derives from one seed. Every rule the front end relies on (the
 * CBM rule, the reorder rule, the age bands, the cost split, the projection)
 * lives here and is asserted before any file is written. scripts/reconcile.ts
 * then re-checks the written files independently.
 *
 * Nothing in this file is, or resembles, a real company, brand, part or figure.
 * The ten verticals are copied from the MIS demo by scripts/import_verticals.ts.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { r1, r2, sumCbm, totalCbm, unitCbm, utilPct } from '../data/cbm';
import type {
  AbcClass,
  AbcRow,
  AgeBands,
  CalculatorVertical,
  CostRow,
  Definition,
  Group,
  GroupSummary,
  InTransit,
  InTransitItem,
  InboundRow,
  IndexEntry,
  Meta,
  MonthPoint,
  Overview,
  ProjectionPoint,
  RentComponent,
  ReplenishmentRow,
  ReplenishmentStatus,
  Rollup,
  Site,
  SiteOption,
  SlowMover,
  Slug,
  Source,
  StockOutItem,
  VerticalRow,
} from '../data/schema';

/* ---------- deterministic randomness ---------- */

const SEED = 20260912;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const noise = (spread: number) => 1 + between(-spread, spread);
const R = (n: number) => Math.round(n);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const pctOf = (a: number, b: number) => (b === 0 ? 0 : r1((a / b) * 100));

/** Split an integer total across weights so the parts are integers that sum exactly (largest remainder). */
function splitInt(total: number, weights: number[]): number[] {
  const w = sum(weights);
  if (w === 0) return weights.map(() => 0);
  const raw = weights.map((x) => (total * x) / w);
  const parts = raw.map((x) => Math.floor(x));
  let left = total - sum(parts);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    parts[o.i]! += 1;
    left -= 1;
  }
  return parts;
}
/** Same, for two-decimal figures: split the hundredths. */
const split2 = (total: number, weights: number[]) => splitInt(Math.round(total * 100), weights).map((x) => x / 100);
/** One-decimal shares that sum to exactly 100.0. */
const shares100 = (weights: number[]) => splitInt(1000, weights).map((x) => x / 10);

/* ---------- time, always GST ---------- */

function gstStamp(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}+04:00`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** Calendar arithmetic on a date-only value: no timezone is involved, so UTC fields are the only correct way to read it back. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/* ---------- the store ---------- */

const STOCK_DATE = '2026-08-31';
const FORECAST_DAYS = 184; /* July to December 2026 */
const PROJECTION = [
  { month: 'Sep 2026', days: 30 },
  { month: 'Oct 2026', days: 31 },
  { month: 'Nov 2026', days: 30 },
  { month: 'Dec 2026', days: 31 },
];
const COST_MONTH = { label: 'August 2026', days: 31 };
const HISTORY = ['Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026'];

const META: Meta = {
  company: 'Halvard Engineering Group',
  division: 'Building Technologies Division',
  system: 'Warehouse Information System',
  stockDate: STOCK_DATE,
  stockDateLabel: dateLabel(STOCK_DATE),
  dataAsOf: '2026-09-07T09:30:00+04:00',
  dataAsOfLabel: '07 Sep 2026 09:30 GST',
  revision: 'R2',
  currency: 'AED',
  forecastWindow: 'July to December 2026',
  forecastDays: FORECAST_DAYS,
  projectionMonths: PROJECTION.map((p) => p.month),
  projectionDays: PROJECTION.map((p) => p.days),
  seed: SEED,
  generatedAt: gstStamp(),
};

const floorAreaSqFt = 22000;
const netUsablePct = 62;
const stackingHeightM = 3.9;
const rentPerSqFtYear = 19;
const netUsableSqFt = R((floorAreaSqFt * netUsablePct) / 100);
const netUsableM2 = r2(netUsableSqFt * 0.09290304);
const capacityCbm = r2(netUsableM2 * stackingHeightM);
const annualRent = floorAreaSqFt * rentPerSqFtYear;
const dailyRatePerCbm = Math.round((annualRent / 365 / capacityCbm) * 10000) / 10000;
const OVERFLOW = { name: 'Third-party overflow store', capacityCbm: 600, dailyRatePerCbm: 0.6 };

/* ---------- verticals and material groups ---------- */

const here = dirname(fileURLToPath(import.meta.url));
const verticalsFile = JSON.parse(readFileSync(join(here, '..', 'data', 'verticals.json'), 'utf8')) as { verticals: { slug: Slug; name: string }[] };
const nameOf = new Map(verticalsFile.verticals.map((v) => [v.slug, v.name]));
const verticalName = (slug: Slug) => {
  const n = nameOf.get(slug);
  if (!n) throw new Error(`Vertical ${slug} is not in data/verticals.json; run bun run verticals`);
  return n;
};

type Character = 'fast' | 'normal' | 'slow' | 'dead';
interface GroupSpec {
  name: string;
  dims: [number, number, number];
  rackable: boolean;
  price: [number, number];
  /** Relative share of the vertical's CBM. */
  w: number;
  character: Character;
  /** Share of this group's CBM held at the overflow site. */
  overflow?: number;
}
interface VerticalConfig {
  slug: Slug;
  /** Share of site capacity allocated to the vertical, percent. */
  allocPct: number;
  /** Target utilisation of the allocation, 1.00 is exactly full. */
  targetUtil: number;
  lead: [number, number];
  groups: GroupSpec[];
}

/* Supplier codes, not names: an invented name can collide with a real company (one did), a code cannot. */
const BRANDS = ['Supplier HS-114', 'Supplier HS-127', 'Supplier HS-133', 'Supplier HS-141', 'Supplier HS-158', 'Supplier HS-162', 'Supplier HS-175', 'Supplier HS-181', 'Supplier HS-196', 'Supplier HS-204', 'Supplier HS-219', 'Supplier HS-227', 'Supplier HS-238', 'Supplier HS-245'] as const;

const VERTICALS: VerticalConfig[] = [
  {
    slug: 'electrical-distribution',
    allocPct: 22,
    targetUtil: 0.72,
    lead: [45, 90],
    groups: [
      { name: 'LV switchgear sections', dims: [2.2, 0.8, 2.3], rackable: false, price: [14000, 24000], w: 2.2, character: 'normal', overflow: 0.2 },
      { name: 'Distribution boards, wall mounted', dims: [0.6, 0.25, 0.9], rackable: true, price: [900, 1600], w: 1.2, character: 'fast' },
      { name: 'Busway straight lengths', dims: [3.0, 0.3, 0.2], rackable: false, price: [900, 1600], w: 1.5, character: 'normal' },
      { name: 'Busway fittings and joints', dims: [0.6, 0.4, 0.35], rackable: true, price: [400, 800], w: 0.7, character: 'normal' },
      { name: 'Power factor capacitor banks', dims: [0.8, 0.6, 1.6], rackable: true, price: [5000, 9000], w: 0.8, character: 'slow' },
      { name: 'Cable trays and ladders', dims: [3.0, 0.5, 0.12], rackable: false, price: [70, 140], w: 1.6, character: 'fast' },
      { name: 'Cable tray fittings', dims: [0.5, 0.5, 0.3], rackable: true, price: [40, 80], w: 0.6, character: 'fast' },
    ],
  },
  {
    slug: 'cooling',
    allocPct: 20,
    targetUtil: 1.1,
    lead: [60, 120],
    groups: [
      { name: 'Ducted fan coil units', dims: [1.2, 0.7, 0.35], rackable: true, price: [1100, 1900], w: 1.6, character: 'fast' },
      { name: 'Cassette fan coil units', dims: [0.9, 0.9, 0.35], rackable: true, price: [1300, 2200], w: 1.2, character: 'fast' },
      { name: 'Air handling unit sections', dims: [2.4, 1.4, 1.6], rackable: false, price: [9000, 17000], w: 2.4, character: 'normal', overflow: 0.35 },
      { name: 'Chiller spare compressors', dims: [1.3, 0.9, 1.1], rackable: false, price: [14000, 24000], w: 0.6, character: 'slow' },
      { name: 'Condensing units, split', dims: [0.95, 0.4, 0.8], rackable: true, price: [1800, 3200], w: 1.1, character: 'normal' },
      { name: 'Cooling tower fill packs', dims: [1.2, 0.6, 0.6], rackable: true, price: [500, 900], w: 0.8, character: 'slow' },
      { name: 'Evaporator and condenser coils', dims: [1.5, 0.3, 0.9], rackable: true, price: [1300, 2400], w: 0.9, character: 'normal' },
      { name: 'Pipework kits for split units', dims: [2.0, 0.3, 0.3], rackable: true, price: [260, 520], w: 0.7, character: 'fast' },
      { name: 'Cooling tower gearboxes and fans', dims: [1.6, 1.6, 0.8], rackable: false, price: [7000, 11000], w: 0.8, character: 'dead', overflow: 0.5 },
    ],
  },
  {
    slug: 'mechanical-systems',
    allocPct: 18,
    targetUtil: 0.66,
    lead: [20, 45],
    groups: [
      { name: 'Fire dampers, rectangular', dims: [0.8, 0.5, 0.4], rackable: true, price: [350, 620], w: 1.3, character: 'fast' },
      { name: 'Fire dampers, circular', dims: [0.5, 0.5, 0.4], rackable: true, price: [220, 400], w: 0.7, character: 'fast' },
      { name: 'Duct insulation rolls', dims: [1.2, 0.6, 0.6], rackable: true, price: [80, 150], w: 1.5, character: 'fast' },
      { name: 'Pipe insulation sections', dims: [1.0, 0.4, 0.4], rackable: true, price: [30, 60], w: 1.0, character: 'normal' },
      { name: 'Motorised valves', dims: [0.4, 0.3, 0.3], rackable: true, price: [700, 1400], w: 0.6, character: 'normal' },
      { name: 'Valve actuators', dims: [0.3, 0.25, 0.25], rackable: true, price: [450, 800], w: 0.5, character: 'normal' },
      { name: 'Balancing valves', dims: [0.35, 0.3, 0.3], rackable: true, price: [300, 560], w: 0.6, character: 'slow' },
      { name: 'Fabricated support brackets', dims: [3.0, 0.4, 0.3], rackable: false, price: [120, 220], w: 1.3, character: 'normal' },
    ],
  },
  {
    slug: 'pumps-and-water',
    allocPct: 10,
    targetUtil: 0.62,
    lead: [45, 75],
    groups: [
      { name: 'End suction pumps, bare shaft', dims: [1.1, 0.6, 0.8], rackable: true, price: [3200, 6000], w: 1.5, character: 'normal' },
      { name: 'Booster set skids', dims: [1.6, 1.0, 1.6], rackable: false, price: [13000, 22000], w: 1.6, character: 'slow' },
      { name: 'Pressure vessels', dims: [0.75, 0.75, 1.6], rackable: false, price: [1100, 2000], w: 1.0, character: 'normal' },
      { name: 'Water treatment dosing units', dims: [0.6, 0.5, 1.2], rackable: true, price: [3400, 5600], w: 0.7, character: 'slow' },
      { name: 'Pump seals and bearings', dims: [0.3, 0.25, 0.2], rackable: true, price: [180, 360], w: 0.5, character: 'fast' },
      { name: 'Pump control panels', dims: [0.7, 0.35, 0.9], rackable: true, price: [2500, 4300], w: 0.7, character: 'normal' },
    ],
  },
  {
    slug: 'vertical-transport',
    allocPct: 9,
    targetUtil: 0.55,
    lead: [90, 150],
    groups: [
      { name: 'Lift door operators', dims: [1.4, 0.5, 0.4], rackable: true, price: [3500, 5500], w: 1.0, character: 'normal' },
      { name: 'Lift controllers', dims: [0.8, 0.4, 1.8], rackable: true, price: [9000, 15000], w: 0.9, character: 'slow' },
      { name: 'Escalator steps and step chains', dims: [1.1, 0.6, 0.5], rackable: true, price: [1800, 3000], w: 1.2, character: 'normal' },
      { name: 'Modernisation kits, car interiors', dims: [2.2, 1.4, 0.6], rackable: false, price: [12000, 20000], w: 1.0, character: 'dead', overflow: 0.3 },
    ],
  },
  {
    slug: 'automation',
    allocPct: 7,
    targetUtil: 0.58,
    lead: [30, 60],
    groups: [
      { name: 'Building controllers', dims: [0.6, 0.4, 0.3], rackable: true, price: [1800, 3200], w: 0.8, character: 'fast' },
      { name: 'Field sensors and transmitters', dims: [0.35, 0.3, 0.2], rackable: true, price: [180, 360], w: 0.9, character: 'fast' },
      { name: 'Motor control drives', dims: [0.5, 0.4, 0.6], rackable: true, price: [2600, 5200], w: 1.1, character: 'normal' },
      { name: 'Motor control panels', dims: [0.8, 0.45, 1.8], rackable: false, price: [8000, 14000], w: 0.8, character: 'normal' },
      { name: 'Control cabling and accessories', dims: [0.6, 0.4, 0.4], rackable: true, price: [170, 340], w: 0.6, character: 'fast' },
    ],
  },
  {
    slug: 'trading',
    allocPct: 8,
    targetUtil: 0.28,
    lead: [14, 30],
    groups: [
      { name: 'Power cable drums', dims: [1.2, 1.2, 0.8], rackable: false, price: [3800, 7000], w: 1.0, character: 'normal' },
      { name: 'Commercial luminaires', dims: [0.6, 0.6, 0.3], rackable: true, price: [170, 320], w: 0.9, character: 'fast' },
      { name: 'Consumables and fixings', dims: [0.4, 0.3, 0.3], rackable: true, price: [40, 100], w: 0.6, character: 'fast' },
      { name: 'Power tools and site kit', dims: [0.6, 0.4, 0.3], rackable: true, price: [600, 1300], w: 0.5, character: 'normal' },
    ],
  },
  {
    slug: 'metering',
    allocPct: 3,
    targetUtil: 0.47,
    lead: [45, 75],
    groups: [
      { name: 'Utility meters, bulk packed', dims: [0.4, 0.3, 0.25], rackable: true, price: [360, 680], w: 1.0, character: 'normal' },
      { name: 'Sub-metering panels', dims: [0.6, 0.3, 0.8], rackable: true, price: [1800, 3000], w: 0.8, character: 'normal' },
      { name: 'Meter communication gateways', dims: [0.4, 0.3, 0.25], rackable: true, price: [300, 560], w: 0.5, character: 'slow' },
    ],
  },
  {
    slug: 'fabrication',
    allocPct: 2,
    targetUtil: 0.35,
    lead: [10, 20],
    groups: [{ name: 'Structural brackets, stock sizes', dims: [1.2, 0.8, 0.6], rackable: true, price: [90, 170], w: 1, character: 'normal' }],
  },
  { slug: 'services', allocPct: 1, targetUtil: 0, lead: [10, 20], groups: [] },
];
if (sum(VERTICALS.map((v) => v.allocPct)) !== 100) throw new Error('Allocation shares must sum to 100');
for (const v of VERTICALS) verticalName(v.slug);

/* ---------- build the groups ---------- */

const AGE_PROFILE: Record<Character, [number, number, number, number]> = {
  fast: [0.7, 0.22, 0.06, 0.02],
  normal: [0.52, 0.28, 0.15, 0.05],
  slow: [0.25, 0.25, 0.3, 0.2],
  dead: [0.05, 0.1, 0.3, 0.55],
};
const AGE_MID = [45, 135, 270, 540];
const PO_SHARE: Record<Character, [number, number]> = { fast: [0.35, 0.6], normal: [0.15, 0.35], slow: [0, 0.1], dead: [0, 0] };

const allocations = split2(capacityCbm, VERTICALS.map((v) => v.allocPct));
const groups: Group[] = [];
const usedSlugs = new Set<string>();

VERTICALS.forEach((vc, vi) => {
  const allocated = allocations[vi]!;
  const targetCbm = allocated * vc.targetUtil * noise(0.03);
  const wsum = sum(vc.groups.map((g) => g.w));
  vc.groups.forEach((spec, gi) => {
    const slug = slugify(spec.name);
    if (usedSlugs.has(slug)) throw new Error(`Duplicate group slug ${slug}`);
    usedSlugs.add(slug);
    const [l, b, h] = spec.dims;
    const unit = unitCbm(l, b, h);
    const cbmShare = (targetCbm * spec.w) / wsum;
    const quantity = Math.max(1, R((cbmShare / unit) * noise(0.08)));
    const total = totalCbm(unit, quantity);
    const overflowCbm = spec.overflow ? r2(total * spec.overflow) : 0;
    const unitPrice = R(between(spec.price[0], spec.price[1]));
    const stockValue = quantity * unitPrice;

    /* replenishment: pick a cover factor by status class, then derive demand from it */
    const roll = rnd();
    const f = roll < 0.28 ? between(0.3, 0.97) : roll < 0.46 ? between(1.02, 1.12) : spec.character === 'dead' ? between(7, 12) : spec.character === 'slow' ? between(2.6, 4.5) : between(1.4, 3.0);
    const leadTimeDays = R(between(vc.lead[0], vc.lead[1]));
    const safetyDays = R(between(10, 25));
    const rawDpd = quantity / (f * (safetyDays + leadTimeDays));
    /* dead stock has no forecast demand at all, so days of cover is null and the page says so */
    const demandH2 = spec.character === 'dead' ? 0 : Math.max(1, R(rawDpd * FORECAST_DAYS));
    const demandPerDay = r2(demandH2 / FORECAST_DAYS);
    const safetyStock = Math.max(1, R(safetyDays * demandPerDay));
    const reorderPoint = Math.ceil(safetyStock + leadTimeDays * demandPerDay);
    const daysOfCover = demandPerDay > 0 ? Math.floor(quantity / demandPerDay) : null;
    const orderCycleDays = R(between(60, 120));
    const maxStock = demandPerDay === 0 ? reorderPoint : reorderPoint + Math.max(1, R(demandPerDay * orderCycleDays));
    const status: ReplenishmentStatus = quantity <= reorderPoint ? 'below' : daysOfCover != null && daysOfCover <= leadTimeDays + 30 ? 'lead' : 'healthy';
    const stockOutDate = daysOfCover != null ? addDays(STOCK_DATE, daysOfCover) : null;

    /* aging */
    const prof = AGE_PROFILE[spec.character].map((p) => p * noise(0.25));
    const [under90, d90to180, d180to365, over365] = splitInt(stockValue, prof) as [number, number, number, number];
    const age: AgeBands = { under90, d90to180, d180to365, over365 };
    const avgAgeDays = stockValue === 0 ? 0 : R((under90 * AGE_MID[0]! + d90to180 * AGE_MID[1]! + d180to365 * AGE_MID[2]! + over365 * AGE_MID[3]!) / stockValue);
    const [ap0, ap1, ap2, ap3] = shares100([under90, d90to180, d180to365, over365]) as [number, number, number, number];
    const agePct: AgeBands = { under90: ap0, d90to180: ap1, d180to365: ap2, over365: ap3 };

    /* commitments */
    const [poLo, poHi] = PO_SHARE[spec.character];
    const mappedToPo = R(stockValue * between(poLo, poHi));
    const freeStock = stockValue - mappedToPo;
    let inTransit: InTransit | null = null;
    const wantsTransit = status === 'below' ? rnd() < 0.7 : status === 'lead' ? rnd() < 0.5 : rnd() < 0.18;
    if (wantsTransit && spec.character !== 'dead') {
      const q = Math.max(1, R((maxStock - quantity) * between(0.5, 1.0)));
      const arrival = addDays(STOCK_DATE, R(between(6, 70)));
      inTransit = { quantity: q, value: q * unitPrice, expectedArrival: arrival, expectedArrivalLabel: dateLabel(arrival) };
    }

    /* twelve months of month-end stock, ending at the current position */
    const q: number[] = new Array<number>(12);
    q[11] = quantity;
    for (let m = 10; m >= 0; m--) {
      const issues = demandPerDay * 30 * noise(0.4);
      const receipt = rnd() < 0.28 ? R(demandPerDay * between(45, 110)) : 0;
      q[m] = Math.max(0, R(q[m + 1]! + issues - receipt));
    }
    const monthly: MonthPoint[] = HISTORY.map((month, i) => ({ month, index: i + 1, quantity: q[i]!, value: q[i]! * unitPrice }));

    groups.push({
      slug,
      name: spec.name,
      brand: BRANDS[(vi * 7 + gi * 3) % BRANDS.length]!,
      vertical: vc.slug,
      verticalName: verticalName(vc.slug),
      lengthM: l,
      breadthM: b,
      heightM: h,
      unitCbm: unit,
      quantity,
      totalCbm: total,
      rackable: spec.rackable,
      overflowCbm,
      unitPrice,
      valuePerCbm: total === 0 ? 0 : R(stockValue / total),
      dailyRatePerCbm,
      overflowRatePerCbm: OVERFLOW.dailyRatePerCbm,
      stockValue,
      dailyStorageCost: R((total - overflowCbm) * dailyRatePerCbm + overflowCbm * OVERFLOW.dailyRatePerCbm),
      spaceSharePct: pctOf(total, allocated),
      safetyStock,
      maxStock,
      leadTimeDays,
      demandH2,
      demandPerDay,
      reorderPoint,
      daysOfCover,
      stockOutDate,
      stockOutDateLabel: stockOutDate ? dateLabel(stockOutDate) : null,
      status,
      age,
      agePct,
      avgAgeDays,
      turnover: stockValue === 0 ? 0 : r1((demandH2 * unitPrice * 2) / stockValue),
      abc: 'C',
      valueSharePct: 0,
      mappedToPo,
      freeStock,
      inTransit,
      monthly,
    });
  });
});

/* ABC by cumulative value share: A to 70 percent, B to 90, C the rest. Shares sum to exactly 100.0. */
{
  const byValue = [...groups].sort((a, b) => b.stockValue - a.stockValue);
  const shares = shares100(byValue.map((g) => g.stockValue));
  let cum = 0;
  byValue.forEach((g, i) => {
    cum = Math.round((cum + shares[i]!) * 10) / 10;
    g.valueSharePct = shares[i]!;
    g.abc = cum <= 70 ? 'A' : cum <= 90 ? 'B' : 'C';
  });
}

/* ---------- vertical rows ---------- */

const bandsSum = (rows: AgeBands[]): AgeBands => ({ under90: sum(rows.map((r) => r.under90)), d90to180: sum(rows.map((r) => r.d90to180)), d180to365: sum(rows.map((r) => r.d180to365)), over365: sum(rows.map((r) => r.over365)) });
const bands2Sum = (rows: AgeBands[]): AgeBands => ({ under90: sumCbm(rows.map((r) => r.under90)), d90to180: sumCbm(rows.map((r) => r.d90to180)), d180to365: sumCbm(rows.map((r) => r.d180to365)), over365: sumCbm(rows.map((r) => r.over365)) });

/** CBM by age band for one group: its CBM split in proportion to its value bands, in hundredths. */
function ageCbmOf(g: Group): AgeBands {
  const [a, b, c, d] = split2(g.totalCbm, [g.age.under90, g.age.d90to180, g.age.d180to365, g.age.over365]) as [number, number, number, number];
  return { under90: a, d90to180: b, d180to365: c, over365: d };
}

/** Whole days from the stock date to a YYYY-MM-DD date (calendar arithmetic on date-only values). */
function daysFromStockDate(iso: string): number {
  const d = (s: string) => {
    const [y, m, dd] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((d(iso) - d(STOCK_DATE)) / 86400000);
}

/**
 * Space projection, day by day, reported at each month end. Each group's balance
 * falls by its demand per day and never below zero; an arrival lands on that
 * floored balance on its day. An order is placed on the first day the balance is
 * at or under the reorder point while nothing is on order, for max stock less the
 * balance, and lands one lead time (in days) later, in whatever month that day
 * falls. A group already at or under its reorder point on the stock date orders
 * that day. In-transit material lands on its expected date. Month-end CBM is the
 * group's unit CBM times its balance rounded to whole units.
 */
function project(vgroups: Group[]): ProjectionPoint[] {
  const cum = PROJECTION.map((_, i) => sum(PROJECTION.slice(0, i + 1).map((x) => x.days)));
  const last = cum[cum.length - 1]!;
  const balance = new Map(vgroups.map((g) => [g.slug, g.quantity as number]));
  const orders = new Map<string, { day: number; quantity: number }[]>();
  for (const g of vgroups) {
    const list: { day: number; quantity: number }[] = [];
    if (g.inTransit) list.push({ day: daysFromStockDate(g.inTransit.expectedArrival), quantity: g.inTransit.quantity });
    else if (g.status === 'below') list.push({ day: g.leadTimeDays, quantity: Math.max(0, g.maxStock - g.quantity) });
    orders.set(g.slug, list);
  }
  const out: ProjectionPoint[] = [];
  for (let day = 1; day <= last; day++) {
    for (const g of vgroups) {
      const list = orders.get(g.slug)!;
      let b = Math.max(0, balance.get(g.slug)! - g.demandPerDay);
      b += sum(list.filter((o) => o.day === day).map((o) => o.quantity));
      if (b <= g.reorderPoint && g.demandPerDay > 0 && !list.some((o) => o.day > day)) list.push({ day: day + g.leadTimeDays, quantity: Math.max(0, g.maxStock - R(b)) });
      balance.set(g.slug, b);
    }
    const mi = cum.indexOf(day);
    if (mi >= 0) out.push({ month: PROJECTION[mi]!.month, index: mi + 1, cbm: sumCbm(vgroups.map((g) => totalCbm(g.unitCbm, R(balance.get(g.slug)!)))) });
  }
  return out;
}

const verticalValueShares = shares100(VERTICALS.map((vc) => sum(groups.filter((g) => g.vertical === vc.slug).map((g) => g.stockValue))));
const verticalCostShares = shares100(VERTICALS.map((vc) => sum(groups.filter((g) => g.vertical === vc.slug).map((g) => g.dailyStorageCost))));
const verticals: VerticalRow[] = VERTICALS.map((vc, vi) => {
  const vg = groups.filter((g) => g.vertical === vc.slug);
  const total = sumCbm(vg.map((g) => g.totalCbm));
  const rack = sumCbm(vg.filter((g) => g.rackable).map((g) => g.totalCbm));
  const allocated = allocations[vi]!;
  const stockValue = sum(vg.map((g) => g.stockValue));
  const annualIssueValue = sum(vg.map((g) => g.demandH2 * g.unitPrice)) * 2;
  const arrivals = vg.filter((g) => g.inTransit);
  return {
    slug: vc.slug,
    name: verticalName(vc.slug),
    groups: vg.length,
    stockValue,
    valueSharePct: verticalValueShares[vi]!,
    totalCbm: total,
    rackableCbm: rack,
    nonRackableCbm: r2(total - rack),
    allocatedCbm: allocated,
    idleCbm: r2(allocated - total),
    overflowCbm: sumCbm(vg.map((g) => g.overflowCbm)),
    utilPct: utilPct(total, allocated),
    dailyStorageCost: sum(vg.map((g) => g.dailyStorageCost)),
    dailyCostSharePct: verticalCostShares[vi]!,
    belowReorder: vg.filter((g) => g.status === 'below').length,
    age: bandsSum(vg.map((g) => g.age)),
    ageCbm: bands2Sum(vg.map(ageCbmOf)),
    annualIssueValue,
    turnover: stockValue === 0 ? 0 : r1(annualIssueValue / stockValue),
    projection: project(vg),
    mappedToPo: sum(vg.map((g) => g.mappedToPo)),
    freeStock: sum(vg.map((g) => g.freeStock)),
    inTransitQuantity: sum(arrivals.map((g) => g.inTransit!.quantity)),
    inTransitValue: sum(arrivals.map((g) => g.inTransit!.value)),
    monthly: HISTORY.map((month, i) => ({ month, index: i + 1, quantity: sum(vg.map((g) => g.monthly[i]!.quantity)), value: sum(vg.map((g) => g.monthly[i]!.value)) })),
  };
});

const totalRow: VerticalRow = {
  slug: 'total',
  name: 'Central store',
  groups: groups.length,
  stockValue: sum(verticals.map((v) => v.stockValue)),
  valueSharePct: 100,
  totalCbm: sumCbm(verticals.map((v) => v.totalCbm)),
  rackableCbm: sumCbm(verticals.map((v) => v.rackableCbm)),
  nonRackableCbm: sumCbm(verticals.map((v) => v.nonRackableCbm)),
  allocatedCbm: sumCbm(verticals.map((v) => v.allocatedCbm)),
  idleCbm: sumCbm(verticals.map((v) => v.idleCbm)),
  overflowCbm: sumCbm(verticals.map((v) => v.overflowCbm)),
  utilPct: utilPct(sumCbm(verticals.map((v) => v.totalCbm)), capacityCbm),
  dailyStorageCost: sum(verticals.map((v) => v.dailyStorageCost)),
  dailyCostSharePct: 100,
  belowReorder: sum(verticals.map((v) => v.belowReorder)),
  age: bandsSum(verticals.map((v) => v.age)),
  ageCbm: bands2Sum(verticals.map((v) => v.ageCbm)),
  annualIssueValue: sum(verticals.map((v) => v.annualIssueValue)),
  turnover: r1(sum(verticals.map((v) => v.annualIssueValue)) / sum(verticals.map((v) => v.stockValue))),
  projection: PROJECTION.map((p, i) => ({ month: p.month, index: i + 1, cbm: sumCbm(verticals.map((v) => v.projection[i]!.cbm)) })),
  mappedToPo: sum(verticals.map((v) => v.mappedToPo)),
  freeStock: sum(verticals.map((v) => v.freeStock)),
  inTransitQuantity: sum(verticals.map((v) => v.inTransitQuantity)),
  inTransitValue: sum(verticals.map((v) => v.inTransitValue)),
  monthly: HISTORY.map((month, i) => ({ month, index: i + 1, quantity: sum(verticals.map((v) => v.monthly[i]!.quantity)), value: sum(verticals.map((v) => v.monthly[i]!.value)) })),
};

/* ---------- overview ---------- */

const stocked = verticals.filter((v) => v.groups > 0);
const overV = [...stocked].sort((a, b) => b.utilPct - a.utilPct)[0]!;
const underV = [...stocked].sort((a, b) => a.utilPct - b.utilPct)[0]!;
/* every group that needs an order: at or under its reorder point, or running out within 60 days, or both; least cover first */
const needsOrder: StockOutItem[] = groups
  .filter((g) => g.status === 'below' || (g.daysOfCover != null && g.daysOfCover <= 60))
  .sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity))
  .map((g) => ({ slug: g.slug, name: g.name, vertical: g.vertical, verticalName: g.verticalName, quantity: g.quantity, reorderPoint: g.reorderPoint, status: g.status, daysOfCover: g.daysOfCover, stockOutDate: g.stockOutDate, stockOutDateLabel: g.stockOutDateLabel, inTransitArrival: g.inTransit ? g.inTransit.expectedArrivalLabel : null }));
const overview: Overview = {
  stockValue: totalRow.stockValue,
  totalCbm: totalRow.totalCbm,
  capacityCbm,
  utilPct: totalRow.utilPct,
  dailyStorageCost: totalRow.dailyStorageCost,
  annualisedStorageCost: totalRow.dailyStorageCost * 365,
  overflowDailyCost: R(totalRow.overflowCbm * OVERFLOW.dailyRatePerCbm),
  projectionPeak: (() => {
    const peak = [...totalRow.projection].sort((a, b) => b.cbm - a.cbm)[0]!;
    return { month: peak.month, cbm: peak.cbm, pctOfCapacity: pctOf(peak.cbm, capacityCbm) };
  })(),
  belowReorder: totalRow.belowReorder,
  needsOrder,
  age: totalRow.age,
  agePct: { under90: pctOf(totalRow.age.under90, totalRow.stockValue), d90to180: pctOf(totalRow.age.d90to180, totalRow.stockValue), d180to365: pctOf(totalRow.age.d180to365, totalRow.stockValue), over365: pctOf(totalRow.age.over365, totalRow.stockValue) },
  overVertical: { slug: overV.slug, name: overV.name, utilPct: overV.utilPct },
  underVertical: { slug: underV.slug, name: underV.name, utilPct: underV.utilPct },
};

/* ---------- aging ---------- */

const slowMovers: SlowMover[] = [...groups]
  .map((g) => ({ g, over: g.age.d180to365 + g.age.over365 }))
  .sort((a, b) => b.over - a.over)
  .slice(0, 15)
  .map(({ g, over }) => ({ slug: g.slug, name: g.name, vertical: g.vertical, verticalName: g.verticalName, stockValue: g.stockValue, valueOver180: over, over180Pct: pctOf(over, g.stockValue), avgAgeDays: g.avgAgeDays, turnover: g.turnover }));
const ABC_RULE: Record<AbcClass, string> = {
  A: 'Prime storage: ground-level rack faces nearest dispatch, counted monthly.',
  B: 'Standard rack locations, counted quarterly.',
  C: 'Upper rack levels or the overflow store, counted at the annual stock take.',
};
/* class shares are the sums of the member groups' published shares, so the class table and every group page agree */
const abc: AbcRow[] = (['A', 'B', 'C'] as AbcClass[]).map((cls) => ({ cls, groups: groups.filter((g) => g.abc === cls).length, stockValue: sum(groups.filter((g) => g.abc === cls).map((g) => g.stockValue)), sharePct: Math.round(sum(groups.filter((g) => g.abc === cls).map((g) => g.valueSharePct)) * 10) / 10, rule: ABC_RULE[cls] }));

/* ---------- replenishment ---------- */

const replenishmentRows: ReplenishmentRow[] = groups.map((g) => ({ slug: g.slug, name: g.name, brand: g.brand, vertical: g.vertical, verticalName: g.verticalName, quantity: g.quantity, safetyStock: g.safetyStock, maxStock: g.maxStock, leadTimeDays: g.leadTimeDays, demandPerDay: g.demandPerDay, reorderPoint: g.reorderPoint, daysOfCover: g.daysOfCover, stockOutDate: g.stockOutDate, stockOutDateLabel: g.stockOutDateLabel, status: g.status }));
const counts = { below: groups.filter((g) => g.status === 'below').length, lead: groups.filter((g) => g.status === 'lead').length, healthy: groups.filter((g) => g.status === 'healthy').length };

/* ---------- cost ---------- */

const HANDLING_FIXED = 16800; /* four storekeepers for the month */
const UTILITIES = 6400;
const HANDLING_PER_MOVEMENT = 6;
const monthlyRent = R(annualRent / 12);
const cbmWeights = verticals.map((v) => v.totalCbm);
const fixedSplit = splitInt(HANDLING_FIXED, cbmWeights);
const utilSplit = splitInt(UTILITIES, cbmWeights);
const costRows: CostRow[] = verticals.map((v, i) => {
  const vg = groups.filter((g) => g.vertical === v.slug);
  const rent = sum(vg.map((g) => R((g.totalCbm - g.overflowCbm) * dailyRatePerCbm * COST_MONTH.days)));
  const overflow = sum(vg.map((g) => R(g.overflowCbm * OVERFLOW.dailyRatePerCbm * COST_MONTH.days)));
  const movements = sum(vg.map((g) => R(g.demandPerDay * COST_MONTH.days)));
  const row: CostRow = { slug: v.slug, name: v.name, mainCbm: r2(v.totalCbm - v.overflowCbm), overflowCbm: v.overflowCbm, dailyStorageCost: v.dailyStorageCost, rent, handlingFixed: fixedSplit[i]!, handlingVariable: movements * HANDLING_PER_MOVEMENT, utilities: utilSplit[i]!, overflow, total: 0, sharePct: 0 };
  row.total = row.rent + row.handlingFixed + row.handlingVariable + row.utilities + row.overflow;
  return row;
});
const rentChargedToStock = sum(costRows.map((r) => r.rent));
const idleRent = monthlyRent - rentChargedToStock;
/* the idle row's CBM is capacity less every vertical's main-store CBM, so the column adds to capacity */
costRows.push({ slug: 'idle', name: 'Idle capacity, rent not charged to stock', mainCbm: r2(capacityCbm - sumCbm(costRows.map((r) => r.mainCbm))), overflowCbm: 0, dailyStorageCost: 0, rent: idleRent, handlingFixed: 0, handlingVariable: 0, utilities: 0, overflow: 0, total: idleRent, sharePct: 0 });
const costShares = shares100(costRows.map((r) => r.total));
costRows.forEach((r, i) => (r.sharePct = costShares[i]!));
const costTotal: CostRow = { slug: 'total', name: 'Central store', mainCbm: sumCbm(costRows.map((r) => r.mainCbm)), overflowCbm: sumCbm(costRows.map((r) => r.overflowCbm)), dailyStorageCost: sum(costRows.map((r) => r.dailyStorageCost)), rent: sum(costRows.map((r) => r.rent)), handlingFixed: sum(costRows.map((r) => r.handlingFixed)), handlingVariable: sum(costRows.map((r) => r.handlingVariable)), utilities: sum(costRows.map((r) => r.utilities)), overflow: sum(costRows.map((r) => r.overflow)), total: sum(costRows.map((r) => r.total)), sharePct: 100 };

const TERM = 36;
/** An option's rent is the sum of its parts, each an area at a rate; the commission is a percent of the rent on the NEW parts only. */
const optionOf = (key: string, name: string, location: string, components: RentComponent[], commissionPctOfNew: number, note: string): SiteOption => {
  const sizeSqFt = sum(components.map((c) => c.sizeSqFt));
  const annual = sum(components.map((c) => c.sizeSqFt * c.ratePerSqFtYear));
  const newRent = sum(components.filter((c) => c.label !== 'current unit').map((c) => c.sizeSqFt * c.ratePerSqFtYear));
  const monthly = R(annual / 12);
  const commission = R((newRent * commissionPctOfNew) / 100);
  return { key, name, location, sizeSqM: R(sizeSqFt * 0.09290304), sizeSqFt, components, annualRent: annual, monthlyRent: monthly, monthlyRatePerSqFt: r2(monthly / sizeSqFt), commission, effectiveRatePerSqFt: r2((monthly + commission / TERM) / sizeSqFt), termMonths: TERM, note };
};
const current: RentComponent = { label: 'current unit', sizeSqFt: floorAreaSqFt, ratePerSqFtYear: rentPerSqFtYear };
const siteOptions: SiteOption[] = [
  optionOf('A', 'Keep the current store', 'Sector 4, current unit', [current], 0, 'No move. Overflow continues at the third-party rate.'),
  optionOf('B', 'Take the adjoining unit as well', 'Sector 4, current plus adjoining unit', [current, { label: 'adjoining unit', sizeSqFt: 8000, ratePerSqFtYear: 26 }], 5, 'Adjoining 8,000 sq ft at AED 26 on top of the current unit; the rate shown is the blend. Overflow store released.'),
  optionOf('C', 'Move to a larger site farther out', 'North logistics zone', [{ label: 'new site', sizeSqFt: 36000, ratePerSqFtYear: 19 }], 5, 'Forty minutes farther from the main project cluster; handling cost rises.'),
  optionOf('D', 'Move to a mid-size site nearby', 'Harbour industrial estate', [{ label: 'new site', sizeSqFt: 28000, ratePerSqFtYear: 24 }], 5, 'Same drive time as today; modern racking, higher stacking height.'),
];

/* ---------- inbound ---------- */

const inboundRows: InboundRow[] = verticals.map((v) => {
  const arrivals = groups.filter((g) => g.vertical === v.slug && g.inTransit).map((g) => g.inTransit!.expectedArrival).sort();
  return { slug: v.slug, name: v.name, stockValue: v.stockValue, mappedToPo: v.mappedToPo, freeStock: v.freeStock, freeSharePct: pctOf(v.freeStock, v.stockValue), inTransitQuantity: v.inTransitQuantity, inTransitValue: v.inTransitValue, nextArrival: arrivals[0] ? dateLabel(arrivals[0]) : null };
});
const inboundTotal: InboundRow = { slug: 'total', name: 'Central store', stockValue: totalRow.stockValue, mappedToPo: totalRow.mappedToPo, freeStock: totalRow.freeStock, freeSharePct: pctOf(totalRow.freeStock, totalRow.stockValue), inTransitQuantity: totalRow.inTransitQuantity, inTransitValue: totalRow.inTransitValue, nextArrival: null };
const inTransitItems: InTransitItem[] = groups
  .filter((g) => g.inTransit)
  .map((g) => ({ slug: g.slug, name: g.name, vertical: g.vertical, verticalName: g.verticalName, quantity: g.inTransit!.quantity, value: g.inTransit!.value, expectedArrival: g.inTransit!.expectedArrival, expectedArrivalLabel: g.inTransit!.expectedArrivalLabel }))
  .sort((a, b) => a.expectedArrival.localeCompare(b.expectedArrival));

/* ---------- calculator ---------- */

const calculator: CalculatorVertical[] = verticals.map((v) => {
  const vg = groups.filter((g) => g.vertical === v.slug);
  return { slug: v.slug, name: v.name, allocatedCbm: v.allocatedCbm, rackableCbm: v.rackableCbm, nonRackableCbm: v.nonRackableCbm, totalCbm: v.totalCbm, rows: vg.map((g) => ({ slug: g.slug, name: g.name, lengthM: g.lengthM, breadthM: g.breadthM, heightM: g.heightM, quantity: g.quantity, rackable: g.rackable, unitCbm: g.unitCbm, totalCbm: g.totalCbm })) };
});

/* ---------- sources, definitions, policy, assumptions ---------- */

const sources: Record<string, Source> = {
  'site': { key: 'site', label: 'Store parameters: floor area, net usable share, stacking height, rent, and the derived capacity and daily rate' },
  'groups': { key: 'groups', label: 'Material group master: one row per material group with dimensions, quantity, price, replenishment settings and age profile' },
  'verticals': { key: 'verticals', label: 'Vertical roll-up: sums of the material group rows by vertical, with the allocation and projection' },
  'cost': { key: 'cost', label: 'Cost split for the month: rent charged to stock, handling, utilities and the overflow store' },
  'siteOptions': { key: 'siteOptions', label: 'Site options: the current unit and three alternatives on one comparison template' },
  'inbound': { key: 'inbound', label: 'Commitments: stock mapped to purchase orders, free stock, and material in transit with its expected arrival' },
};

const D = (key: string, term: string, text: string): [string, Definition] => [key, { key, term, text }];
const definitions: Record<string, Definition> = Object.fromEntries([
  D('cbm', 'CBM', 'Cubic metres. The whole store is measured by volume, not pallet count. Unit CBM is length times breadth times height in metres, formed in whole cubic centimetres and rounded once to two decimals so a true half always rounds up; group CBM is unit CBM times quantity, exact.'),
  D('capacity', 'Capacity', `Net usable floor area times the stacking height: ${netUsableSqFt.toLocaleString('en-GB')} sq ft (${netUsablePct} percent of ${floorAreaSqFt.toLocaleString('en-GB')}) is ${netUsableM2} m2, times ${stackingHeightM} m is ${capacityCbm} CBM.`),
  D('allocation', 'Allocated CBM', 'The share of capacity set aside for a vertical. Allocations sum to the store capacity. Idle CBM is allocation less stock held; a negative figure is stock over the allocation.'),
  D('utilisation', 'Utilisation', 'Stock CBM (main store plus overflow) over allocated CBM, or over store capacity for the whole store, as a percentage to one decimal. The optimal band is 60 to 80 percent: below it space is paid for and unused, above it picking and put-away slow down.'),
  D('rackable', 'Rackable', 'A group that can be held on standard pallet racking. Non-rackable stock is floor stored or held at the overflow site, and it is the stock that consumes floor area fastest.'),
  D('overflow', 'Overflow store', `Third-party space rented by the CBM per day at AED ${OVERFLOW.dailyRatePerCbm}, ${(OVERFLOW.dailyRatePerCbm / dailyRatePerCbm).toFixed(1)} times the store's own rate.`),
  D('dailyRate', 'Daily storage rate', `Annual rent over 365 days over capacity CBM: AED ${annualRent.toLocaleString('en-GB')} over 365 over ${capacityCbm} is AED ${dailyRatePerCbm} per CBM per day.`),
  D('dailyCost', 'Daily storage cost', 'For a group, main-store CBM times the daily rate plus overflow CBM times the overflow rate, rounded once to whole AED. For a vertical and for the store, the sum of its groups.'),
  D('stockValue', 'Stock value', 'Quantity times average unit price at cost, whole AED, per material group. Every higher figure is a sum.'),
  D('ageBands', 'Age bands', 'Stock value by days since receipt: under 90, 90 to 180, 180 to 365, over 365. The bands sum to stock value. CBM by band splits the group CBM in the same proportion.'),
  D('avgAge', 'Average age', 'Value-weighted days since receipt, using the band midpoints 45, 135, 270 and 540 days.'),
  D('turnover', 'Turnover', 'Annualised issues at cost (twice the July to December forecast times unit price) over stock value. Higher is faster moving.'),
  D('abc', 'ABC class', 'Material groups ranked by stock value; A is the first 70 percent of value, B the next 20, C the last 10. Each class carries a storage rule.'),
  D('safetyStock', 'Safety stock', 'The units held against demand variation and late delivery: ten to twenty-five days of forecast demand, set per group.'),
  D('maxStock', 'Max stock', 'Reorder point plus one order cycle of demand. The quantity an order tops the group up to.'),
  D('leadTime', 'Lead time', 'Days from purchase order to receipt at the store, per group, from supplier history.'),
  D('demand', 'Forecast demand', `Units expected to issue in ${META.forecastWindow} (${FORECAST_DAYS} days). Demand per day is that figure over ${FORECAST_DAYS}, to two decimals.`),
  D('reorderPoint', 'Reorder point', 'Safety stock plus lead time times demand per day, rounded up. When stock falls to it, an order placed today arrives as safety stock is reached.'),
  D('daysOfCover', 'Days of cover', 'Quantity over demand per day, rounded down. The projected stock-out date is the stock date plus days of cover. A group with no forecast demand has no days of cover and no stock-out date; it shows as healthy for ordering and as a slow mover for aging.'),
  D('status', 'Status', 'Below reorder point: quantity at or under the reorder point, order now. Within lead time: above the reorder point but days of cover within lead time plus 30 days, order this month. Healthy: neither.'),
  D('mapped', 'Mapped to purchase orders', 'Stock value already committed to a customer order. Free stock is stock value less that commitment.'),
  D('inTransit', 'In transit', 'Ordered material not yet received, with its expected arrival date. Not counted in stock.'),
  D('projection', 'Space projection', 'Month-end CBM for the next four months, simulated day by day: each group falls by its demand per day and never below zero; material in transit lands on its expected date; an order for max stock less the balance is placed on the first day the balance is at or under the reorder point while nothing is on order, and lands one lead time in days later, in whatever month that day falls (a group already below on the stock date orders that day). Month-end CBM is unit CBM times the balance in whole units.'),
  D('rentCharged', 'Rent charged to stock', 'Main-store CBM times the daily rate times the days in the month, per group, rounded once. Rent for idle capacity is shown on its own line so the month adds to the actual rent, and the CBM column counts main-store CBM only so it adds to capacity; overflow CBM has its own column.'),
  D('handling', 'Handling', 'Fixed: the storekeepers, split by CBM share. Variable: forecast issues in the month times AED 6 per movement.'),
  D('effectiveRate', 'Effective rate', `Monthly rent plus the one-off agent commission spread over a ${TERM}-month term, per sq ft per month. An option's annual rent is the sum of its parts, each an area at a rate; the commission is 5 percent of the rent on new space only.`),
]);

const precisionPolicy = [
  'Money is an integer in AED at the material-group level, rounded once: quantity times unit price for stock value, CBM times the daily rate for storage cost. Every vertical and store figure is a sum of those integers, so tables that show the same figure tie exactly.',
  'CBM is rounded once to two decimals at the unit level (length times breadth times height) and once at the group level (unit CBM times quantity). Every higher CBM figure is a sum of those two-decimal figures, carried in hundredths, and the calculator in the browser applies the same rule from data/cbm.ts.',
  'Percentages are one decimal from the sums, never from other percentages. Shares that must total 100.0 (ABC classes, value shares) are allocated by largest remainder.',
  'Age bands, CBM by band, and the month cost allocations are integer splits by largest remainder, so each set sums exactly to its total.',
  'Demand per day is the forecast over 184 days to two decimals; the reorder point rounds up; days of cover rounds down. Status derives from those three figures by the stated rule for every group, with no hand overrides.',
  'Dates are calendar days from the stock date, 31 August 2026. Every timestamp is GST (Asia/Dubai, +04:00).',
];

const assumptions = [
  'Halvard Engineering Group is fictional. Every material group, brand, quantity, price, dimension and date is generated from one seed by scripts/generate_demo_data.ts. No real company, part number, supplier or site appears.',
  'The central store holds the stocked material groups of the ten verticals. Project-site stock, service spares on vans and software licences carried as inventory in the division books are outside the store, so the store value sits below the division inventory line in the MIS.',
  `Store parameters are chosen, not measured: ${floorAreaSqFt.toLocaleString('en-GB')} sq ft at AED ${rentPerSqFtYear} per sq ft per year, ${netUsablePct} percent net usable after aisles, docks and offices, ${stackingHeightM} m usable stacking height.`,
  'Allocations by vertical are a planning split of capacity, not physical walls. One vertical over its allocation and one well under it are deliberate, to show what the pages do with each.',
  'The overflow store is priced per CBM per day and holds only non-rackable items from three verticals. Its CBM counts in each vertical utilisation because the stock exists whether or not it fits.',
  'Forecast demand is July to December 2026 by group. Lead times are supplier history by vertical. Safety stock is ten to twenty-five days of demand. These drive the reorder points shown; changing them in the generator changes every status.',
  'The site options are illustrative: one current unit and three alternatives on the same comparison template. Rents and commissions are chosen figures.',
  'The CBM calculator edits live only in the browser session. Reset restores the published figures. Nothing is saved and nothing is sent anywhere.',
];

/* ---------- magnitude report, then assertions before writing ---------- */

console.log(`Stock value AED ${totalRow.stockValue.toLocaleString('en-GB')}; ${totalRow.totalCbm} of ${capacityCbm} CBM (${overview.utilPct}%); AED ${overview.dailyStorageCost}/day; ${counts.below} below reorder point, ${counts.lead} within lead time, ${counts.healthy} healthy.`);
console.log(`Over: ${overV.name} ${overV.utilPct}%; under: ${underV.name} ${underV.utilPct}%. Older than 180 days: ${r1(overview.agePct.d180to365 + overview.agePct.over365)}% (over a year ${overview.agePct.over365}%). Overflow ${totalRow.overflowCbm} of ${OVERFLOW.capacityCbm} CBM.`);
for (const v of verticals) console.log(`  ${v.name.padEnd(24)} groups ${String(v.groups).padStart(2)}  value ${v.stockValue.toLocaleString('en-GB').padStart(11)}  cbm ${String(v.totalCbm).padStart(8)} / ${String(v.allocatedCbm).padStart(8)}  ${String(v.utilPct).padStart(5)}%  below ${v.belowReorder}  turnover ${v.turnover}`);

/* assertions */

const fail = (m: string) => {
  throw new Error(`Generator assertion failed: ${m}`);
};
if (totalRow.stockValue < 18_000_000 || totalRow.stockValue > 30_000_000) fail(`stock value ${totalRow.stockValue} outside AED 18m to 30m`);
if (totalRow.stockValue % 1000 === 0) fail('store stock value is an exact round thousand; change the seed');
if (capacityCbm < 4000 || capacityCbm > 6000) fail(`capacity ${capacityCbm} outside 4,000 to 6,000 CBM`);
if (overview.utilPct < 55 || overview.utilPct > 75) fail(`overall utilisation ${overview.utilPct} outside 55 to 75`);
if (verticals.filter((v) => v.utilPct > 100).length !== 1) fail(`expected exactly one vertical over its allocation, got ${verticals.filter((v) => v.utilPct > 100).map((v) => v.slug).join(',')}`);
if (underV.utilPct > 40) fail(`the most under-used stocked vertical is at ${underV.utilPct}, not badly under`);
if (overview.dailyStorageCost < 400 || overview.dailyStorageCost > 900) fail(`daily storage cost ${overview.dailyStorageCost} outside 400 to 900`);
if (counts.below < 8 || counts.below > 16) fail(`${counts.below} groups below reorder point, outside 8 to 16`);
{
  const over180 = overview.agePct.d180to365 + overview.agePct.over365;
  if (over180 < 15 || over180 > 28) fail(`${over180} percent of value older than 180 days, outside 15 to 28`);
  if (overview.agePct.over365 < 5) fail(`${overview.agePct.over365} percent over a year is not a visible slice`);
}
if (totalRow.overflowCbm > OVERFLOW.capacityCbm) fail(`overflow ${totalRow.overflowCbm} exceeds the overflow capacity`);
if (groups.length < 40 || groups.length > 50) fail(`${groups.length} groups, expected about 45`);
for (const g of groups) {
  if (g.age.under90 + g.age.d90to180 + g.age.d180to365 + g.age.over365 !== g.stockValue) fail(`${g.slug} age bands do not sum`);
  if (g.mappedToPo + g.freeStock !== g.stockValue) fail(`${g.slug} mapped plus free is not stock value`);
  if (Math.round(g.totalCbm * 100) !== Math.round(totalCbm(g.unitCbm, g.quantity) * 100)) fail(`${g.slug} total CBM is not unit times quantity`);
  if (g.monthly[11]!.quantity !== g.quantity) fail(`${g.slug} last month is not the current quantity`);
}
if (Math.round(sumCbm(verticals.map((v) => v.allocatedCbm)) * 100) !== Math.round(capacityCbm * 100)) fail('allocations do not sum to capacity');
if (Math.round(sum(groups.map((g) => g.valueSharePct)) * 10) !== 1000) fail('value shares do not sum to 100.0');
if (Math.round(sumCbm(costRows.map((r) => r.mainCbm)) * 100) !== Math.round(capacityCbm * 100)) fail('cost CBM column does not add to capacity');
if (rentChargedToStock > monthlyRent) fail(`rent charged to stock ${rentChargedToStock} exceeds the monthly rent ${monthlyRent}`);
for (const g of groups) if (g.daysOfCover != null && g.daysOfCover > 5 * 365) fail(`${g.slug} days of cover ${g.daysOfCover} is beyond five years`);

/* ---------- write ---------- */

const rollup: Rollup = {
  meta: META,
  site: { name: 'Halvard Central Store', floorAreaSqFt, netUsablePct, netUsableSqFt, netUsableM2, stackingHeightM, capacityCbm, annualRent, rentPerSqFtYear, dailyRatePerCbm, overflow: { ...OVERFLOW, usedCbm: totalRow.overflowCbm } } satisfies Site,
  sources,
  definitions,
  precisionPolicy,
  assumptions,
  overview,
  verticals,
  total: totalRow,
  projectionTotal: totalRow.projection,
  aging: { slowMovers, abc },
  replenishment: { rows: replenishmentRows, counts },
  cost: { monthLabel: COST_MONTH.label, daysInMonth: COST_MONTH.days, rentChargedToStock, rows: costRows, total: costTotal, siteOptions },
  inbound: { rows: inboundRows, total: inboundTotal, items: inTransitItems },
  calculator,
  groups: groups.map((g): GroupSummary => ({ slug: g.slug, name: g.name, brand: g.brand, vertical: g.vertical, verticalName: g.verticalName, quantity: g.quantity, stockValue: g.stockValue, totalCbm: g.totalCbm, rackable: g.rackable, dailyStorageCost: g.dailyStorageCost, valuePerCbm: g.valuePerCbm, status: g.status, abc: g.abc })),
};
const index: IndexEntry[] = verticals.map((v) => ({ slug: v.slug, name: v.name, groups: groups.filter((g) => g.vertical === v.slug).map((g) => ({ slug: g.slug, name: g.name, file: `groups/${g.slug}.json` })) }));

const outDir = join(here, '..', 'public', 'data');
mkdirSync(join(outDir, 'groups'), { recursive: true });
const write = (rel: string, v: unknown) => writeFileSync(join(outDir, rel), JSON.stringify(v, null, 1));
write('rollup.json', rollup);
write('index.json', index);
for (const g of groups) write(`groups/${g.slug}.json`, { meta: META, ...g });

console.log(`Wrote rollup.json, index.json and ${groups.length} group files.`);
