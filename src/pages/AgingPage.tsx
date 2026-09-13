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
        <AgeChart id="age-chart" rows={verts.map((v) => ({ slug: v.slug, name: v.name, age: v.age, total: v.stockValue }))} />
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
