import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AgeBands } from '../../data/schema';
import { aed, cx, pct } from '../lib/format';
import { useWidth } from './useWidth';

export interface AgeRow {
  slug: string;
  name: string;
  age: AgeBands;
  total: number;
}

const BANDS: { key: keyof AgeBands; label: string; cls: string }[] = [
  { key: 'under90', label: 'Under 90 days', cls: 'b0' },
  { key: 'd90to180', label: '90 to 180', cls: 'b1' },
  { key: 'd180to365', label: '180 to 365', cls: 'b2' },
  { key: 'over365', label: 'Over 365', cls: 'b3' },
];

/**
 * Stock value by age band, one stacked bar per row on a 0 to 100 percent
 * axis. Older bands are darker; over a year is hazard red. The share over a
 * year is printed at the end of each bar. Pointing at a row, or walking the
 * rows with the arrow keys, bands it and reads its figures out. Exact values
 * are in the table.
 */
export function AgeChart({ rows, id }: { rows: AgeRow[]; id: string }) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const labelW = width < 560 ? 120 : 190;
  const m = { left: labelW, right: 60, top: 18, bottom: 6 };
  const rowH = 24;
  const height = m.top + rows.length * rowH + m.bottom;
  const span = width - m.left - m.right;
  /** Which row band the pointer sits in, or null when it is outside them. */
  const nearest = (py: number) => {
    const i = Math.floor((py - m.top) / rowH);
    return i >= 0 && i < rows.length ? i : null;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(nearest(e.clientY - e.currentTarget.getBoundingClientRect().top));
  const step = (d: number) => setHover(Math.min(rows.length - 1, Math.max(0, (hover ?? 0) + d)));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    }
    if (e.key === 'Escape') setHover(null);
  };
  const hr = hover != null ? rows[hover] : undefined;
  const hOver = hr ? (hr.total === 0 ? 0 : (hr.age.over365 / hr.total) * 100) : 0;
  /* The readout is one line, sized in mono characters and parked inside the hovered
     row's own band, so it never covers the rows above or below it. */
  const CH = 6.8;
  const hrName = hr ? (width < 560 && hr.name.length > 16 ? hr.name.slice(0, 15) + '.' : hr.name).toUpperCase() : '';
  const hrFigs = hr ? (hr.total === 0 ? 'EMPTY' : `${aed(hr.total)} IN STOCK, ${pct(hOver, 0)} OVER A YEAR`) : '';
  const boxW = Math.min(width, 20 + (hrName.length + hrFigs.length + 3) * CH);
  const boxX = Math.max(0, Math.min(width - boxW, m.left + 10));
  const readout = hr ? `${hr.name}: ${aed(hr.total)} in stock, ${pct(hOver, 0)} of it over a year old` : '';
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart vchart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stock value by age band per vertical, as shares of each vertical. Exact values are in the table."
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onFocus={() => setHover(0)}
        onBlur={() => setHover(null)}
        id={id}
      >
        <rect className="capture" x={0} y={m.top} width={width} height={rows.length * rowH} fill="transparent" />
        {hover != null && <rect className="rowhi" x={0} y={m.top + hover * rowH} width={width} height={rowH} aria-hidden="true" />}
        <g className="grid">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={m.left + (span * t) / 100} x2={m.left + (span * t) / 100} y1={m.top - 4} y2={height - m.bottom} />
              <text x={m.left + (span * t) / 100} y={m.top - 7} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
        </g>
        {rows.map((r, i) => {
          const y = m.top + i * rowH + 6;
          let acc = 0;
          const label = r.name.length > 22 && width < 560 ? r.name.slice(0, 20) + '.' : r.name;
          const overPct = r.total === 0 ? 0 : (r.age.over365 / r.total) * 100;
          return (
            <g key={r.slug}>
              <text x={m.left - 10} y={y + 9} textAnchor="end" className="ink">
                {label}
              </text>
              {BANDS.map((b, bi) => {
                const share = r.total === 0 ? 0 : r.age[b.key] / r.total;
                const x0 = m.left + span * acc;
                acc += share;
                const w = span * share;
                if (w <= 0) return null;
                return <motion.rect key={b.key} className={cx('aband', b.cls, hover === i && 'mk-on')} x={x0} y={y} width={Math.max(0.5, w)} height={10} style={{ originX: 0 }} {...(reduce ? {} : { initial: { scaleX: 0 }, whileInView: { scaleX: 1 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.5, delay: 0.03 * i + 0.12 * bi, ease: 'easeOut' } })} />;
              })}
              <text x={m.left + span + 6} y={y + 9} className={overPct >= 10 ? 'hz' : undefined}>
                {r.total === 0 ? 'empty' : pct(overPct, 0)}
              </text>
            </g>
          );
        })}
        {hr && (
          <g className="readbox" aria-hidden="true" transform={`translate(${boxX}, ${m.top + (hover ?? 0) * rowH + 1})`}>
            <rect width={boxW} height={22} />
            <text x={10} y={15} className="ink">
              {hrName}
            </text>
            <text x={10 + (hrName.length + 2) * CH} y={15} className={hOver >= 10 ? 'hz' : undefined}>
              {hrFigs}
            </text>
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
      <div className="chart-legend" aria-hidden="true">
        {BANDS.map((b) => (
          <span key={b.key}>
            <i className={`sw ${b.cls}`} /> {b.label}
          </span>
        ))}
        <span className="muted">Figure at the end of each bar: share over a year</span>
      </div>
    </div>
  );
}
