import { useCallback } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { ReplenishmentRow, Rollup } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { useSort } from '../lib/sort';
import { STATUS_LABEL, count, cx, days, perDay } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { SortTh } from '../components/SortTh';
import { ChartSwitch } from '../components/ChartSwitch';
import { Donut } from '../components/Donut';
import { HBars } from '../components/HBars';
import type { BarRow } from '../components/HBars';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { StatusTag } from '../components/StatusTag';
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal, useRise } from '../components/Reveal';

type RKey = 'name' | 'verticalName' | 'quantity' | 'safetyStock' | 'maxStock' | 'leadTimeDays' | 'demandPerDay' | 'reorderPoint' | 'daysOfCover' | 'status';
const ORDER = { below: 0, lead: 1, healthy: 2 } as const;
const getR = (r: ReplenishmentRow, key: RKey) => (key === 'status' ? ORDER[r.status] : key === 'daysOfCover' ? (r.daysOfCover ?? 99999) : r[key]);

/** Replenishment: every material group against its reorder point, with the rule for each measure stated once. */
export default function ReplenishmentPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const rows = data?.replenishment.rows ?? [];
  const { sorted, state, toggle } = useSort<ReplenishmentRow, RKey>(rows, useCallback((r: ReplenishmentRow, key: RKey) => getR(r, key), []), { key: 'daysOfCover', dir: 'asc' });
  const rowReveal = useRowReveal();
  const rise = useRise();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, definitions, sources, replenishment, total } = data;
  /* The fifteen with the least cover, which is the list this page is read for; the
     tick is the group's own lead time, so a bar short of its tick cannot be reordered
     in time. A group with no forecast demand has no days of cover and is left out of
     the bars rather than drawn as a zero; every group is in the table below and in the
     status ring. */
  const coverBars: BarRow[] = replenishment.rows
    .filter((r): r is typeof r & { daysOfCover: number } => r.daysOfCover != null)
    .sort((a, b) => a.daysOfCover - b.daysOfCover)
    .slice(0, 15)
    .map((r) => ({
      key: r.slug,
      name: r.name,
      segments: [{ key: 'cover', value: r.daysOfCover, cls: r.status === 'below' ? ('hz' as const) : ('spot' as const) }],
      target: r.leadTimeDays,
      end: `${Math.round(r.daysOfCover)}d`,
      endDelta: STATUS_LABEL[r.status].toLowerCase(),
      endBad: r.status === 'below',
      readout: `${Math.round(r.daysOfCover)} DAYS OF COVER, LEAD TIME ${r.leadTimeDays} DAYS, ${r.quantity} ON HAND AGAINST A REORDER POINT OF ${r.reorderPoint}`,
    }));
  const sp = (key: RKey, natural: 'asc' | 'desc') => ({ active: state.key === key, dir: state.dir, natural, onSort: () => toggle(key, natural) });
  const measures = ['safetyStock', 'maxStock', 'leadTime', 'demand', 'reorderPoint', 'daysOfCover', 'status'];

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">Replenishment</h1>
          <p className="page-sub">Every material group against its reorder point, at forecast demand for {meta.forecastWindow}</p>
        </div>
        <p className="page-basis">
          Units, days
          <br />
          Cover from the stock date, {meta.stockDateLabel}
        </p>
      </motion.div>
      <Strip
        cols={4}
        items={[
          { label: 'Below reorder point', value: replenishment.counts.below, f: count, sub: 'order now', bad: replenishment.counts.below > 0 },
          { label: 'Within lead time', value: replenishment.counts.lead, f: count, sub: 'order this month' },
          { label: 'Healthy', value: replenishment.counts.healthy, f: count, sub: `of ${count(total.groups)} groups` },
          { label: 'In transit', value: total.inTransitValue, sub: `${count(total.inTransitQuantity)} units on order` },
        ]}
      />

      <Section id="groups" title="Material groups" note="Sorted with the least cover first. Red rows are at or under their reorder point. The rule for each column is under the table." source={sources['groups']} asOf={meta.dataAsOfLabel} defs={measures} definitions={definitions}>
        <ChartSwitch
          id="repl-chart"
          views={[
            { key: 'bars', label: 'Least cover first', icon: 'bars', render: () => <HBars id="repl-bars" ariaLabel="Days of cover for the fifteen material groups with the least cover, against each group's own lead time. Exact values are in the table below." format={(n) => `${Math.round(n)}d`} legend={[{ cls: 'spot', label: 'Days of cover' }, { cls: 'hz', label: 'At or under the reorder point' }, { cls: 'tick', label: 'Lead time' }]} rows={coverBars} /> },
            {
              key: 'ring',
              label: 'Every group by status',
              icon: 'donut',
              render: () => (
                <Donut
                  id="repl-donut"
                  format={(n) => `${Math.round(n)}`}
                  centreLabel="Material groups"
                  ariaLabel="Every material group by replenishment status. Exact values are in the table below."
                  keepOrder
                  rows={[
                    { key: 'below', name: STATUS_LABEL.below, value: replenishment.counts.below, bad: true },
                    { key: 'lead', name: STATUS_LABEL.lead, value: replenishment.counts.lead },
                    { key: 'healthy', name: STATUS_LABEL.healthy, value: replenishment.counts.healthy },
                  ]}
                />
              ),
            },
          ]}
        />
        <div className="scroll-x">
          <table className="mis compact sticky">
            <thead>
              <tr>
                <SortTh label="Material group" {...sp('name', 'asc')} />
                <SortTh label="Vertical" {...sp('verticalName', 'asc')} className="left" />
                <SortTh label="Stock" {...sp('quantity', 'desc')} />
                <SortTh label="Safety" {...sp('safetyStock', 'desc')} />
                <SortTh label="Max" {...sp('maxStock', 'desc')} />
                <SortTh label="Lead time" {...sp('leadTimeDays', 'desc')} />
                <SortTh label="Demand per day" {...sp('demandPerDay', 'desc')} />
                <SortTh label="Reorder point" {...sp('reorderPoint', 'desc')} />
                <SortTh label="Cover" {...sp('daysOfCover', 'asc')} />
                <th scope="col">Runs out</th>
                <SortTh label="Status" {...sp('status', 'asc')} className="left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <motion.tr key={r.slug} className={cx('hov', r.status === 'below' && 'over')} layout="position" {...rowReveal(i)}>
                  <td>
                    <Link to={`/g/${r.slug}`} className="vlink press">
                      {r.name}
                    </Link>
                  </td>
                  <td className="left muted">{r.verticalName}</td>
                  <Num v={r.quantity} f={count} bad={r.status === 'below'} />
                  <Num v={r.safetyStock} f={count} />
                  <Num v={r.maxStock} f={count} />
                  <Num v={r.leadTimeDays} f={(n) => `${count(n)} d`} />
                  <Num v={r.demandPerDay} f={perDay} />
                  <Num v={r.reorderPoint} f={count} />
                  <Num v={r.daysOfCover ?? 0} f={() => days(r.daysOfCover)} bad={r.daysOfCover != null && r.daysOfCover <= r.leadTimeDays} />
                  <td className={cx('num nowrap', r.status === 'below' && 'bad')}>{r.stockOutDateLabel ?? 'no forecast'}</td>
                  <td className="left st">
                    <StatusTag s={r.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
