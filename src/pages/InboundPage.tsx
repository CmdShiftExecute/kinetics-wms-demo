import { Link } from 'react-router';
import type { Rollup } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { count, cx, pct } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Num } from '../components/Num';
import { Strip } from '../components/Strip';
import { Footer } from '../components/Footer';
import { PageError, PageLoading } from '../components/PageState';

/** Inbound and commitments: stock mapped to purchase orders versus free stock, and material in transit with its expected arrival, per vertical. Kept small. */
export default function InboundPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;
  const { meta, inbound, total, definitions, sources } = data;

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <div className="page-head">
        <div>
          <h1 className="display page-title">Inbound and commitments</h1>
          <p className="page-sub">What is already promised to a customer order, what is free, and what is on the water</p>
        </div>
        <p className="page-basis">
          Whole AED at cost
          <br />
          Arrivals from supplier confirmations
        </p>
      </div>
      <Strip
        cols={4}
        items={[
          { label: 'Mapped to purchase orders', value: total.mappedToPo, sub: `${pct((total.mappedToPo / total.stockValue) * 100, 0)} of stock value` },
          { label: 'Free stock', value: total.freeStock, sub: `${pct((total.freeStock / total.stockValue) * 100, 0)} of stock value` },
          { label: 'In transit', value: total.inTransitValue, sub: 'not counted in stock' },
          { label: 'Arrivals due', value: inbound.items.length, f: count, sub: `${count(total.inTransitQuantity)} units` },
        ]}
      />

      <Section id="commitments" title="Commitments by vertical" note="Mapped plus free equals stock value on every row." source={sources['inbound']} asOf={meta.dataAsOfLabel} defs={['mapped', 'inTransit']} definitions={definitions}>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Vertical</th>
                <th scope="col">Stock value</th>
                <th scope="col">Mapped to PO</th>
                <th scope="col">Free stock</th>
                <th scope="col">Free share</th>
                <th scope="col">In transit</th>
                <th scope="col">Units</th>
                <th scope="col">Next arrival</th>
              </tr>
            </thead>
            <tbody>
              {inbound.rows
                .filter((r) => r.stockValue > 0 || r.inTransitValue > 0)
                .map((r) => (
                  <tr key={r.slug} className="hov">
                    <td>{r.name}</td>
                    <Num v={r.stockValue} />
                    <Num v={r.mappedToPo} />
                    <Num v={r.freeStock} />
                    <Num v={r.stockValue === 0 ? 0 : (r.freeStock / r.stockValue) * 100} f={(n) => pct(n, 0)} />
                    <Num v={r.inTransitValue} />
                    <Num v={r.inTransitQuantity} f={count} />
                    <td className={cx('num nowrap', !r.nextArrival && 'muted')}>{r.nextArrival ?? 'nothing on order'}</td>
                  </tr>
                ))}
              <tr className="total">
                <td>{inbound.total.name}</td>
                <Num v={inbound.total.stockValue} />
                <Num v={inbound.total.mappedToPo} />
                <Num v={inbound.total.freeStock} />
                <Num v={(inbound.total.freeStock / inbound.total.stockValue) * 100} f={(n) => pct(n, 0)} />
                <Num v={inbound.total.inTransitValue} />
                <Num v={inbound.total.inTransitQuantity} f={count} />
                <td className="num" />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="transit" title="In transit" note="Every open arrival, soonest first. Value at the group's unit price." source={sources['inbound']} asOf={meta.dataAsOfLabel}>
        <div className="scroll-x">
          <table className="mis compact">
            <thead>
              <tr>
                <th scope="col">Material group</th>
                <th scope="col" className="left">
                  Vertical
                </th>
                <th scope="col">Units</th>
                <th scope="col">Value</th>
                <th scope="col">Expected arrival</th>
              </tr>
            </thead>
            <tbody>
              {inbound.items.map((i) => (
                <tr key={i.slug} className="hov">
                  <td>
                    <Link to={`/g/${i.slug}`} className="vlink press">
                      {i.name}
                    </Link>
                  </td>
                  <td className="left muted">{i.verticalName}</td>
                  <Num v={i.quantity} f={count} />
                  <Num v={i.value} />
                  <td className="num nowrap">{i.expectedArrivalLabel}</td>
                </tr>
              ))}
              <tr className="total">
                <td>All arrivals</td>
                <td className="left" />
                <Num v={total.inTransitQuantity} f={count} />
                <Num v={total.inTransitValue} />
                <td className="num" />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
