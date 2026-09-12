/**
 * The one CBM rule, shared by the generator, the reconciliation script and the
 * browser calculator, so all three compute the same figure from the same inputs.
 *
 * CBM is cubic metres. Dimensions are in metres to two decimals. Unit CBM is
 * length times breadth times height rounded once to two decimals. Total CBM for a
 * group is unit CBM times quantity, rounded once to two decimals. Every total
 * above that is a sum of those two-decimal figures, carried in hundredths so no
 * floating-point residue can creep in. Utilisation is used over capacity, as a
 * percentage to one decimal, from the sums.
 */

/** Round to two decimals, once. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;
/** Round to one decimal, once. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;
/** A two-decimal figure as an integer count of hundredths. */
export const hundredths = (n: number): number => Math.round(n * 100);

export function unitCbm(lengthM: number, breadthM: number, heightM: number): number {
  return r2(lengthM * breadthM * heightM);
}

export function totalCbm(unit: number, quantity: number): number {
  return r2(unit * quantity);
}

/** Sum of two-decimal figures, exact. */
export function sumCbm(values: number[]): number {
  return values.reduce((acc, v) => acc + hundredths(v), 0) / 100;
}

/** Percent of capacity used, one decimal, from the two sums. Capacity zero reads as zero. */
export function utilPct(usedCbm: number, capacityCbm: number): number {
  return capacityCbm === 0 ? 0 : r1((usedCbm / capacityCbm) * 100);
}

export const OPTIMAL_BAND = { low: 60, high: 80 } as const;

/** Input limits for the browser calculator. Beyond these a value is refused with a message, not clamped silently. */
export const LIMITS = { dimMinM: 0, dimMaxM: 20, qtyMin: 0, qtyMax: 100000 } as const;

export type FieldError = string | null;

export function checkDim(raw: string): { value: number | null; error: FieldError } {
  const t = raw.trim();
  if (t === '') return { value: null, error: 'Enter a length in metres' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: 'Not a number' };
  if (v < LIMITS.dimMinM) return { value: null, error: 'A dimension cannot be negative' };
  if (v > LIMITS.dimMaxM) return { value: null, error: `Above the ${LIMITS.dimMaxM} m limit for one unit` };
  return { value: r2(v), error: null };
}

export function checkQty(raw: string): { value: number | null; error: FieldError } {
  const t = raw.trim();
  if (t === '') return { value: null, error: 'Enter a quantity' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: 'Not a number' };
  if (!Number.isInteger(v)) return { value: null, error: 'Quantity must be a whole number' };
  if (v < LIMITS.qtyMin) return { value: null, error: 'A quantity cannot be negative' };
  if (v > LIMITS.qtyMax) return { value: null, error: `Above the ${LIMITS.qtyMax.toLocaleString('en-GB')} unit limit` };
  return { value: v, error: null };
}
