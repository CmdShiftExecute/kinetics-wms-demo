/**
 * Data contract for the Halvard Central Store demo (Warehouse Information System).
 *
 * Every figure the browser shows is read from JSON produced by
 * scripts/generate_demo_data.ts. The only runtime arithmetic is the CBM
 * calculator, which applies the same rule (data/cbm.ts) the generator used.
 * If a figure on screen is wrong, the fix is in the generator or in this
 * schema, never in a component.
 *
 * Precision policy: money is an integer in AED at the material-group level,
 * rounded once (quantity times unit price; CBM times the daily rate). Every
 * higher money figure is a sum of those integers. CBM is to two decimals at the
 * unit level (length times breadth times height) and at the group level (unit
 * CBM times quantity), each rounded once; every higher CBM figure is a sum of
 * those two-decimal figures carried in hundredths. Percentages are one decimal,
 * from the sums, never from other percentages. Shares that must total 100.0
 * are allocated by largest remainder.
 *
 * Timestamps are GST (Asia/Dubai, +04:00). Never UTC.
 */

export type Slug = string;

export interface Meta {
  company: string;
  division: string;
  system: string;
  /** The stock position date, YYYY-MM-DD. */
  stockDate: string;
  stockDateLabel: string;
  /** ISO 8601 with a +04:00 offset. */
  dataAsOf: string;
  dataAsOfLabel: string;
  revision: string;
  currency: 'AED';
  /** The demand forecast window used for replenishment, e.g. "July to December 2026". */
  forecastWindow: string;
  forecastDays: number;
  /** Month labels for the space projection, e.g. ["Sep 2026", ...]. */
  projectionMonths: string[];
  seed: number;
  /** ISO 8601 with a +04:00 offset. */
  generatedAt: string;
}

export interface Source {
  key: string;
  label: string;
}

export interface Definition {
  key: string;
  term: string;
  text: string;
}

export interface OverflowSite {
  name: string;
  capacityCbm: number;
  /** AED per CBM per day charged by the third party, four decimals. */
  dailyRatePerCbm: number;
  usedCbm: number;
}

export interface Site {
  name: string;
  floorAreaSqFt: number;
  netUsablePct: number;
  netUsableSqFt: number;
  netUsableM2: number;
  stackingHeightM: number;
  /** Net usable square metres times stacking height, two decimals. */
  capacityCbm: number;
  annualRent: number;
  rentPerSqFtYear: number;
  /** Annual rent over 365 days over capacity CBM, four decimals. */
  dailyRatePerCbm: number;
  overflow: OverflowSite;
}

export type ReplenishmentStatus = 'below' | 'lead' | 'healthy';
export type AbcClass = 'A' | 'B' | 'C';

export interface AgeBands {
  under90: number;
  d90to180: number;
  d180to365: number;
  over365: number;
}

export interface InTransit {
  quantity: number;
  value: number;
  /** YYYY-MM-DD */
  expectedArrival: string;
  expectedArrivalLabel: string;
}

export interface MonthPoint {
  /** e.g. "Sep 2025" */
  month: string;
  index: number;
  quantity: number;
  value: number;
}

/** One material group, the row of the WIS SKU master. */
export interface Group {
  slug: Slug;
  name: string;
  brand: string;
  vertical: Slug;
  verticalName: string;
  lengthM: number;
  breadthM: number;
  heightM: number;
  unitCbm: number;
  quantity: number;
  totalCbm: number;
  rackable: boolean;
  /** Part of totalCbm held at the third-party overflow site. */
  overflowCbm: number;
  unitPrice: number;
  stockValue: number;
  /** AED per day, rounded once: main CBM times the site rate plus overflow CBM times the overflow rate. */
  dailyStorageCost: number;
  /** Group CBM as a percent of the vertical's allocated CBM. */
  spaceSharePct: number;
  safetyStock: number;
  maxStock: number;
  leadTimeDays: number;
  demandH2: number;
  /** Units per day, two decimals: demandH2 over forecastDays. */
  demandPerDay: number;
  /** Safety stock plus lead time times demand per day, rounded up. */
  reorderPoint: number;
  /** Quantity over demand per day, rounded down; null when there is no forecast demand. */
  daysOfCover: number | null;
  stockOutDate: string | null;
  stockOutDateLabel: string | null;
  status: ReplenishmentStatus;
  age: AgeBands;
  avgAgeDays: number;
  abc: AbcClass;
  valueSharePct: number;
  mappedToPo: number;
  freeStock: number;
  inTransit: InTransit | null;
  monthly: MonthPoint[];
}

export interface GroupSummary {
  slug: Slug;
  name: string;
  brand: string;
  vertical: Slug;
  verticalName: string;
  quantity: number;
  stockValue: number;
  totalCbm: number;
  rackable: boolean;
  status: ReplenishmentStatus;
  abc: AbcClass;
}

export interface ProjectionPoint {
  month: string;
  index: number;
  cbm: number;
}

