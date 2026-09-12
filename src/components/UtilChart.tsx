import { motion, useReducedMotion } from 'motion/react';
import { OPTIMAL_BAND } from '../../data/cbm';
import { cbm, pct } from '../lib/format';
import { useWidth } from './useWidth';

export interface UtilRow {
  slug: string;
  name: string;
  used: number;
  allocated: number;
  utilPct: number;
}

/**
 * Utilisation by vertical against allocation: one thin ink bar per row on a
 * 0 to 120 percent axis, the 60 to 80 optimal band shaded, the 100 percent
 * line drawn, and any stock beyond the allocation in hazard red. Exact
 * figures are in the table the chart sits beside.
 */
export function UtilChart({ rows, id, max = 120 }: { rows: UtilRow[]; id: string; max?: number }) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const labelW = width < 560 ? 120 : 190;
  const m = { left: labelW, right: 56, top: 18, bottom: 18 };
  const rowH = 24;
  const height = m.top + rows.length * rowH + m.bottom;
  const x = (p: number) => m.left + ((width - m.left - m.right) * Math.min(p, max)) / max;
  const ticks = [0, 20, 40, 60, 80, 100, 120].filter((t) => t <= max);
  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart vchart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Utilisation of allocated space by vertical, percent, with the 60 to 80 percent optimal band. Exact values are in the table." id={id}>
        <g className="fc-zone" aria-hidden="true">
          <rect x={x(OPTIMAL_BAND.low)} y={m.top - 4} width={x(OPTIMAL_BAND.high) - x(OPTIMAL_BAND.low)} height={height - m.top - m.bottom + 4} />
          <text x={(x(OPTIMAL_BAND.low) + x(OPTIMAL_BAND.high)) / 2} y={height - 4} textAnchor="middle">
            OPTIMAL {OPTIMAL_BAND.low} TO {OPTIMAL_BAND.high}
          </text>
        </g>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={m.top - 4} y2={height - m.bottom} className={t === 100 ? 'hundred' : undefined} />
              <text x={x(t)} y={m.top - 7} textAnchor="middle" className={t === 100 ? 'ink' : undefined}>
                {t}
              </text>
            </g>
          ))}
        </g>
        {rows.map((r, i) => {
          const y = m.top + i * rowH + 6;
          const full = Math.min(r.utilPct, 100);
          const over = Math.max(0, Math.min(r.utilPct, max) - 100);
          const label = r.name.length > 22 && width < 560 ? r.name.slice(0, 20) + '.' : r.name;
          const anim = (delay: number) => (reduce ? {} : { initial: { scaleX: 0 }, whileInView: { scaleX: 1 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.6, delay, ease: 'easeOut' as const } });
          return (
            <g key={r.slug}>
              <text x={m.left - 10} y={y + 9} textAnchor="end" className="ink">
                {label}
              </text>
              <motion.rect className="vbar" x={x(0)} y={y} width={Math.max(1, x(full) - x(0))} height={10} style={{ originX: 0 }} {...anim(0.04 * i)} />
              {over > 0 && <motion.rect className="vbar neg" x={x(100)} y={y} width={Math.max(1, x(100 + over) - x(100))} height={10} style={{ originX: 0 }} {...anim(0.04 * i + 0.3)} />}
              <text x={x(Math.min(r.utilPct, max)) + 6} y={y + 9} className={r.utilPct > 100 ? 'hz' : 'ink'}>
                {pct(r.utilPct)}
              </text>
              <title>
                {r.name}: {cbm(r.used)} of {cbm(r.allocated)} CBM, {pct(r.utilPct)}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
