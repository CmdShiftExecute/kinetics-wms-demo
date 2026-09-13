import { useCallback } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import type { Rollup, SlowMover, VerticalRow } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { useSort } from '../lib/sort';
import { aed, cbm, count, cx, mult, pct } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { SortTh } from '../components/SortTh';
import { ChartSwitch } from '../components/ChartSwitch';
import { Donut } from '../components/Donut';
import { HBars } from '../components/HBars';
import type { BarRow } from '../components/HBars';
import { Quadrant } from '../components/Quadrant';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { AgeChart } from '../components/AgeChart';
import { PageError, PageLoading } from '../components/PageState';
import { useRowReveal, useRise } from '../components/Reveal';

type SKey = 'name' | 'verticalName' | 'stockValue' | 'valueOver180' | 'avgAgeDays' | 'turnover';
const getS = (r: SlowMover, key: SKey) => r[key];
type TKey = 'name' | 'stockValue' | 'annualIssueValue' | 'turnover';
const getT = (r: VerticalRow, key: TKey) => r[key];

/** Aging and turnover: value and CBM by age band per vertical, slow movers, turnover, and the ABC split with its storage rule. */
const BAND_LEGEND = [
  { cls: 'spot2' as const, label: 'Under 90 days' },
  { cls: 'spot' as const, label: '90 to 180 days' },
  { cls: 'ink' as const, label: '180 to 365 days' },
  { cls: 'hz' as const, label: 'Over a year' },
];

