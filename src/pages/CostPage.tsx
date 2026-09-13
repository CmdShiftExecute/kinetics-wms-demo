import { useCallback } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { GroupSummary, Rollup } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { useSort } from '../lib/sort';
import { aed, cbm, count, cx, pct } from '../lib/format';
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
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal, useRise } from '../components/Reveal';

type GroupCost = GroupSummary;
type GKey = 'name' | 'verticalName' | 'totalCbm' | 'dailyStorageCost' | 'stockValue';
const getG = (r: GroupCost, key: GKey) => r[key];

/** Cost: the daily rate derived from the site, storage cost by vertical and by group, the month's cost split, and the site-options decision table. */
const COST_LEGEND = [
  { cls: 'spot' as const, label: 'Rent charged to stock' },
  { cls: 'spot2' as const, label: 'Handling' },
  { cls: 'ink' as const, label: 'Utilities' },
  { cls: 'hz' as const, label: 'Third-party overflow' },
];

export default function CostPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const groups: GroupCost[] = data?.groups ?? [];
  const { sorted, state, toggle } = useSort<GroupCost, GKey>(groups, useCallback((r: GroupCost, key: GKey) => getG(r, key), []), { key: 'dailyStorageCost', dir: 'desc' });
  const rowReveal = useRowReveal();
  const rise = useRise();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, site, total, definitions, sources, cost } = data;
  /* Handling is drawn as one segment because fixed and variable handling are one
     activity and five segments is one more than the print system has fills for. The
     table below keeps both columns. A vertical with no storage cost is left out of the
     bars rather than drawn as a blank row; it is still in the table. */
  const costBars: BarRow[] = cost.rows
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((r) => ({
      key: r.slug,
      name: r.name,
      segments: [
        { key: 'rent', value: r.rent, cls: 'spot' as const },
        { key: 'handling', value: r.handlingFixed + r.handlingVariable, cls: 'spot2' as const },
        { key: 'util', value: r.utilities, cls: 'ink' as const },
        { key: 'ovf', value: r.overflow, cls: 'hz' as const },
      ],
      end: aed(r.total),
      endDelta: pct(r.sharePct, 0),
      endBad: r.overflow > 0,
      readout: `${aed(r.total)} A MONTH: RENT ${aed(r.rent)}, HANDLING ${aed(r.handlingFixed + r.handlingVariable)}, UTILITIES ${aed(r.utilities)}, OVERFLOW ${aed(r.overflow)}`,
    }));
  const sp = (key: GKey, natural: 'asc' | 'desc') => ({ active: state.key === key, dir: state.dir, natural, onSort: () => toggle(key, natural) });
  const monthlyRent = cost.total.rent;
  const cheapest = [...cost.siteOptions].sort((a, b) => a.effectiveRatePerSqFt - b.effectiveRatePerSqFt)[0]!;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">Cost</h1>
          <p className="page-sub">What a cubic metre costs per day, what each vertical's stock costs to hold, and the month's cost split</p>
        </div>
        <p className="page-basis">
          Whole AED
          <br />
          {cost.monthLabel}, {cost.daysInMonth} days
        </p>
      </motion.div>
      <Strip
        items={[
          { label: 'Rate per CBM per day', value: site.dailyRatePerCbm, f: (n) => n.toFixed(4), sub: `rent ${aed(site.annualRent)} a year over ${cbm(site.capacityCbm)} CBM` },
          { label: 'Daily storage cost', value: total.dailyStorageCost, sub: 'of the stock held today' },
          { label: 'Monthly rent', value: monthlyRent, sub: `AED ${site.rentPerSqFtYear} per sq ft a year` },
          { label: `Rent charged to stock`, value: cost.rentChargedToStock, sub: `${cost.monthLabel.split(' ')[0]}; the rest is idle space` },
          { label: 'Overflow store', value: cost.total.overflow, sub: `AED ${site.overflow.dailyRatePerCbm} per CBM per day`, bad: cost.total.overflow > 0 },
          { label: `Month total`, value: cost.total.total, sub: 'rent, handling, utilities, overflow' },
        ]}
      />

      <Section id="split" title={`Cost split by vertical, ${cost.monthLabel}`} note="CBM in store is main-store CBM, so the column adds to capacity; overflow CBM has its own column. Rent charged to stock is main-store CBM times the daily rate times the days in the month; idle capacity carries the rest of the rent. Handling is fixed staff by CBM share plus AED 6 per forecast movement." source={sources['cost']} asOf={meta.dataAsOfLabel} defs={['dailyCost', 'rentCharged', 'handling', 'overflow']} definitions={definitions}>
        <ChartSwitch
          id="cost-chart"
          views={[
            { key: 'bars', label: 'What each vertical costs', icon: 'bars', render: () => <HBars id="cost-bars" ariaLabel="Monthly storage cost by vertical, split into rent, handling, utilities and third-party overflow, largest first. Exact values are in the table below." format={aed} legend={COST_LEGEND} rows={costBars} /> },
            {
              key: 'ring',
              label: 'What the store spends on',
              icon: 'donut',
              render: () => (
                <Donut
                  id="cost-donut"
                  format={aed}
                  centreLabel={`Cost, ${cost.monthLabel}`}
                  ariaLabel="The store's monthly cost split into rent, handling, utilities and third-party overflow. Exact values are in the table below."
                  keepOrder
                  rows={[
                    { key: 'rent', name: 'Rent', value: cost.total.rent },
                    { key: 'handling', name: 'Handling, fixed and variable', value: cost.total.handlingFixed + cost.total.handlingVariable },
                    { key: 'utilities', name: 'Utilities', value: cost.total.utilities },
                    { key: 'overflow', name: 'Third-party overflow', value: cost.total.overflow, bad: true },
                  ]}
                />
              ),
            },
            { key: 'composition', label: 'Cost mix, each to 100%', icon: 'stack', render: () => <HBars id="cost-share" mode="share" ariaLabel="The cost mix of each vertical as shares of its own monthly cost. Exact values are in the table below." format={aed} legend={COST_LEGEND} rows={costBars} /> },
          ]}
        />
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">CBM in store</th>
                <th scope="col">At overflow</th>
                <th scope="col">AED per day</th>
                <th scope="col">Rent charged</th>
                <th scope="col">Handling, fixed</th>
                <th scope="col">Handling, variable</th>
                <th scope="col">Utilities</th>
                <th scope="col">Overflow store</th>
                <th scope="col">Month total</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {cost.rows.map((r) => (
                <tr key={r.slug} className={cx('hov', r.slug === 'idle' && 'indent')}>
                  <td>{r.name}</td>
                  <Num v={r.mainCbm} f={cbm} />
                  <Num v={r.overflowCbm} f={cbm} bad={r.overflowCbm > 0} />
                  <Num v={r.dailyStorageCost} />
                  <Num v={r.rent} />
                  <Num v={r.handlingFixed} />
                  <Num v={r.handlingVariable} />
                  <Num v={r.utilities} />
                  <Num v={r.overflow} bad={r.overflow > 0} />
                  <Num v={r.total} />
                  <Num v={r.sharePct} f={(n) => pct(n)} />
                </tr>
              ))}
              <tr className="total">
                <td>{cost.total.name}</td>
                <Num v={cost.total.mainCbm} f={cbm} />
                <Num v={cost.total.overflowCbm} f={cbm} bad={cost.total.overflowCbm > 0} />
                <Num v={cost.total.dailyStorageCost} />
                <Num v={cost.total.rent} />
                <Num v={cost.total.handlingFixed} />
                <Num v={cost.total.handlingVariable} />
                <Num v={cost.total.utilities} />
                <Num v={cost.total.overflow} bad={cost.total.overflow > 0} />
                <Num v={cost.total.total} />
                <Num v={cost.total.sharePct} f={(n) => pct(n)} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
          Rent rows add to {aed(cost.total.rent)}, one twelfth of the annual rent. The idle line is what the empty {cbm(cost.rows.find((r) => r.slug === 'idle')!.mainCbm)} CBM costs for the month.
        </p>
      </Section>

      <Section id="groups" title="Storage cost by material group" note="Each group's CBM at the store rate, plus its overflow CBM at the overflow rate, per day. The same figure the vertical rows sum." source={sources['groups']} asOf={meta.dataAsOfLabel} defs={['dailyRate']} definitions={definitions}>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <SortTh label="Material group" {...sp('name', 'asc')} />
                <SortTh label="Vertical" {...sp('verticalName', 'asc')} className="left" />
                <SortTh label="CBM" {...sp('totalCbm', 'desc')} />
                <SortTh label="AED per day" {...sp('dailyStorageCost', 'desc')} />
                <SortTh label="Stock value" {...sp('stockValue', 'desc')} />
                <th scope="col">Value per CBM</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <motion.tr key={r.slug} className="hov" layout="position" {...rowReveal(i)}>
                  <td>
                    <Link to={`/g/${r.slug}`} className="vlink press">
                      {r.name}
                    </Link>
                  </td>
                  <td className="left muted">{r.verticalName}</td>
                  <Num v={r.totalCbm} f={cbm} />
                  <Num v={r.dailyStorageCost} />
                  <Num v={r.stockValue} />
                  <Num v={r.valuePerCbm} />
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="options" title="Site options" note={`The current unit and three alternatives on one template. Rent is the sum of each option's parts, an area at a rate; the commission is 5 percent of the rent on new space; the effective rate spreads it over a ${cost.siteOptions[0]!.termMonths}-month term.`} source={sources['siteOptions']} asOf={meta.dataAsOfLabel} defs={['effectiveRate']} definitions={definitions}>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col" className="left">
                  Location
                </th>
                <th scope="col">Size, sq m</th>
                <th scope="col">Size, sq ft</th>
                <th scope="col">Annual rent</th>
                <th scope="col">Monthly rent</th>
                <th scope="col">Rate per sq ft, month</th>
                <th scope="col">Agent commission</th>
                <th scope="col">Effective rate</th>
                <th scope="col" className="left">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {cost.siteOptions.map((o) => (
                <tr key={o.key} className={cx('hov', o.key === cheapest.key && 'over')}>
                  <td>
                    {o.key}. {o.name}
                  </td>
                  <td className="left muted">{o.location}</td>
                  <Num v={o.sizeSqM} f={count} />
                  <Num v={o.sizeSqFt} f={count} />
                  <Num v={o.annualRent} />
                  <Num v={o.monthlyRent} />
                  <Num v={o.monthlyRatePerSqFt} f={(n) => n.toFixed(2)} />
                  <Num v={o.commission} />
                  <Num v={o.effectiveRatePerSqFt} f={(n) => n.toFixed(2)} />
                  <td className="left remark">{o.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
          Lowest effective rate is option {cheapest.key} at AED {cheapest.effectiveRatePerSqFt.toFixed(2)} per sq ft per month. Rate alone does not decide: the{' '}
          <Link to="/capacity" className="vlink">
            space projection
          </Link>{' '}
          and the overflow charge on this page are the other two inputs.
        </p>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
