import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { motion, useReducedMotion } from 'motion/react';
import type { MonthPoint } from '../../data/schema';
import { count, cx } from '../lib/format';
import { useWidth } from './useWidth';

interface Props {
  points: MonthPoint[];
  reorderPoint: number;
  safetyStock: number;
  subject: string;
  id: string;
  height?: number;
}

/**
 * Twelve month-end quantities as an ink line, with the reorder point dashed
 * and safety stock as a thin line. Months at or under the reorder point are
 * marked in hazard. Arrow keys move the crosshair; values are in the table.
 */
export function StockLine({ points, reorderPoint, safetyStock, subject, id, height = 200 }: Props) {
  const { ref, width } = useWidth(800);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 16, right: 16, bottom: 24, left: 52 };
  const x = scalePoint<number>().domain(points.map((p) => p.index)).range([m.left, width - m.right]);
  const hi = Math.max(reorderPoint * 1.15, ...points.map((p) => p.quantity * 1.1), 1);
  const y = scaleLinear().domain([0, hi]).range([height - m.bottom, m.top]);
  const gen = d3line<MonthPoint>().x((d) => x(d.index) ?? 0).y((d) => y(d.quantity));
  const ticks = y.ticks(4);
  const dense = width < 640;
  const nearest = (px: number) => points.reduce((best, p) => (Math.abs((x(p.index) ?? 0) - px) < Math.abs((x(best.index) ?? 0) - px) ? p : best), points[0]!).index;
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(Math.min(12, Math.max(1, (hover ?? 12) + (e.key === 'ArrowRight' ? 1 : -1))));
    }
    if (e.key === 'Escape') setHover(null);
  };
  const hp = hover != null ? points.find((p) => p.index === hover) : undefined;
  const hx = hp ? (x(hp.index) ?? 0) : 0;
  const boxW = 168;
  const boxX = hx + boxW + 12 > width ? hx - boxW - 12 : hx + 12;
  const draw = reduce ? {} : { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true, amount: 0.4 } };
  return (
    <div className="chart-wrap" ref={ref}>
      <p className="chart-axis-note">Units at month end. Reorder point {count(reorderPoint)} dashed; safety stock {count(safetyStock)} thin.</p>
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Month-end stock of ${subject} for twelve months against the reorder point. Exact values are in the table.`} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onFocus={() => setHover(12)} onBlur={() => setHover(null)} id={id}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end">
                {count(t)}
              </text>
            </g>
          ))}
        </g>
        {points.map((p) =>
          dense && p.index % 2 === 0 ? null : (
            <text key={p.index} x={x(p.index)} y={height - 7} textAnchor="middle">
              {p.month.slice(0, 3).toUpperCase()}
            </text>
          ),
        )}
        <line className="l-budget" x1={m.left} x2={width - m.right} y1={y(safetyStock)} y2={y(safetyStock)} />
        <line className="l-forecast" x1={m.left} x2={width - m.right} y1={y(reorderPoint)} y2={y(reorderPoint)} />
        <motion.path className="l-actual" d={gen(points) ?? ''} {...draw} transition={{ duration: 1.0, ease: 'easeOut' }} />
        {points.map((p) => (
          <circle key={p.index} className={cx('dot', p.quantity <= reorderPoint && 'hzdot')} cx={x(p.index)} cy={y(p.quantity)} r={p.quantity <= reorderPoint ? 4 : 2.5} />
        ))}
        {hp && (
          <g aria-hidden="true">
            <line className="xh" x1={hx} x2={hx} y1={m.top} y2={height - m.bottom} />
            <g className="readbox" transform={`translate(${boxX}, ${Math.max(m.top, Math.min(y(hp.quantity) - 24, height - m.bottom - 50))})`}>
              <rect width={boxW} height={46} />
              <text x={9} y={15} className="ink">
                {hp.month.toUpperCase()}
              </text>
              <text x={9} y={30} className={hp.quantity <= reorderPoint ? 'hz' : undefined}>
                {count(hp.quantity)} UNITS
              </text>
            </g>
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {hp ? `${hp.month}: ${count(hp.quantity)} units` : ''}
      </p>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i /> Month-end stock
        </span>
        <span>
          <i className="fc" /> Reorder point
        </span>
        <span>
          <i className="bd" /> Safety stock
        </span>
      </div>
    </div>
  );
}
