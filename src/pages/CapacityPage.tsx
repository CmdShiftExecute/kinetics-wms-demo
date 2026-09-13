import { useCallback } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { OPTIMAL_BAND } from '../../data/cbm';
import type { Rollup, VerticalRow } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { useSort } from '../lib/sort';
import { cbm, count, cx, pct, signedCbm } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { SortTh } from '../components/SortTh';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { UtilChart } from '../components/UtilChart';
import { ProjectionChart } from '../components/ProjectionChart';
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal, useRise } from '../components/Reveal';

type VKey = 'name' | 'rackableCbm' | 'nonRackableCbm' | 'totalCbm' | 'allocatedCbm' | 'idleCbm' | 'utilPct' | 'overflowCbm';
const getV = (r: VerticalRow, key: VKey) => r[key];

/** Space and capacity: utilisation by vertical against allocation, the rackable split, overflow, and the four-month space projection. */
export default function CapacityPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const rows = data?.verticals ?? [];
  const { sorted, state, toggle } = useSort<VerticalRow, VKey>(rows, useCallback((r: VerticalRow, key: VKey) => getV(r, key), []), { key: 'utilPct', dir: 'desc' });
  const rowReveal = useRowReveal();
  const rise = useRise();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, site, total, definitions, sources, projectionTotal } = data;
  const sortProps = (key: VKey, natural: 'asc' | 'desc') => ({ active: state.key === key, dir: state.dir, natural, onSort: () => toggle(key, natural) });
  const stocked = data.verticals.filter((v) => v.groups > 0);
  const months = meta.projectionMonths;
  const peak = data.overview.projectionPeak;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">Space and capacity</h1>
          <p className="page-sub">Stock CBM against allocation, by vertical, and where the store will be in four months</p>
        </div>
        <p className="page-basis">
          Capacity {cbm(site.capacityCbm)} CBM
          <br />
          {count(site.netUsableSqFt)} sq ft net usable at {site.stackingHeightM} m
        </p>
      </motion.div>

      <Strip
        items={[
          { label: 'CBM in stock', value: total.totalCbm, f: cbm },
          { label: 'Capacity', value: site.capacityCbm, f: cbm },
          { label: 'Utilisation', value: total.utilPct, f: (n) => pct(n), sub: `optimal ${OPTIMAL_BAND.low} to ${OPTIMAL_BAND.high}`, bad: total.utilPct > OPTIMAL_BAND.high || total.utilPct < OPTIMAL_BAND.low },
          { label: 'Rackable', value: total.rackableCbm, f: cbm, sub: `${pct((total.rackableCbm / total.totalCbm) * 100, 0)} of stock` },
          { label: 'Non-rackable', value: total.nonRackableCbm, f: cbm, sub: 'floor stored' },
          { label: 'At overflow store', value: site.overflow.usedCbm, f: cbm, sub: `of ${cbm(site.overflow.capacityCbm)} rented`, bad: site.overflow.usedCbm > 0 },
        ]}
      />

      <Section id="util" title="Utilisation by vertical" note="Stock CBM over allocated CBM. Idle is allocation less stock; a negative figure is stock over the allocation, shown in red." source={sources['verticals']} asOf={meta.dataAsOfLabel} defs={['allocation', 'utilisation', 'rackable', 'overflow']} definitions={definitions}>
        <UtilChart id="cap-util" rows={stocked.map((v) => ({ slug: v.slug, name: v.name, used: v.totalCbm, allocated: v.allocatedCbm, utilPct: v.utilPct }))} />
        <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
          <table className="mis">
            <thead>
              <tr>
                <SortTh label="Vertical" {...sortProps('name', 'asc')} />
                <SortTh label="Rackable" {...sortProps('rackableCbm', 'desc')} />
                <SortTh label="Non-rackable" {...sortProps('nonRackableCbm', 'desc')} />
                <SortTh label="Total CBM" {...sortProps('totalCbm', 'desc')} />
                <SortTh label="Allocated" {...sortProps('allocatedCbm', 'desc')} />
                <SortTh label="Idle or over" {...sortProps('idleCbm', 'asc')} title="Allocation less stock; negative is over" />
                <SortTh label="Utilisation" {...sortProps('utilPct', 'desc')} />
                <SortTh label="At overflow" {...sortProps('overflowCbm', 'desc')} />
                <th scope="col">Groups</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <motion.tr key={r.slug} className={cx('hov', r.utilPct > 100 && 'over')} layout="position" {...rowReveal(i)}>
                  <td>
                    <Link to={`/calculator?v=${r.slug}`} className="vlink press" title="Open this vertical in the CBM calculator">
                      {r.name}
                    </Link>
                  </td>
                  <Num v={r.rackableCbm} f={cbm} />
                  <Num v={r.nonRackableCbm} f={cbm} />
                  <Num v={r.totalCbm} f={cbm} />
                  <Num v={r.allocatedCbm} f={cbm} />
                  <Num v={r.idleCbm} f={signedCbm} bad={r.idleCbm < 0} />
                  <Num v={r.utilPct} f={(n) => pct(n)} bad={r.utilPct > 100} />
                  <Num v={r.overflowCbm} f={cbm} bad={r.overflowCbm > 0} />
                  <Num v={r.groups} f={count} />
                </motion.tr>
              ))}
              <tr className="total">
                <td>{total.name}</td>
                <Num v={total.rackableCbm} f={cbm} />
                <Num v={total.nonRackableCbm} f={cbm} />
                <Num v={total.totalCbm} f={cbm} />
                <Num v={total.allocatedCbm} f={cbm} />
                <Num v={total.idleCbm} f={signedCbm} bad={total.idleCbm < 0} />
                <Num v={total.utilPct} f={(n) => pct(n)} />
                <Num v={total.overflowCbm} f={cbm} />
                <Num v={total.groups} f={count} />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="projection" title="Space need, next four months" note="Month-end CBM at forecast demand, with in-transit arrivals and replenishment to max stock one lead time after each reorder point is crossed." source={sources['verticals']} asOf={meta.dataAsOfLabel} defs={['projection', 'capacity']} definitions={definitions}>
        <ProjectionChart id="cap-proj" currentLabel={meta.stockDateLabel.slice(3)} current={total.totalCbm} points={projectionTotal} limit={site.capacityCbm} limitLabel="Capacity" subject="the store" />
        <p className="sec-intro" style={{ marginTop: 'var(--s-sm)' }}>
          Peak projected position is <strong className={cx(peak.cbm > site.capacityCbm && 'bad')}>{cbm(peak.cbm)} CBM</strong> in {peak.month}, {pct(peak.pctOfCapacity)} of capacity. Cells over a vertical's allocation are shown in red.
        </p>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">Allocated</th>
                <th scope="col">{meta.stockDateLabel.slice(3)}</th>
                {months.map((m) => (
                  <th key={m} scope="col">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocked.map((v) => (
                <tr key={v.slug} className="hov">
                  <td>{v.name}</td>
                  <Num v={v.allocatedCbm} f={cbm} />
                  <Num v={v.totalCbm} f={cbm} bad={v.totalCbm > v.allocatedCbm} />
                  {v.projection.map((p) => (
                    <Num key={p.index} v={p.cbm} f={cbm} bad={p.cbm > v.allocatedCbm} />
                  ))}
                </tr>
              ))}
              <tr className="total">
                <td>{total.name}</td>
                <Num v={site.capacityCbm} f={cbm} />
                <Num v={total.totalCbm} f={cbm} bad={total.totalCbm > site.capacityCbm} />
                {projectionTotal.map((p) => (
                  <Num key={p.index} v={p.cbm} f={cbm} bad={p.cbm > site.capacityCbm} />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
