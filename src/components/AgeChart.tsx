import { motion, useReducedMotion } from 'motion/react';
import type { AgeBands } from '../../data/schema';
import { aed, pct } from '../lib/format';
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
 * year is printed at the end of each bar. Exact values are in the table.
 */
export function AgeChart({ rows, id }: { rows: AgeRow[]; id: string }) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const labelW = width < 560 ? 120 : 190;
  const m = { left: labelW, right: 60, top: 18, bottom: 6 };
  const rowH = 24;
  const height = m.top + rows.length * rowH + m.bottom;
  const span = width - m.left - m.right;
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart vchart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stock value by age band per vertical, as shares of each vertical. Exact values are in the table." id={id}>
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
                return <motion.rect key={b.key} className={`aband ${b.cls}`} x={x0} y={y} width={Math.max(0.5, w)} height={10} style={{ originX: 0 }} {...(reduce ? {} : { initial: { scaleX: 0 }, whileInView: { scaleX: 1 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.5, delay: 0.03 * i + 0.12 * bi, ease: 'easeOut' } })} />;
              })}
              <text x={m.left + span + 6} y={y + 9} className={overPct >= 10 ? 'hz' : undefined}>
                {r.total === 0 ? 'empty' : pct(overPct, 0)}
              </text>
              <title>
                {r.name}: {aed(r.total)} in stock, {aed(r.age.over365)} over a year old
              </title>
            </g>
          );
        })}
      </svg>
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
