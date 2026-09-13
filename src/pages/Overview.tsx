import { useCallback } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { OPTIMAL_BAND } from '../../data/cbm';
import type { Rollup, VerticalRow } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { useSort } from '../lib/sort';
import { aed, cbm, count, cx, days, mil, pct } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { SortTh } from '../components/SortTh';
import { ChartSwitch } from '../components/ChartSwitch';
import { Donut } from '../components/Donut';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { UtilChart } from '../components/UtilChart';
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal, useRise } from '../components/Reveal';
import { StatusTag } from '../components/StatusTag';

type VKey = 'name' | 'stockValue' | 'totalCbm' | 'utilPct' | 'idleCbm' | 'dailyStorageCost' | 'belowReorder';
const getV = (r: VerticalRow, key: VKey) => r[key];

/**
 * The overview answers the five questions a managing director asks of a
 * warehouse, in order: how much value is on the racks, how full it is, what
 * it costs per day, what is aging, and what will run out. One table or one
 * chart per block; every block links to its report.
 */
export default function Overview() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const rows = data?.verticals ?? [];
  const { sorted, state, toggle } = useSort<VerticalRow, VKey>(rows, useCallback((r: VerticalRow, key: VKey) => getV(r, key), []), { key: 'stockValue', dir: 'desc' });
  const rowReveal = useRowReveal();
  const rise = useRise();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;

  const { meta, overview: o, site, total, definitions, sources, replenishment } = data;
  const asOf = meta.dataAsOfLabel;
  const sortProps = (key: VKey, natural: 'asc' | 'desc') => ({ active: state.key === key, dir: state.dir, natural, onSort: () => toggle(key, natural) });
  const utilBad = o.utilPct > OPTIMAL_BAND.high || o.utilPct < OPTIMAL_BAND.low;
  const stocked = data.verticals.filter((v) => v.groups > 0);

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">Overview</h1>
          <p className="page-sub">
            {site.name}, stock position {meta.stockDateLabel}
          </p>
        </div>
        <p className="page-basis">
          Amounts in whole AED at cost. Space in CBM
          <br />
          {count(total.groups)} material groups across {stocked.length} stocked verticals
        </p>
      </motion.div>

      {/* the five answers, one line each, before any detail */}
      <dl className="strip answers" aria-label="The five answers" id="answers" style={{ '--cols': 5 } as React.CSSProperties}>
        <div>
          <dt>On the racks</dt>
          <dd className="big">{mil(o.stockValue)}</dd>
          <dd className="sub">
            <Link to="#value" className="vlink">
              {count(total.groups)} groups, {stocked.length} verticals
            </Link>
          </dd>
        </div>
        <div>
          <dt>How full</dt>
          <dd className={cx('big', utilBad && 'bad')}>{pct(o.utilPct)}</dd>
          <dd className="sub">
            <Link to="#space" className="vlink">
              {cbm(o.totalCbm)} of {cbm(o.capacityCbm)} CBM
            </Link>
          </dd>
        </div>
        <div>
          <dt>Cost per day</dt>
          <dd className="big">AED {aed(o.dailyStorageCost)}</dd>
          <dd className="sub">
            <Link to="#cost" className="vlink">
              {aed(o.overflowDailyCost)} of it at the overflow store
            </Link>
          </dd>
        </div>
        <div>
          <dt>Aging</dt>
          <dd className="big bad">{pct(o.agePct.d180to365 + o.agePct.over365)}</dd>
          <dd className="sub">
            <Link to="#aging" className="vlink">
              of value over 180 days; {pct(o.agePct.over365)} over a year
            </Link>
          </dd>
        </div>
        <div>
          <dt>Running out</dt>
          <dd className={cx('big', o.belowReorder > 0 && 'bad')}>{count(o.belowReorder)} groups</dd>
          <dd className="sub">
            <Link to="#runout" className="vlink">
              below reorder point; {count(o.needsOrder.length)} need an order
            </Link>
          </dd>
        </div>
      </dl>

      <div className="overview-grid">
        {/* 1. value on the racks */}
        <Section id="value" title="How much is on the racks" note={`Stock value at cost by vertical, ${meta.stockDateLabel}. Share is of the store total.`} link={{ to: '/aging', label: 'Aging and turnover' }} source={sources['verticals']} asOf={asOf} defs={['stockValue', 'cbm']} definitions={definitions} compact>
          <Strip cols={3} items={[{ label: 'Stock value', value: o.stockValue, sub: mil(o.stockValue) }, { label: 'Free of commitments', value: total.freeStock, sub: `${pct((total.freeStock / o.stockValue) * 100, 0)} of value` }, { label: 'In transit, not in stock', value: total.inTransitValue, sub: `${count(data.inbound.items.length)} arrivals due` }]} />
          <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
            <table className="mis compact">
              <thead>
                <tr>
                  <SortTh label="Vertical" {...sortProps('name', 'asc')} />
                  <SortTh label="Stock value" {...sortProps('stockValue', 'desc')} />
                  <th scope="col">Share</th>
                  <SortTh label="CBM" {...sortProps('totalCbm', 'desc')} />
                  <SortTh label="Below reorder" {...sortProps('belowReorder', 'desc')} title="Material groups at or under their reorder point" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <motion.tr key={r.slug} className="hov" layout="position" {...rowReveal(i)}>
                    <td>
                      <Link to={`/calculator?v=${r.slug}`} className="vlink press" title="Open this vertical in the CBM calculator">
                        {r.name}
                      </Link>
                    </td>
                    <Num v={r.stockValue} />
                    <Num v={r.valueSharePct} f={(n) => pct(n)} />
                    <Num v={r.totalCbm} f={cbm} />
                    <Num v={r.belowReorder} f={count} bad={r.belowReorder > 0} />
                  </motion.tr>
                ))}
                <tr className="total">
                  <td>{total.name}</td>
                  <Num v={total.stockValue} />
                  <Num v={total.valueSharePct} f={(n) => pct(n)} />
                  <Num v={total.totalCbm} f={cbm} />
                  <Num v={total.belowReorder} f={count} bad={total.belowReorder > 0} />
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* 2. how full */}
        <Section id="space" title="How full we are" note={`CBM in stock against ${cbm(site.capacityCbm)} CBM capacity; each vertical against its allocation. Optimal band ${OPTIMAL_BAND.low} to ${OPTIMAL_BAND.high} percent.`} link={{ to: '/capacity', label: 'Space and capacity' }} source={sources['site']} asOf={asOf} defs={['capacity', 'utilisation', 'allocation']} definitions={definitions} compact>
          <Strip cols={3} items={[{ label: 'CBM in stock', value: o.totalCbm, f: cbm, sub: `of which ${cbm(site.overflow.usedCbm)} at the overflow store` }, { label: 'Store capacity', value: o.capacityCbm, f: cbm, sub: `${cbm(total.rackableCbm)} rackable in stock` }, { label: 'Utilisation', value: o.utilPct, f: (n) => pct(n), sub: utilBad ? `outside the ${OPTIMAL_BAND.low} to ${OPTIMAL_BAND.high} band` : `inside the ${OPTIMAL_BAND.low} to ${OPTIMAL_BAND.high} band`, bad: utilBad }]} />
          <div style={{ marginTop: 'var(--s-lg)' }}>
            <ChartSwitch
              id="ov-space"
              views={[
                { key: 'bars', label: 'Against each allocation', icon: 'bars', render: () => <UtilChart id="ov-util" rows={stocked.map((v) => ({ slug: v.slug, name: v.name, used: v.totalCbm, allocated: v.allocatedCbm, utilPct: v.utilPct }))} /> },
                {
                  key: 'share',
                  label: 'Share of the space used',
                  icon: 'donut',
                  render: () => <Donut id="ov-space-donut" format={cbm} centreLabel="CBM in stock" ariaLabel="Share of the CBM in stock by vertical. Exact values are in the capacity report." rows={stocked.map((v) => ({ key: v.slug, name: v.name, value: v.totalCbm }))} />,
                },
              ]}
            />
          </div>
          <div className="sec-intro" style={{ marginTop: 'var(--s-sm)' }}>
            <p>
              <Link to="/capacity" className="vlink">
                {o.overVertical.name}
              </Link>{' '}
              holds <strong className="bad">{pct(o.overVertical.utilPct)}</strong> of its allocation, {cbm(-data.verticals.find((v) => v.slug === o.overVertical.slug)!.idleCbm)} CBM over.{' '}
              <Link to="/capacity" className="vlink">
                {o.underVertical.name}
              </Link>{' '}
              uses {pct(o.underVertical.utilPct)} of its own.
            </p>
          </div>
        </Section>

        {/* 3. cost per day */}
        <Section id="cost" title="What it costs per day" note={`Storage cost of the stock held, per day, at AED ${site.dailyRatePerCbm} per CBM (store) and AED ${site.overflow.dailyRatePerCbm} (overflow).`} link={{ to: '/cost', label: 'Cost' }} source={sources['cost']} asOf={asOf} defs={['dailyRate', 'dailyCost', 'overflow']} definitions={definitions} compact>
          <Strip cols={3} items={[{ label: 'Daily storage cost', value: o.dailyStorageCost, sub: `AED ${aed(o.annualisedStorageCost)} a year at this position` }, { label: 'Of which overflow', value: o.overflowDailyCost, sub: `${cbm(site.overflow.usedCbm)} CBM at ${(site.overflow.dailyRatePerCbm / site.dailyRatePerCbm).toFixed(1)} times the store rate`, bad: site.overflow.usedCbm > 0 }, { label: `Month cost, ${data.cost.monthLabel.split(' ')[0]}`, value: data.cost.total.total, sub: 'rent, handling, utilities, overflow' }]} />
          <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
            <table className="mis compact">
              <thead>
                <tr>
                  <th scope="col">Vertical</th>
                  <th scope="col">CBM</th>
                  <th scope="col">AED per day</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {[...stocked]
                  .sort((a, b) => b.dailyStorageCost - a.dailyStorageCost)
                  .slice(0, 5)
                  .map((r) => (
                    <tr key={r.slug} className="hov">
                      <td>{r.name}</td>
                      <Num v={r.totalCbm} f={cbm} />
                      <Num v={r.dailyStorageCost} />
                      <Num v={r.dailyCostSharePct} f={(n) => pct(n)} />
                    </tr>
                  ))}
                <tr className="total">
                  <td>All verticals</td>
                  <Num v={total.totalCbm} f={cbm} />
                  <Num v={o.dailyStorageCost} />
                  <Num v={total.dailyCostSharePct} f={(n) => pct(n)} />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
            Five largest shown, shares of the store total; every vertical and material group is on the cost page.
          </p>
        </Section>

        {/* 4. aging */}
        <Section id="aging" title="What is aging" note="Stock value by days since receipt. Anything over a year is shown in red because it is the stock a provision follows." link={{ to: '/aging', label: 'Aging and turnover' }} source={sources['groups']} asOf={asOf} defs={['ageBands', 'turnover', 'abc']} definitions={definitions} compact>
          <Strip cols={4} items={[{ label: 'Under 90 days', value: o.age.under90, sub: `${pct(o.agePct.under90)} of value` }, { label: '90 to 180 days', value: o.age.d90to180, sub: `${pct(o.agePct.d90to180)} of value` }, { label: '180 to 365 days', value: o.age.d180to365, sub: `${pct(o.agePct.d180to365)} of value` }, { label: 'Over a year', value: o.age.over365, sub: `${pct(o.agePct.over365)} of value`, bad: o.age.over365 > 0 }]} />
          <div className="sec-intro" style={{ marginTop: 'var(--s-md)' }}>
            <p>
              <strong className={cx((o.agePct.d180to365 + o.agePct.over365) > 20 && 'bad')}>{pct(o.agePct.d180to365 + o.agePct.over365)}</strong> of value has been on the racks more than 180 days. Store turnover is {total.turnover.toFixed(1)}x a year. The fifteen slowest groups are listed on the aging report, with the ABC split and the storage rule for each class.
            </p>
          </div>
        </Section>

        {/* 5. run out */}
        <div style={{ gridColumn: '1 / -1' }}>
        <Section id="runout" title="What will run out" note={`Every group at or under its reorder point, and every group projected to run out within 60 days of ${meta.stockDateLabel} at forecast demand; least cover first.`} link={{ to: '/replenishment', label: 'Replenishment' }} source={sources['groups']} asOf={asOf} defs={['reorderPoint', 'daysOfCover', 'status', 'inTransit']} definitions={definitions} compact>
          <Strip cols={3} items={[{ label: 'Below reorder point', value: replenishment.counts.below, f: count, sub: 'order now', bad: replenishment.counts.below > 0 }, { label: 'Within lead time', value: replenishment.counts.lead, f: count, sub: 'order this month' }, { label: 'Healthy', value: replenishment.counts.healthy, f: count, sub: `of ${count(total.groups)} groups` }]} />
          <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
            <table className="mis compact">
              <thead>
                <tr>
                  <th scope="col">Material group</th>
                  <th scope="col" className="left">
                    Vertical
                  </th>
                  <th scope="col">Stock</th>
                  <th scope="col">Reorder pt</th>
                  <th scope="col">Cover</th>
                  <th scope="col">Runs out</th>
                  <th scope="col">Arrival in transit</th>
                  <th scope="col" className="left">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {o.needsOrder.map((s) => (
                  <tr key={s.slug} className={cx('hov', s.status === 'below' && 'over')}>
                    <td>
                      <Link to={`/g/${s.slug}`} className="vlink press">
                        {s.name}
                      </Link>
                    </td>
                    <td className="left muted">{s.verticalName}</td>
                    <Num v={s.quantity} f={count} bad={s.status === 'below'} />
                    <Num v={s.reorderPoint} f={count} />
                    <Num v={s.daysOfCover ?? 0} f={() => days(s.daysOfCover)} bad={s.daysOfCover != null && s.daysOfCover <= 30} />
                    <td className={cx('num nowrap', s.daysOfCover != null && s.daysOfCover <= 60 && 'bad')}>{s.stockOutDateLabel ?? 'no forecast'}</td>
                    <td className={cx('num nowrap', !s.inTransitArrival && 'muted')}>{s.inTransitArrival ?? 'nothing ordered'}</td>
                    <td className="left st">
                      <StatusTag s={s.status} />
                    </td>
                  </tr>
                ))}
                {o.needsOrder.length === 0 && (
                  <tr>
                    <td colSpan={8} className="left muted">
                      No group is at its reorder point or runs out within 60 days at forecast demand.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
        </div>
      </div>

      <Footer meta={meta} />
    </div>
  );
}
