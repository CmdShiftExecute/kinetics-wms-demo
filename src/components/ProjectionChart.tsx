import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { motion, useReducedMotion } from 'motion/react';
import { OPTIMAL_BAND } from '../../data/cbm';
import type { ProjectionPoint } from '../../data/schema';
import { cbm, cx, pct } from '../lib/format';
import { useWidth } from './useWidth';

interface Props {
  /** The current position, drawn as the first point. */
  currentLabel: string;
  current: number;
  points: ProjectionPoint[];
  /** Capacity or allocation the series is judged against. */
  limit: number;
  limitLabel: string;
  subject: string;
  id: string;
  height?: number;
}

/**
 * Projected CBM over the next months against a fixed limit: the limit as a
 * solid line, the 60 to 80 percent band shaded, the series as an ink line
 * with the months beyond the limit marked in hazard. Arrow keys move a
 * crosshair; the exact values sit in the table beside the chart.
 */
export function ProjectionChart({ currentLabel, current, points, limit, limitLabel, subject, id, height = 220 }: Props) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const series = [{ index: 0, month: currentLabel, cbm: current }, ...points];
  const m = { top: 20, right: 20, bottom: 24, left: 60 };
  const x = scalePoint<number>().domain(series.map((p) => p.index)).range([m.left, width - m.right]);
  const hi = Math.max(limit * 1.12, ...series.map((p) => p.cbm * 1.08));
  const y = scaleLinear().domain([0, hi]).range([height - m.bottom, m.top]);
  const gen = d3line<ProjectionPoint>().x((d) => x(d.index) ?? 0).y((d) => y(d.cbm));
  const ticks = y.ticks(4);
  const nearest = (px: number) => series.reduce((best, p) => (Math.abs((x(p.index) ?? 0) - px) < Math.abs((x(best.index) ?? 0) - px) ? p : best), series[0]!).index;
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(Math.min(series.length - 1, Math.max(0, (hover ?? 0) + (e.key === 'ArrowRight' ? 1 : -1))));
    }
    if (e.key === 'Escape') setHover(null);
  };
  const hp = hover != null ? series[hover] : undefined;
  const hx = hp ? (x(hp.index) ?? 0) : 0;
  const boxW = 190;
  const boxX = hx + boxW + 12 > width ? hx - boxW - 12 : hx + 12;
  const readout = hp ? `${hp.month}: ${cbm(hp.cbm)} CBM, ${pct((hp.cbm / limit) * 100)} of ${limitLabel}` : '';
  const draw = reduce ? {} : { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true, amount: 0.4 } };
  return (
    <div className="chart-wrap" ref={ref}>
      <p className="chart-axis-note">CBM, month end. {limitLabel} {cbm(limit)} CBM drawn as the solid line; the shaded band is 60 to 80 percent of it.</p>
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Projected CBM for ${subject} against ${limitLabel}. Exact values are in the table.`} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onFocus={() => setHover(0)} onBlur={() => setHover(null)} id={id}>
        <rect className="capture" x={m.left} y={m.top} width={Math.max(0, width - m.left - m.right)} height={Math.max(0, height - m.top - m.bottom)} fill="transparent" />
        <g className="fc-zone" aria-hidden="true">
          <rect x={m.left} y={y((limit * OPTIMAL_BAND.high) / 100)} width={width - m.left - m.right} height={y((limit * OPTIMAL_BAND.low) / 100) - y((limit * OPTIMAL_BAND.high) / 100)} />
        </g>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end">
                {cbm(t).replace('.00', '')}
              </text>
            </g>
          ))}
        </g>
        <line className="zero" x1={m.left} x2={width - m.right} y1={y(limit)} y2={y(limit)} />
        <text x={width - m.right} y={y(limit) - 5} textAnchor="end" className="ink">
          {limitLabel.toUpperCase()} {cbm(limit)}
        </text>
        {series.map((p) => (
          <text key={p.index} x={x(p.index)} y={height - 7} textAnchor="middle">
            {p.month.toUpperCase()}
          </text>
        ))}
        <motion.path className="l-actual" d={gen(series) ?? ''} {...draw} transition={{ duration: 1.0, ease: 'easeOut' }} />
        {series.map((p) => (
          <circle key={p.index} className={cx('dot', p.cbm > limit && 'hzdot')} cx={x(p.index)} cy={y(p.cbm)} r={p.cbm > limit ? 5 : 3} />
        ))}
        {hp && (
          <g aria-hidden="true">
            <line className="xh" x1={hx} x2={hx} y1={m.top} y2={height - m.bottom} />
            <line className="xh-tick" x1={hx} x2={hx} y1={height - m.bottom} y2={height - m.bottom + 6} />
            <circle className="mk-on" cx={hx} cy={y(hp.cbm)} r={hp.cbm > limit ? 8 : 6} />
            <g className="readbox" transform={`translate(${boxX}, ${Math.max(m.top, Math.min(y(hp.cbm) - 24, height - m.bottom - 50))})`}>
              <rect width={boxW} height={46} />
              <text x={9} y={15} className="ink">
                {hp.month.toUpperCase()}
              </text>
              <text x={9} y={30} className={hp.cbm > limit ? 'hz' : undefined}>
                {cbm(hp.cbm)} CBM, {pct((hp.cbm / limit) * 100)}
              </text>
            </g>
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
