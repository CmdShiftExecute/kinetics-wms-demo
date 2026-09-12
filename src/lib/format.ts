/** Typographic minus, never a hyphen, for negative figures. */
export const MINUS = '−';

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole AED with grouping. */
export function aed(n: number): string {
  const s = grouped.format(Math.abs(Math.round(n)));
  return n < 0 ? `${MINUS}${s}` : s;
}

/** Signed whole AED, for changes. */
export function signedAed(n: number): string {
  if (n > 0) return `+${aed(n)}`;
  return aed(n);
}

/** CBM to two decimals with grouping. */
export function cbm(n: number): string {
  const s = two.format(Math.abs(n));
  return n < 0 ? `${MINUS}${s}` : s;
}

/** Signed CBM, for idle or over figures. */
export function signedCbm(n: number): string {
  if (n > 0) return `+${cbm(n)}`;
  return cbm(n);
}

/** Percent with a fixed number of decimals. */
export function pct(n: number, d = 1): string {
  const s = `${Math.abs(n).toFixed(d)}%`;
  return n < 0 ? `${MINUS}${s}` : s;
}

/** AED millions for prose, e.g. "AED 24.4m". Tables stay in whole AED. */
export function mil(n: number, d = 1): string {
  const v = Math.abs(n) / 1_000_000;
  return `${n < 0 ? MINUS : ''}AED ${v.toFixed(d)}m`;
}

/** AED thousands for prose, e.g. "AED 861k". */
export function thou(n: number, d = 0): string {
  const v = Math.abs(n) / 1000;
  return `${n < 0 ? MINUS : ''}AED ${v.toFixed(d)}k`;
}

/** A plain count. */
export function count(n: number): string {
  return grouped.format(n);
}

/** Units per day to two decimals. */
export function perDay(n: number): string {
  return two.format(n);
}

/** A multiple, e.g. "3.2x". */
export function mult(n: number): string {
  return `${n.toFixed(1)}x`;
}

/** Days as an integer with its unit. */
export function days(n: number | null): string {
  return n == null ? 'no forecast' : `${grouped.format(n)} d`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const STATUS_LABEL = { below: 'Below reorder point', lead: 'Within lead time', healthy: 'Healthy' } as const;