export default function AgingPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const slow = data?.aging.slowMovers ?? [];
  const verts = data?.verticals.filter((v) => v.groups > 0) ?? [];
  const s = useSort<SlowMover, SKey>(slow, useCallback((r: SlowMover, key: SKey) => getS(r, key), []), { key: 'valueOver180', dir: 'desc' });
  const t = useSort<VerticalRow, TKey>(verts, useCallback((r: VerticalRow, key: TKey) => getT(r, key), []), { key: 'turnover', dir: 'asc' });
  const rowReveal = useRowReveal();
  const rise = useRise();
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, total, overview: o, definitions, sources, aging } = data;
  const storeOver180Pct = ((total.age.d180to365 + total.age.over365) / total.stockValue) * 100;
  const bandBars: BarRow[] = verts
    .slice()
    .sort((a, b) => b.stockValue - a.stockValue)
    .map((v) => ({
      key: v.slug,
      name: v.name,
      segments: [
        { key: 'u90', value: v.age.under90, cls: 'spot2' as const },
        { key: 'd90', value: v.age.d90to180, cls: 'spot' as const },
        { key: 'd180', value: v.age.d180to365, cls: 'ink' as const },
        { key: 'o365', value: v.age.over365, cls: 'hz' as const },
      ],
      end: aed(v.stockValue),
      endDelta: `${pct((v.age.over365 / Math.max(1, v.stockValue)) * 100, 0)} over a year`,
      endBad: v.age.over365 / Math.max(1, v.stockValue) >= 0.1,
      readout: `${aed(v.stockValue)} AT COST, ${aed(v.age.over365)} OVER A YEAR, TURNOVER ${v.turnover.toFixed(1)}X`,
    }));
  const slowBars: BarRow[] = aging.slowMovers.map((r) => ({
    key: r.slug,
    name: r.name,
    segments: [
      { key: 'old', value: r.valueOver180, cls: 'hz' as const },
      { key: 'rest', value: Math.max(0, r.stockValue - r.valueOver180), cls: 'spot2' as const },
    ],
    end: aed(r.valueOver180),
    endDelta: pct(r.over180Pct, 0),
    endBad: r.over180Pct >= 50,
    readout: `${aed(r.valueOver180)} OVER 180 DAYS OF ${aed(r.stockValue)}, ${pct(r.over180Pct)}, AVERAGE AGE ${r.avgAgeDays} DAYS`,
  }));
  const sp = (key: SKey, natural: 'asc' | 'desc') => ({ active: s.state.key === key, dir: s.state.dir, natural, onSort: () => s.toggle(key, natural) });
  const tp = (key: TKey, natural: 'asc' | 'desc') => ({ active: t.state.key === key, dir: t.state.dir, natural, onSort: () => t.toggle(key, natural) });
  const over180 = total.age.d180to365 + total.age.over365;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">Aging and turnover</h1>
          <p className="page-sub">Days since receipt, by value and by CBM; the slowest groups; how fast each vertical turns its stock</p>
        </div>
        <p className="page-basis">
          Whole AED at cost
          <br />
          Bands from the stock date, {meta.stockDateLabel}
        </p>
      </motion.div>
      <Strip
        items={[
          { label: 'Stock value', value: total.stockValue },
          { label: 'Over 180 days', value: over180, sub: `${pct(o.agePct.d180to365 + o.agePct.over365)} of value`, bad: true },
          { label: 'Over a year', value: total.age.over365, sub: `${pct(o.agePct.over365)} of value`, bad: true },
          { label: 'CBM over a year', value: total.ageCbm.over365, f: cbm, sub: `${pct((total.ageCbm.over365 / total.totalCbm) * 100)} of space` },
          { label: 'Store turnover', value: total.turnover, f: mult, sub: 'annualised issues over stock' },
          { label: 'Class A groups', value: aging.abc[0]!.groups, f: count, sub: `${pct(aging.abc[0]!.sharePct)} of value` },
        ]}
      />

      <Section id="bands" title="Value by age band" note="Each vertical's stock value split by days since receipt, as a share of that vertical. The figure at the end of each bar is the share over a year." source={sources['verticals']} asOf={meta.dataAsOfLabel} defs={['ageBands', 'avgAge']} definitions={definitions}>
        <ChartSwitch
          id="bands-chart"
          views={[
            { key: 'stack', label: 'Age mix, each to 100%', icon: 'stack', render: () => <AgeChart id="age-chart" rows={verts.map((v) => ({ slug: v.slug, name: v.name, age: v.age, total: v.stockValue }))} /> },
            { key: 'bars', label: 'Value by age band', icon: 'bars', render: () => <HBars id="bands-bars" ariaLabel="Stock value by vertical split by days since receipt, largest first. Exact values are in the table below." format={aed} legend={BAND_LEGEND} rows={bandBars} /> },
            {
              key: 'ring',
              label: 'The store by age band',
              icon: 'donut',
              render: () => (
                <Donut
                  id="bands-donut"
                  format={aed}
                  centreLabel="Stock value"
                  ariaLabel="Store stock value split by days since receipt. Exact values are in the table below."
                  keepOrder
                  rows={[
                    { key: 'u90', name: 'Under 90 days', value: total.age.under90 },
                    { key: 'd90', name: '90 to 180 days', value: total.age.d90to180 },
                    { key: 'd180', name: '180 to 365 days', value: total.age.d180to365 },
                    { key: 'o365', name: 'Over a year', value: total.age.over365, bad: true },
                  ]}
                />
              ),
            },
          ]}
        />
        <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">Under 90 days</th>
                <th scope="col">90 to 180</th>
                <th scope="col">180 to 365</th>
                <th scope="col">Over 365</th>
                <th scope="col">Stock value</th>
                <th scope="col">CBM over 180 days</th>
                <th scope="col">CBM over 365</th>
              </tr>
            </thead>
            <tbody>
              {verts.map((v) => (
                <tr key={v.slug} className="hov">
                  <td>{v.name}</td>
                  <Num v={v.age.under90} />
                  <Num v={v.age.d90to180} />
                  <Num v={v.age.d180to365} />
                  <Num v={v.age.over365} bad={v.age.over365 > 0} />
                  <Num v={v.stockValue} />
                  <Num v={v.ageCbm.d180to365 + v.ageCbm.over365} f={cbm} />
                  <Num v={v.ageCbm.over365} f={cbm} bad={v.ageCbm.over365 > 0} />
                </tr>
              ))}
              <tr className="total">
                <td>{total.name}</td>
                <Num v={total.age.under90} />
                <Num v={total.age.d90to180} />
                <Num v={total.age.d180to365} />
                <Num v={total.age.over365} bad />
                <Num v={total.stockValue} />
                <Num v={total.ageCbm.d180to365 + total.ageCbm.over365} f={cbm} />
                <Num v={total.ageCbm.over365} f={cbm} bad />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="slow" title="Slow movers" note="The fifteen material groups with the most value older than 180 days. Average age is value-weighted." source={sources['groups']} asOf={meta.dataAsOfLabel} defs={['avgAge', 'turnover']} definitions={definitions}>
        <ChartSwitch
          id="slow-chart"
          views={[
            { key: 'bars', label: 'Value older than 180 days', icon: 'bars', render: () => <HBars id="slow-bars" ariaLabel="Stock value older than 180 days by material group, largest first, with the rest of each group's value beside it. Exact values are in the table below." format={aed} legend={[{ cls: 'hz', label: 'Older than 180 days' }, { cls: 'spot2', label: 'The rest of the group' }]} rows={slowBars} /> },
            {
              key: 'quadrant',
              label: 'Age against the share that is old',
              icon: 'quadrant',
              render: () => (
                <Quadrant
                  id="slow-quad"
                  ariaLabel="Share of value older than 180 days against average age by material group, bubble area is stock value. Exact values are in the table below."
                  rows={aging.slowMovers.map((r) => ({ key: r.slug, name: r.name, x: r.avgAgeDays, y: r.over180Pct, size: r.stockValue }))}
                  refX={180}
                  refY={storeOver180Pct}
                  refLabel="Store"
                  xLabel="Average age, days"
                  yLabel="Share over 180 days"
                  fx={(n) => `${Math.round(n)}d`}
                  fy={(n) => pct(n, 0)}
                  readout={(pt) => `${aed(aging.slowMovers.find((r) => r.slug === pt.key)!.stockValue)}, ${pct(pt.y)} OVER 180 DAYS, AVERAGE AGE ${Math.round(pt.x)} DAYS`}
                />
              ),
            },
          ]}
        />
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <SortTh label="Material group" {...sp('name', 'asc')} />
                <SortTh label="Vertical" {...sp('verticalName', 'asc')} className="left" />
                <SortTh label="Stock value" {...sp('stockValue', 'desc')} />
                <SortTh label="Over 180 days" {...sp('valueOver180', 'desc')} />
                <th scope="col">Share of group</th>
                <SortTh label="Average age" {...sp('avgAgeDays', 'desc')} />
                <SortTh label="Turnover" {...sp('turnover', 'asc')} />
              </tr>
            </thead>
            <tbody>
              {s.sorted.map((r, i) => (
                <motion.tr key={r.slug} className="hov" layout="position" {...rowReveal(i)}>
                  <td>
                    <Link to={`/g/${r.slug}`} className="vlink press">
                      {r.name}
                    </Link>
                  </td>
                  <td className="left muted">{r.verticalName}</td>
                  <Num v={r.stockValue} />
                  <Num v={r.valueOver180} bad />
                  <Num v={r.over180Pct} f={(n) => pct(n)} />
                  <Num v={r.avgAgeDays} f={(n) => `${count(n)} d`} bad={r.avgAgeDays > 365} />
                  <Num v={r.turnover} f={mult} bad={r.turnover < 1} />
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="side">
        <Section id="turnover" title="Turnover by vertical" note="Annualised issues at cost over stock value. Slowest first." source={sources['verticals']} asOf={meta.dataAsOfLabel} defs={['turnover']} definitions={definitions}>
          <div className="scroll-x">
            <table className="mis compact">
              <thead>
                <tr>
                  <SortTh label="Vertical" {...tp('name', 'asc')} />
                  <SortTh label="Stock value" {...tp('stockValue', 'desc')} />
                  <SortTh label="Annualised issues" {...tp('annualIssueValue', 'desc')} />
                  <SortTh label="Turnover" {...tp('turnover', 'asc')} />
                </tr>
              </thead>
              <tbody>
                {t.sorted.map((v) => (
                  <motion.tr key={v.slug} className="hov" layout="position">
                    <td>{v.name}</td>
                    <Num v={v.stockValue} />
                    <Num v={v.annualIssueValue} />
                    <Num v={v.turnover} f={mult} bad={v.turnover < 2} />
                  </motion.tr>
                ))}
                <tr className="total">
                  <td>{total.name}</td>
                  <Num v={total.stockValue} />
                  <Num v={total.annualIssueValue} />
                  <Num v={total.turnover} f={mult} />
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="abc" title="ABC classification" note="Groups ranked by stock value: A is the first 70 percent, B the next 20, C the last 10. Each class carries a storage rule." source={sources['groups']} asOf={meta.dataAsOfLabel} defs={['abc']} definitions={definitions}>
          <ChartSwitch
            id="abc-chart"
            views={[
              { key: 'ring', label: 'Value by class', icon: 'donut', render: () => <Donut id="abc-donut" format={aed} centreLabel="Stock value" ariaLabel="Store stock value by ABC class. Exact values are in the table below." keepOrder rows={aging.abc.map((r) => ({ key: r.cls, name: `Class ${r.cls}, ${r.groups} groups`, value: r.stockValue }))} /> },
              { key: 'bars', label: 'Class side by side', icon: 'bars', render: () => <HBars id="abc-bars" ariaLabel="Store stock value by ABC class. Exact values are in the table below." format={aed} legend={[{ cls: 'spot', label: 'Stock value' }]} rows={aging.abc.map((r) => ({ key: r.cls, name: `Class ${r.cls}`, segments: [{ key: 'v', value: r.stockValue, cls: 'spot' as const }], end: aed(r.stockValue), endDelta: pct(r.sharePct, 0), readout: `${aed(r.stockValue)}, ${pct(r.sharePct)} OF STORE VALUE, ${r.groups} GROUPS` }))} /> },
            ]}
          />
          <div className="scroll-x">
            <table className="mis compact">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Groups</th>
                  <th scope="col">Stock value</th>
                  <th scope="col">Share</th>
                  <th scope="col" className="left">
                    Storage rule
                  </th>
                </tr>
              </thead>
              <tbody>
                {aging.abc.map((r) => (
                  <tr key={r.cls} className="hov">
                    <td>{r.cls}</td>
                    <Num v={r.groups} f={count} />
                    <Num v={r.stockValue} />
                    <Num v={r.sharePct} f={(n) => pct(n)} />
                    <td className={cx('left remark ink')}>{r.rule}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>All</td>
                  <Num v={total.groups} f={count} />
                  <Num v={total.stockValue} />
                  <td className="num">100.0%</td>
                  <td className="left" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
            Class A holds {aed(aging.abc[0]!.stockValue)} in {count(aging.abc[0]!.groups)} groups: prime storage nearest dispatch, counted monthly.
          </p>
        </Section>
      </div>

      <Footer meta={meta} />
    </div>
  );
}