export interface VerticalRow {
  slug: Slug;
  name: string;
  groups: number;
  stockValue: number;
  totalCbm: number;
  rackableCbm: number;
  nonRackableCbm: number;
  allocatedCbm: number;
  /** Allocated less total; negative means over the allocation. */
  idleCbm: number;
  overflowCbm: number;
  utilPct: number;
  dailyStorageCost: number;
  belowReorder: number;
  age: AgeBands;
  ageCbm: AgeBands;
  annualIssueValue: number;
  /** Annualised issues at cost over stock value, one decimal. */
  turnover: number;
  projection: ProjectionPoint[];
  mappedToPo: number;
  freeStock: number;
  inTransitQuantity: number;
  inTransitValue: number;
  monthly: MonthPoint[];
}

export interface CalculatorRow {
  slug: Slug;
  name: string;
  lengthM: number;
  breadthM: number;
  heightM: number;
  quantity: number;
  rackable: boolean;
  unitCbm: number;
  totalCbm: number;
}

export interface CalculatorVertical {
  slug: Slug;
  name: string;
  allocatedCbm: number;
  rackableCbm: number;
  nonRackableCbm: number;
  totalCbm: number;
  rows: CalculatorRow[];
}

export interface StockOutItem {
  slug: Slug;
  name: string;
  vertical: Slug;
  verticalName: string;
  quantity: number;
  reorderPoint: number;
  daysOfCover: number;
  stockOutDate: string;
  stockOutDateLabel: string;
  inTransitArrival: string | null;
}

export interface Overview {
  stockValue: number;
  totalCbm: number;
  capacityCbm: number;
  utilPct: number;
  dailyStorageCost: number;
  belowReorder: number;
  stockOutsWithin60: StockOutItem[];
  age: AgeBands;
  agePct: AgeBands;
  overVertical: { slug: Slug; name: string; utilPct: number };
  underVertical: { slug: Slug; name: string; utilPct: number };
}

export interface SlowMover {
  slug: Slug;
  name: string;
  vertical: Slug;
  verticalName: string;
  stockValue: number;
  valueOver180: number;
  avgAgeDays: number;
  turnover: number;
}

export interface AbcRow {
  cls: AbcClass;
  groups: number;
  stockValue: number;
  sharePct: number;
  rule: string;
}

export interface Aging {
  slowMovers: SlowMover[];
  abc: AbcRow[];
}

export interface ReplenishmentRow {
  slug: Slug;
  name: string;
  brand: string;
  vertical: Slug;
  verticalName: string;
  quantity: number;
  safetyStock: number;
  maxStock: number;
  leadTimeDays: number;
  demandPerDay: number;
  reorderPoint: number;
  daysOfCover: number | null;
  stockOutDate: string | null;
  stockOutDateLabel: string | null;
  status: ReplenishmentStatus;
}

export interface Replenishment {
  rows: ReplenishmentRow[];
  counts: { below: number; lead: number; healthy: number };
}

export interface CostRow {
  slug: Slug;
  name: string;
  totalCbm: number;
  dailyStorageCost: number;
  rent: number;
  handlingFixed: number;
  handlingVariable: number;
  utilities: number;
  overflow: number;
  total: number;
}

export interface SiteOption {
  key: string;
  name: string;
  location: string;
  sizeSqM: number;
  sizeSqFt: number;
  annualRent: number;
  monthlyRent: number;
  monthlyRatePerSqFt: number;
  commission: number;
  /** Monthly rate per sq ft including the one-off commission spread over the term, two decimals. */
  effectiveRatePerSqFt: number;
  termMonths: number;
  note: string;
}

export interface Cost {
  monthLabel: string;
  daysInMonth: number;
  rows: CostRow[];
  total: CostRow;
  siteOptions: SiteOption[];
}

export interface InboundRow {
  slug: Slug;
  name: string;
  stockValue: number;
  mappedToPo: number;
  freeStock: number;
  inTransitQuantity: number;
  inTransitValue: number;
  nextArrival: string | null;
}

export interface InTransitItem {
  slug: Slug;
  name: string;
  vertical: Slug;
  verticalName: string;
  quantity: number;
  value: number;
  expectedArrival: string;
  expectedArrivalLabel: string;
}

export interface Inbound {
  rows: InboundRow[];
  total: InboundRow;
  items: InTransitItem[];
}

export interface Rollup {
  meta: Meta;
  site: Site;
  sources: Record<string, Source>;
  definitions: Record<string, Definition>;
  precisionPolicy: string[];
  assumptions: string[];
  overview: Overview;
  verticals: VerticalRow[];
  total: VerticalRow;
  projectionTotal: ProjectionPoint[];
  aging: Aging;
  replenishment: Replenishment;
  cost: Cost;
  inbound: Inbound;
  calculator: CalculatorVertical[];
  groups: GroupSummary[];
}

export interface IndexEntry {
  slug: Slug;
  name: string;
  groups: { slug: Slug; name: string; file: string }[];
}

export interface Assertion {
  id: string;
  statement: string;
  left: number;
  right: number;
  pass: boolean;
}

export interface Reconciliation {
  checkedAt: string;
  policy: string[];
  assertions: Assertion[];
  passed: number;
  failed: number;
}
