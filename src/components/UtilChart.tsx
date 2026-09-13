import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { OPTIMAL_BAND } from '../../data/cbm';
import { cbm, cx, pct } from '../lib/format';
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
 * line drawn, and any stock beyond the allocation in hazard red. Pointing at
 * a row, or walking the rows with the arrow keys, bands it and reads its
 * figures out. Exact figures are in the table the chart sits beside.
 */
export function UtilChart({ rows, id, max = 120 }: { rows: UtilRow[]; id: string; max?: number }) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const labelW = width < 560 ? 120 : 190;
  const m = { left: labelW, right: 56, top: 18, bottom: 18 };
  const rowH = 24;
  const height = m.top + rows.length * rowH + m.bottom;
  const x = (p: number) => m.left + ((width - m.left - m.right) * Math.min(p, max)) / max;
  const ticks = [0, 20, 40, 60, 80, 100, 120].filter((t) => t <= max);
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
  /* The readout is one line, sized in mono characters and parked inside the hovered
     row's own band, so it never covers the rows above or below it. */
  const CH = 6.8;
  const hrName = hr ? (width < 560 && hr.name.length > 16 ? hr.name.slice(0, 15) + '.' : hr.name).toUpperCase() : '';
  const hrFigs = hr ? `${cbm(hr.used)} OF ${cbm(hr.allocated)} CBM, ${pct(hr.utilPct)}` : '';
  const boxW = Math.min(width, 20 + (hrName.length + hrFigs.length + 3) * CH);
  const boxX = Math.max(0, Math.min(width - boxW, m.left + 10));
  const readout = hr ? `${hr.name}: ${cbm(hr.used)} of ${cbm(hr.allocated)} CBM, ${pct(hr.utilPct)}` : '';
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart vchart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Utilisation of allocated space by vertical, percent, with the 60 to 80 percent optimal band. Exact values are in the table."
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
              <motion.rect className={cx('vbar', hover === i && 'mk-on')} x={x(0)} y={y} width={Math.max(1, x(full) - x(0))} height={10} style={{ originX: 0 }} {...anim(0.04 * i)} />
              {over > 0 && <motion.rect className={cx('vbar', 'neg', hover === i && 'mk-on')} x={x(100)} y={y} width={Math.max(1, x(100 + over) - x(100))} height={10} style={{ originX: 0 }} {...anim(0.04 * i + 0.3)} />}
              <text x={x(Math.min(r.utilPct, max)) + 6} y={y + 9} className={r.utilPct > 100 ? 'hz' : 'ink'}>
                {pct(r.utilPct)}
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
            <text x={10 + (hrName.length + 2) * CH} y={15} className={hr.utilPct > 100 ? 'hz' : undefined}>
              {hrFigs}
            </text>
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
