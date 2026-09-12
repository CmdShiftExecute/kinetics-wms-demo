import type { Reconciliation, Rollup } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateReconciliation, validateRollup } from '../lib/validate';
import { aed, cbm, count, cx } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Footer } from '../components/Footer';
import { PageError, PageLoading } from '../components/PageState';

/** Reporting basis, the store parameters, the reconciliation result, the precision policy, definitions, sources and the synthetic assumptions. */
export default function DataBasis() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const rec = useJson<Reconciliation>('reconciliation.json', validateReconciliation);
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading rows={12} />;
  const { meta, site, definitions, sources, precisionPolicy, assumptions } = data;
  const failed = rec.data ? rec.data.assertions.filter((a) => !a.pass) : [];
  const shown = rec.data ? [...failed, ...rec.data.assertions.filter((a) => a.pass)] : [];
  const fmt = (n: number) => (Number.isInteger(n) ? aed(n) : String(n));

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <div className="page-head">
        <div>
          <h1 className="display page-title">Data basis</h1>
          <p className="page-sub">Where every figure comes from, what it means, and the machine's own check that the tables agree</p>
        </div>
        <p className="page-basis">
          Data as of {meta.dataAsOfLabel}
          <br />
          Generated {meta.generatedAt.replace('T', ' ').slice(0, 16)} GST, seed {meta.seed}
        </p>
      </div>

      <Section id="reporting-basis" title="Reporting basis">
        <dl className="basis-list">
          <div>
            <dt>Company</dt>
            <dd>
              {meta.company}, {meta.division}. A fictional group; all data is synthetic.
            </dd>
          </div>
          <div>
            <dt>Stock position</dt>
            <dd>
              Month-end count at {meta.stockDateLabel}. Forecast demand for {meta.forecastWindow} ({meta.forecastDays} days). Space projection for {meta.projectionMonths[0]} to {meta.projectionMonths[meta.projectionMonths.length - 1]}.
            </dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd>Money in whole {meta.currency} at cost. Space in CBM (cubic metres) to two decimals. Quantities in units.</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>Every timestamp is GST (Asia/Dubai). Data as of {meta.dataAsOfLabel}, revision {meta.revision}.</dd>
          </div>
        </dl>
      </Section>

      <Section id="store" title="Store parameters" note="The inputs every space and cost figure derives from. Chosen for the demonstration; stated so nothing is mistaken for a survey.">
        <dl className="basis-list">
          <div>
            <dt>Store</dt>
            <dd>{site.name}</dd>
          </div>
          <div>
            <dt>Floor area</dt>
            <dd>{count(site.floorAreaSqFt)} sq ft</dd>
          </div>
          <div>
            <dt>Net usable</dt>
            <dd>
              {site.netUsablePct} percent after aisles, docks and offices: {count(site.netUsableSqFt)} sq ft, {cbm(site.netUsableM2)} m2
            </dd>
          </div>
          <div>
            <dt>Stacking height</dt>
            <dd>{site.stackingHeightM} m usable</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{cbm(site.capacityCbm)} CBM (net usable m2 times stacking height)</dd>
          </div>
          <div>
            <dt>Rent</dt>
            <dd>
              AED {site.rentPerSqFtYear} per sq ft a year: AED {aed(site.annualRent)} a year, AED {aed(Math.round(site.annualRent / 12))} a month
            </dd>
          </div>
          <div>
            <dt>Daily rate</dt>
            <dd>AED {site.dailyRatePerCbm} per CBM per day (rent over 365 over capacity)</dd>
          </div>
          <div>
            <dt>Overflow store</dt>
            <dd>
              {site.overflow.name}: {cbm(site.overflow.capacityCbm)} CBM rented at AED {site.overflow.dailyRatePerCbm} per CBM per day, {cbm(site.overflow.usedCbm)} CBM in use
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="reconciliation" title="Reconciliation" note="scripts/reconcile.ts re-reads the published JSON files and asserts that every independently shown figure ties to every other, and that every derived figure follows its stated rule. Failures are listed first.">
        {rec.error && <p className="bad">The reconciliation file could not be loaded: {rec.error}</p>}
        {rec.data && (
          <>
            <p>
              <span className={cx('status', rec.data.failed === 0 ? 'pass' : 'fail')}>{rec.data.failed === 0 ? 'All pass' : `${rec.data.failed} failed`}</span> {count(rec.data.passed)} of {count(rec.data.assertions.length)} assertions pass. Checked {rec.data.checkedAt.replace('T', ' ').slice(0, 16)} GST.
            </p>
            <details className="values" open={failed.length > 0}>
              <summary>Every assertion, with both sides</summary>
              <div className="scroll-x">
                <table className="mis compact" style={{ maxWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th scope="col">Result</th>
                      <th scope="col" className="left">
                        Statement
                      </th>
                      <th scope="col">Left</th>
                      <th scope="col">Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className={cx('status', a.pass ? 'pass' : 'fail')}>{a.pass ? 'pass' : 'fail'}</span>
                        </td>
                        <td className="left remark ink">{a.statement}</td>
                        <td className="num">{fmt(a.left)}</td>
                        <td className="num">{fmt(a.right)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Section>

      <Section id="precision" title="Precision and aggregation policy">
        <ol className="policy">
          {precisionPolicy.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </Section>

      <Section id="definitions" title="Definitions" note="Every measure shown on the site: what is measured and by which rule.">
        <dl className="basis-list">
          {Object.values(definitions).map((d) => (
            <div key={d.key}>
              <dt>{d.term}</dt>
              <dd>{d.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="sources" title="Sources" note="The table each report reads from. All are generated by scripts/generate_demo_data.ts from one seed.">
        <dl className="basis-list">
          {Object.values(sources).map((s) => (
            <div key={s.key}>
              <dt>{s.key}</dt>
              <dd>{s.label}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="assumptions" title="Synthetic assumptions" note="What this demonstration assumes, so nothing is mistaken for a warehouse-system fact.">
        <ol className="policy">
          {assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
