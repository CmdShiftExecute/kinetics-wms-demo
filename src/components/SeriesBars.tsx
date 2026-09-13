import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { motion, useReducedMotion } from 'motion/react';
import { cx } from '../lib/format';
import { GROUP_IN_VIEW, mark } from './ChartMotion';
import { useWidth } from './useWidth';

export interface SeriesPoint {
  index: number;
  label: string;
  value: number;
  /** Draws the column in hazard, e.g. a month at or under the reorder point. */
  bad?: boolean;
  /** Draws the column in the spot ink, e.g. a forecast month rather than an actual one. */
  ahead?: boolean;
}

interface Props {
  id: string;
  points: SeriesPoint[];
  format: (n: number) => string;
  ariaLabel: string;
  /** A line across the plot, e.g. the reorder point or the store's capacity. */
  limit?: number;
  limitLabel?: string;
  /** One line of figures for the readout and the live region, upper case. */
  readout: (p: SeriesPoint) => string;
  note: string;
  height?: number;
}

/**
 * The same series as columns rather than a line: each period against a fixed
 * limit, on an axis that starts at zero because a truncated column lies about
 * its own length. Pointing at a column, or walking with the arrow keys, reads
 * its figures out. Exact values are in the table below the chart.
 */
export function SeriesBars({ id, points, format, ariaLabel, limit, limitLabel, readout, note, height = 220 }: Props) {
  const { ref, width } = useWidth(880);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 20, right: 16, bottom: 26, left: 62 };
  const barW = Math.max(6, Math.min(30, ((width - m.left - m.right) / Math.max(1, points.length)) * 0.52));
  const x = scalePoint<number>()
    .domain(points.map((p) => p.index))
    .range([m.left + barW / 2 + 2, width - m.right - barW / 2]);
  const top = Math.max(limit ?? 0, ...points.map((p) => p.value)) * 1.12;
  const y = scaleLinear().domain([0, top || 1]).range([height - m.bottom, m.top]).nice();
  const dense = width < 640;
  const nearest = (px: number) => points.reduce((best, p) => (Math.abs((x(p.index) ?? 0) - px) < Math.abs((x(best.index) ?? 0) - px) ? p : best), points[0]!).index;
  const onMove = (e: PointerEvent<SVGSVGElement>) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = hover ?? points[points.length - 1]!.index;
      const i = points.findIndex((p) => p.index === cur);
      const next = points[Math.min(points.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))]!;
      setHover(next.index);
    }
    if (e.key === 'Escape') setHover(null);
  };
  const hp = hover != null ? points.find((p) => p.index === hover) : undefined;
  const hx = hp ? (x(hp.index) ?? 0) : 0;
  const CH = 6.8;
  const hName = hp ? hp.label.toUpperCase() : '';
  const hFigs = hp ? readout(hp) : '';
  const boxW = hp ? Math.min(width, 20 + (hName.length + hFigs.length + 3) * CH) : 0;
  const boxX = hp ? Math.max(0, Math.min(width - boxW, hx - boxW / 2)) : 0;
  const grp = reduce ? {} : GROUP_IN_VIEW;
  const grow = (delay: number) => (reduce ? {} : mark({ scaleY: 0 }, { scaleY: 1 }, delay));
  const fade = (delay: number) => (reduce ? {} : mark({ opacity: 0 }, { opacity: 1 }, delay, 0.35));

  return (
    <div className="chart-wrap" ref={ref}>
      <p className="chart-axis-note">{note}</p>
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onFocus={() => setHover(points[points.length - 1]!.index)} onBlur={() => setHover(null)} id={id}>
        <rect className="capture" x={0} y={0} width={width} height={height} fill="transparent" />
        <g className="grid">
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'zero' : undefined} />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
        </g>
        {points.map((p, i) =>
          dense && i % 2 === 1 ? null : (
            <text key={p.index} x={x(p.index)} y={height - 8} textAnchor="middle">
              {p.label.toUpperCase()}
            </text>
          ),
        )}
        <motion.g {...grp}>
          {points.map((p, i) => (
            <motion.rect key={p.index} className={cx('seg', p.bad ? 'c-hz' : p.ahead ? 'c-spot' : 'c-ink', hover === p.index && 'mk-on')} x={(x(p.index) ?? 0) - barW / 2} y={y(p.value)} width={barW} height={Math.max(1, y(0) - y(p.value))} style={{ originY: 1 }} {...grow(0.035 * i)} />
          ))}
        </motion.g>
        {limit != null && (
          <>
            <line className="l-forecast" x1={m.left} x2={width - m.right} y1={y(limit)} y2={y(limit)} />
            <motion.text x={width - m.right} y={y(limit) - 5} textAnchor="end" className="ink" {...fade(0.5)}>
              {(limitLabel ?? 'LIMIT').toUpperCase()} {format(limit)}
            </motion.text>
          </>
        )}
        {hp && (
          <g aria-hidden="true">
            <line className="xh" x1={hx} x2={hx} y1={m.top} y2={height - m.bottom} />
            <g className="readbox" transform={`translate(${boxX}, 2)`}>
              <rect width={boxW} height={22} />
              <text x={10} y={15} className="ink">
                {hName}
              </text>
              <text x={10 + (hName.length + 2) * CH} y={15} className={hp.bad ? 'hz' : undefined}>
                {hFigs}
              </text>
            </g>
          </g>
        )}
      </svg>
      <p className="sr-only" aria-live="polite">
        {hp ? `${hp.label}: ${hFigs.toLowerCase()}` : ''}
      </p>
    </div>
  );
}
