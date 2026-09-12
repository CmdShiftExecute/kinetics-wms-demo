/**
 * Shape validation at the data boundary. Valid JSON of the wrong shape must
 * produce a readable error, never a blank page. These checks are deliberately
 * structural (keys, arrays, numbers) rather than a full schema mirror.
 */

export class DataShapeError extends Error {
  constructor(file: string, detail: string) {
    super(`${file} does not have the expected shape: ${detail}.`);
    this.name = 'DataShapeError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function need(file: string, o: unknown, keys: string[], path = ''): asserts o is Obj {
  if (!isObj(o)) throw new DataShapeError(file, `${path || 'root'} is not an object`);
  for (const key of keys) if (!(key in o)) throw new DataShapeError(file, `missing ${path ? path + '.' : ''}${key}`);
}
function needArray(file: string, v: unknown, path: string, min = 0): asserts v is unknown[] {
  if (!Array.isArray(v)) throw new DataShapeError(file, `${path} is not an array`);
  if (v.length < min) throw new DataShapeError(file, `${path} has ${v.length} rows, expected at least ${min}`);
}
function needNumber(file: string, v: unknown, path: string) {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new DataShapeError(file, `${path} is not a number`);
}

function needMeta(file: string, meta: unknown) {
  need(file, meta, ['company', 'division', 'system', 'stockDate', 'stockDateLabel', 'dataAsOf', 'dataAsOfLabel', 'revision', 'currency', 'forecastDays', 'projectionMonths', 'seed'], 'meta');
  needNumber(file, meta.forecastDays, 'meta.forecastDays');
  if (!/\+04:00$/.test(String(meta.dataAsOf))) throw new DataShapeError(file, 'meta.dataAsOf is not a GST (+04:00) timestamp');
}

export function validateRollup(file: string, v: unknown): void {
  need(file, v, ['meta', 'site', 'sources', 'definitions', 'precisionPolicy', 'assumptions', 'overview', 'verticals', 'total', 'projectionTotal', 'aging', 'replenishment', 'cost', 'inbound', 'calculator', 'groups']);
  needMeta(file, v.meta);
  need(file, v.site, ['capacityCbm', 'dailyRatePerCbm', 'annualRent', 'overflow'], 'site');
  needNumber(file, v.site.capacityCbm, 'site.capacityCbm');
  need(file, v.overview, ['stockValue', 'totalCbm', 'capacityCbm', 'utilPct', 'dailyStorageCost', 'belowReorder', 'stockOutsWithin60', 'age', 'agePct', 'overVertical', 'underVertical'], 'overview');
  needNumber(file, v.overview.stockValue, 'overview.stockValue');
  needArray(file, v.verticals, 'verticals', 1);
  for (const r of v.verticals) {
    need(file, r, ['slug', 'name', 'groups', 'stockValue', 'totalCbm', 'rackableCbm', 'nonRackableCbm', 'allocatedCbm', 'idleCbm', 'utilPct', 'dailyStorageCost', 'age', 'ageCbm', 'turnover', 'projection', 'monthly'], 'verticals[]');
    needNumber(file, r.totalCbm, 'verticals[].totalCbm');
    needArray(file, r.projection, 'verticals[].projection', 1);
  }
  need(file, v.total, ['stockValue', 'totalCbm', 'utilPct'], 'total');
  need(file, v.aging, ['slowMovers', 'abc'], 'aging');
  needArray(file, v.aging.abc, 'aging.abc', 3);
  need(file, v.replenishment, ['rows', 'counts'], 'replenishment');
  needArray(file, v.replenishment.rows, 'replenishment.rows', 1);
  for (const r of v.replenishment.rows) need(file, r, ['slug', 'name', 'quantity', 'safetyStock', 'maxStock', 'leadTimeDays', 'demandPerDay', 'reorderPoint', 'status'], 'replenishment.rows[]');
  need(file, v.cost, ['monthLabel', 'rows', 'total', 'siteOptions'], 'cost');
  needArray(file, v.cost.rows, 'cost.rows', 1);
  needArray(file, v.cost.siteOptions, 'cost.siteOptions', 1);
  need(file, v.inbound, ['rows', 'total', 'items'], 'inbound');
  needArray(file, v.calculator, 'calculator', 1);
  for (const c of v.calculator) {
    need(file, c, ['slug', 'name', 'allocatedCbm', 'rows'], 'calculator[]');
    needArray(file, c.rows, 'calculator[].rows');
    for (const r of c.rows) need(file, r, ['slug', 'name', 'lengthM', 'breadthM', 'heightM', 'quantity', 'rackable', 'unitCbm', 'totalCbm'], 'calculator[].rows[]');
  }
  needArray(file, v.groups, 'groups', 1);
}

export function validateGroup(file: string, v: unknown): void {
  need(file, v, ['meta', 'slug', 'name', 'brand', 'vertical', 'verticalName', 'lengthM', 'breadthM', 'heightM', 'unitCbm', 'quantity', 'totalCbm', 'rackable', 'unitPrice', 'stockValue', 'dailyStorageCost', 'safetyStock', 'maxStock', 'leadTimeDays', 'demandH2', 'demandPerDay', 'reorderPoint', 'status', 'age', 'avgAgeDays', 'abc', 'mappedToPo', 'freeStock', 'monthly']);
  needMeta(file, v.meta);
  needNumber(file, v.stockValue, 'stockValue');
  need(file, v.age, ['under90', 'd90to180', 'd180to365', 'over365'], 'age');
  needArray(file, v.monthly, 'monthly', 12);
  for (const p of v.monthly) {
    need(file, p, ['month', 'index', 'quantity', 'value'], 'monthly[]');
    needNumber(file, p.quantity, 'monthly[].quantity');
  }
}

export function validateIndex(file: string, v: unknown): void {
  needArray(file, v, 'root', 1);
  for (const e of v) need(file, e, ['slug', 'name', 'groups'], 'root[]');
}

export function validateReconciliation(file: string, v: unknown): void {
  need(file, v, ['checkedAt', 'policy', 'assertions', 'passed', 'failed']);
  needArray(file, v.assertions, 'assertions', 1);
  for (const a of v.assertions) need(file, a, ['id', 'statement', 'left', 'right', 'pass'], 'assertions[]');
}
