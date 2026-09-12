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
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal } from '../components/Reveal';

type GroupCost = GroupSummary;
type GKey = 'name' | 'verticalName' | 'totalCbm' | 'dailyStorageCost' | 'stockValue';
const getG = (r: GroupCost, key: GKey) => r[key];

/** Cost: the daily rate derived from the site, storage cost by vertical and by group, the month's cost split, and the site-options decision table. */
export default function CostPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const groups: GroupCost[] = data?.groups ?? [];
  const { sorted, state, toggle } = useSort<GroupCost, GKey>(groups, useCallback((r: GroupCost, key: GKey) => getG(r, key), []), { key: 'dailyStorageCost', dir: 'desc' });
  const rowReveal = useRowReveal();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, site, total, definitions, sources, cost } = data;
  const sp = (key: GKey, natural: 'asc' | 'desc') => ({ active: state.key === key, dir: state.dir, natural, onSort: () => toggle(key, natural) });
  const monthlyRent = Math.round(site.annualRent / 12);
  const cheapest = [...cost.siteOptions].sort((a, b) => a.effectiveRatePerSqFt - b.effectiveRatePerSqFt)[0]!;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <div className="page-head">
        <div>
          <h1 className="display page-title">Cost</h1>
          <p className="page-sub">What a cubic metre costs per day, what each vertical's stock costs to hold, and the month's cost split</p>
        </div>
        <p className="page-basis">
          Whole AED
          <br />
          {cost.monthLabel}, {cost.daysInMonth} days
        </p>
      </div>
      <Strip
        items={[
          { label: 'Rate per CBM per day', value: site.dailyRatePerCbm, f: (n) => n.toFixed(4), sub: `rent ${aed(site.annualRent)} a year over ${cbm(site.capacityCbm)} CBM` },
          { label: 'Daily storage cost', value: total.dailyStorageCost, sub: 'of the stock held today' },
          { label: 'Monthly rent', value: monthlyRent, sub: `AED ${site.rentPerSqFtYear} per sq ft a year` },
          { label: `Rent charged to stock`, value: cost.total.rent - cost.rows.find((r) => r.slug === 'idle')!.rent, sub: `${cost.monthLabel.split(' ')[0]}; the rest is idle space` },
          { label: 'Overflow store', value: cost.total.overflow, sub: `AED ${site.overflow.dailyRatePerCbm} per CBM per day`, bad: cost.total.overflow > 0 },
          { label: `Month total`, value: cost.total.total, sub: 'rent, handling, utilities, overflow' },
        ]}
      />

      <Section id="split" title={`Cost split by vertical, ${cost.monthLabel}`} note="Rent charged to stock is main-store CBM times the daily rate times the days in the month; idle capacity carries the rest of the rent. Handling is fixed staff by CBM share plus AED 6 per forecast movement." source={sources['cost']} asOf={meta.dataAsOfLabel} defs={['dailyCost', 'rentCharged', 'handling', 'overflow']} definitions={definitions}>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">CBM</th>
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
                  <Num v={r.totalCbm} f={cbm} />
                  <Num v={r.dailyStorageCost} />
                  <Num v={r.rent} />
                  <Num v={r.handlingFixed} />
                  <Num v={r.handlingVariable} />
                  <Num v={r.utilities} />
                  <Num v={r.overflow} bad={r.overflow > 0} />
                  <Num v={r.total} />
                  <Num v={(r.total / cost.total.total) * 100} f={(n) => pct(n)} />
                </tr>
              ))}
              <tr className="total">
                <td>{cost.total.name}</td>
                <Num v={cost.total.totalCbm} f={cbm} />
                <Num v={cost.total.dailyStorageCost} />
                <Num v={cost.total.rent} />
                <Num v={cost.total.handlingFixed} />
                <Num v={cost.total.handlingVariable} />
                <Num v={cost.total.utilities} />
                <Num v={cost.total.overflow} bad={cost.total.overflow > 0} />
                <Num v={cost.total.total} />
                <td className="num">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
          Rent rows add to {aed(cost.total.rent)}, one twelfth of the annual rent. The idle line is what the empty {cbm(cost.rows.find((r) => r.slug === 'idle')!.totalCbm)} CBM costs for the month.
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
                  <Num v={r.totalCbm === 0 ? 0 : r.stockValue / r.totalCbm} />
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="options" title="Site options" note={`The current unit and three alternatives on one template. Effective rate spreads the one-off commission over a ${cost.siteOptions[0]!.termMonths}-month term.`} source={sources['siteOptions']} asOf={meta.dataAsOfLabel} defs={['effectiveRate']} definitions={definitions}>
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
