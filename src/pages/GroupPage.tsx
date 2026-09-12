import { Link, useParams } from 'react-router';
import type { GroupFile } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateGroup } from '../lib/validate';
import { STATUS_LABEL, aed, cbm, count, cx, days, mult, pct, perDay } from '../lib/format';
import { Crumbs, Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { StockLine } from '../components/StockLine';
import { StatusTag } from '../components/StatusTag';
import { PageError, PageLoading } from '../components/PageState';
import { useRise } from '../components/Reveal';
import { motion } from 'motion/react';

/** One material group: its WIS fields, its CBM inputs, its age profile, its replenishment status and twelve months of stock. */
export default function GroupPage() {
  const { slug = '' } = useParams();
  const { data: g, error } = useJson<GroupFile>(`groups/${slug}.json`, validateGroup);
  const rise = useRise();
  if (error) return <PageError message={`No such material group "${slug}". ${error}`} back={{ to: '/replenishment', label: 'Back to the material groups' }} />;
  if (!g) return <PageLoading />;
  const meta = g.meta;
  const bands = [
    { label: 'Under 90 days', v: g.age.under90 },
    { label: '90 to 180 days', v: g.age.d90to180 },
    { label: '180 to 365 days', v: g.age.d180to365 },
    { label: 'Over a year', v: g.age.over365 },
  ];
  const turnover = g.stockValue === 0 ? 0 : Math.round(((g.demandH2 * g.unitPrice * 2) / g.stockValue) * 10) / 10;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <Crumbs items={[{ to: '/replenishment', label: 'Material groups' }, { label: g.name }]} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">{g.name}</h1>
          <p className="page-sub">
            {g.brand}, {g.verticalName}. Class {g.abc}, {STATUS_LABEL[g.status].toLowerCase()}
          </p>
        </div>
        <p className="page-basis">
          Whole AED, CBM to two decimals
          <br />
          Stock position {meta.stockDateLabel}
        </p>
      </motion.div>
      <Strip
        items={[
          { label: 'Quantity', value: g.quantity, f: count, sub: `${count(g.reorderPoint)} reorder point`, bad: g.status === 'below' },
          { label: 'Stock value', value: g.stockValue, sub: `AED ${aed(g.unitPrice)} a unit` },
          { label: 'Group CBM', value: g.totalCbm, f: cbm, sub: `${cbm(g.unitCbm)} a unit, ${g.rackable ? 'rackable' : 'floor stored'}` },
          { label: 'Storage cost per day', value: g.dailyStorageCost, sub: g.overflowCbm > 0 ? `${cbm(g.overflowCbm)} CBM at the overflow store` : 'all in the main store' },
          { label: 'Days of cover', value: g.daysOfCover ?? 0, f: () => days(g.daysOfCover), sub: g.stockOutDateLabel ? `runs out ${g.stockOutDateLabel}` : 'no forecast demand', bad: g.daysOfCover != null && g.daysOfCover <= g.leadTimeDays },
          { label: 'Average age', value: g.avgAgeDays, f: (n) => `${count(n)} d`, sub: `${pct(((g.age.d180to365 + g.age.over365) / g.stockValue) * 100, 0)} of value over 180 days`, bad: g.avgAgeDays > 365 },
        ]}
      />

      <div className="side">
        <Section id="wis" title="WIS fields" note="The seventeen columns of the SKU master for this group.">
          <dl className="basis-list">
            {(
              [
                ['SKU main group', g.name],
                ['Brand', g.brand],
                ['Current stock quantity', count(g.quantity)],
                ['Current stock value', aed(g.stockValue)],
                ['Vertical', g.verticalName],
                ['Total CBM', cbm(g.totalCbm)],
                ['Cost per CBM per day', `AED ${(g.dailyStorageCost / (g.totalCbm || 1)).toFixed(4)} blended`],
                ['Total daily storage cost', aed(g.dailyStorageCost)],
                ['Safety stock', count(g.safetyStock)],
                ['Max stock', count(g.maxStock)],
                ['Lead time', `${count(g.leadTimeDays)} days`],
                [`Demand forecast, ${meta.forecastWindow}`, `${count(g.demandH2)} units`],
                ['Demand forecast per day', `${perDay(g.demandPerDay)} units`],
                ['Average unit price', aed(g.unitPrice)],
                ['Unit CBM', cbm(g.unitCbm)],
                ['Reorder point', count(g.reorderPoint)],
                ['Space share of vertical allocation', pct(g.spaceSharePct)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <div>
          <Section id="cbm" title="CBM inputs" note="Per unit, in metres. Open the calculator to change them and see the vertical move.">
            <div className="scroll-x">
              <table className="mis compact">
                <thead>
                  <tr>
                    <th scope="col">Length</th>
                    <th scope="col">Breadth</th>
                    <th scope="col">Height</th>
                    <th scope="col">Unit CBM</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Group CBM</th>
                    <th scope="col">Rackable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="num">{g.lengthM.toFixed(2)}</td>
                    <Num v={g.breadthM} f={(n) => n.toFixed(2)} />
                    <Num v={g.heightM} f={(n) => n.toFixed(2)} />
                    <Num v={g.unitCbm} f={cbm} />
                    <Num v={g.quantity} f={count} />
                    <Num v={g.totalCbm} f={cbm} />
                    <td className="num">{g.rackable ? 'yes' : 'no'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Link to={`/calculator?v=${g.vertical}`} className="drill-link press">
              Open {g.verticalName} in the calculator
            </Link>
          </Section>

          <Section id="age" title="Age profile" note="Stock value by days since receipt. The bands sum to the stock value.">
            <div className="scroll-x">
              <table className="mis compact">
                <thead>
                  <tr>
                    <th scope="col">Band</th>
                    <th scope="col">Value</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.label} className="hov">
                      <td>{b.label}</td>
                      <Num v={b.v} bad={b.label === 'Over a year' && b.v > 0} />
                      <Num v={g.stockValue === 0 ? 0 : (b.v / g.stockValue) * 100} f={(n) => pct(n)} />
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Stock value</td>
                    <Num v={g.stockValue} />
                    <td className="num">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: 'var(--s-sm) 0 0' }}>
              Turnover {mult(turnover)} a year. Class {g.abc}, {g.valueSharePct.toFixed(1)} percent of store value.
            </p>
          </Section>
        </div>
      </div>

      <Section id="replenishment" title="Replenishment" note="Status derives from quantity, reorder point, days of cover and lead time by the rule on the replenishment page.">
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Stock</th>
                <th scope="col">Safety</th>
                <th scope="col">Max</th>
                <th scope="col">Lead time</th>
                <th scope="col">Demand per day</th>
                <th scope="col">Reorder point</th>
                <th scope="col">Cover</th>
                <th scope="col">Runs out</th>
                <th scope="col" className="left">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className={cx(g.status === 'below' && 'over')}>
                <td className={cx('num', g.status === 'below' && 'bad')}>{count(g.quantity)}</td>
                <Num v={g.safetyStock} f={count} />
                <Num v={g.maxStock} f={count} />
                <Num v={g.leadTimeDays} f={(n) => `${count(n)} d`} />
                <Num v={g.demandPerDay} f={perDay} />
                <Num v={g.reorderPoint} f={count} />
                <td className={cx('num', g.daysOfCover != null && g.daysOfCover <= g.leadTimeDays && 'bad')}>{days(g.daysOfCover)}</td>
                <td className="num nowrap">{g.stockOutDateLabel ?? 'no forecast'}</td>
                <td className="left st">
                  <StatusTag s={g.status} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="scroll-x" style={{ marginTop: 'var(--s-lg)' }}>
          <table className="mis compact" style={{ maxWidth: 720 }}>
            <thead>
              <tr>
                <th scope="col">Commitment</th>
                <th scope="col">Value</th>
                <th scope="col">Units</th>
                <th scope="col">Expected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Mapped to purchase orders</td>
                <Num v={g.mappedToPo} />
                <td className="num muted">in stock</td>
                <td className="num" />
              </tr>
              <tr>
                <td>Free stock</td>
                <Num v={g.freeStock} />
                <td className="num muted">in stock</td>
                <td className="num" />
              </tr>
              <tr className="total">
                <td>In transit, not in stock</td>
                <Num v={g.inTransit?.value ?? 0} />
                <Num v={g.inTransit?.quantity ?? 0} f={count} />
                <td className="num nowrap">{g.inTransit ? g.inTransit.expectedArrivalLabel : 'nothing on order'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="months" title="Twelve months of stock" note="Month-end quantity against the reorder point. Months at or under the reorder point are marked.">
        <StockLine id="g-line" points={g.monthly} reorderPoint={g.reorderPoint} safetyStock={g.safetyStock} subject={g.name} />
        <details className="values" id="g-values">
          <summary>Monthly values</summary>
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Units</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {g.monthly.map((p) => (
                <tr key={p.index}>
                  <td>{p.month}</td>
                  <Num v={p.quantity} f={count} bad={p.quantity <= g.reorderPoint} />
                  <Num v={p.value} />
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
