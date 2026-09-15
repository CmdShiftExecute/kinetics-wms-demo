import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LIMITS, OPTIMAL_BAND, checkDim, checkQty, hundredths as H, r2, sumCbm, totalCbm, unitCbm, utilPct } from '../../data/cbm';
import type { CalculatorRow, CalculatorVertical, Rollup } from '../../data/schema';
import { useJson } from '../lib/data';
import { validateRollup } from '../lib/validate';
import { cbm, count, cx, pct, signedCbm } from '../lib/format';
import { Masthead } from '../components/Masthead';
import { Section } from '../components/Section';
import { Footer } from '../components/Footer';
import { PageError, PageLoading } from '../components/PageState';
import { useRise, useRowReveal } from '../components/Reveal';
import { motion } from 'motion/react';

interface Draft {
  l: string;
  b: string;
  h: string;
  q: string;
  rackable: boolean;
}
interface Valid {
  l: number;
  b: number;
  h: number;
  q: number;
}
type Field = 'l' | 'b' | 'h' | 'q';
const FIELD_LABEL: Record<Field, string> = { l: 'length', b: 'breadth', h: 'height', q: 'quantity' };

const draftOf = (r: CalculatorRow): Draft => ({ l: r.lengthM.toFixed(2), b: r.breadthM.toFixed(2), h: r.heightM.toFixed(2), q: String(r.quantity), rackable: r.rackable });
const validOf = (r: CalculatorRow): Valid => ({ l: r.lengthM, b: r.breadthM, h: r.heightM, q: r.quantity });

/** Browsing a native select never changes the working context until confirmed. */
function VerticalPicker({ verticals, selected, onConfirm }: { verticals: CalculatorVertical[]; selected: string; onConfirm: (slug: string) => void }) {
  const [choice, setChoice] = useState(selected);
  return <form className="vertical-picker" onSubmit={(event) => { event.preventDefault(); onConfirm(choice); }}>
    <label>Vertical
      <select id="calc-vertical" className="pick" value={choice} onChange={(event) => setChoice(event.target.value)}>
        {verticals.map(v => <option key={v.slug} value={v.slug}>{v.name} ({count(v.rows.length)} {v.rows.length === 1 ? 'group' : 'groups'})</option>)}
      </select>
    </label>
    <button type="submit" id="calc-open" className="btn press" disabled={choice === selected}>Open vertical</button>
  </form>;
}

/**
 * The CBM calculator. Pick a vertical; edit length, breadth, height, quantity
 * and the rackable flag of any material group in place. Unit CBM, group CBM,
 * the vertical's rackable, non-rackable and grand totals, its utilisation of
 * its allocation, and the store utilisation all recompute live from
 * data/cbm.ts, the same rule the generator used. Edits live in the browser
 * session only; Reset restores the published figures.
 */
export default function CalculatorPage() {
  const { data, error } = useJson<Rollup>('rollup.json', validateRollup);
  const [params, setParams] = useSearchParams();
  const wanted = params.get('v');
  const verticals = data?.calculator ?? [];
  const vertical: CalculatorVertical | undefined = verticals.find((v) => v.slug === wanted) ?? verticals.find((v) => v.rows.length > 0);
  /* an unknown ?v= falls back to the first stocked vertical; the address is corrected so the select and the URL never disagree */
  useEffect(() => {
    if (vertical && wanted !== vertical.slug) {
      const next = new URLSearchParams(params);
      next.set('v', vertical.slug);
      setParams(next, { replace: true });
    }
  }, [vertical, wanted, params, setParams]);
  /* Drafts are keyed by vertical so switching verticals keeps each one's edits for the session. */
  const [drafts, setDrafts] = useState<Record<string, Record<string, Draft>>>({});
  const [valids, setValids] = useState<Record<string, Record<string, Valid>>>({});

  const rows = useMemo(() => vertical?.rows ?? [], [vertical]);
  const draft = useMemo(() => Object.fromEntries(rows.map((r) => [r.slug, drafts[vertical?.slug ?? '']?.[r.slug] ?? draftOf(r)])), [rows, drafts, vertical?.slug]);
  const valid = useMemo(() => Object.fromEntries(rows.map((r) => [r.slug, valids[vertical?.slug ?? '']?.[r.slug] ?? validOf(r)])), [rows, valids, vertical?.slug]);

  const setField = useCallback(
    (slug: string, field: Field, raw: string) => {
      if (!vertical) return;
      const v = vertical.slug;
      setDrafts((d) => ({ ...d, [v]: { ...(d[v] ?? {}), [slug]: { ...(d[v]?.[slug] ?? draftOf(rows.find((r) => r.slug === slug)!)), [field]: raw } } }));
      const parsed = field === 'q' ? checkQty(raw) : checkDim(raw);
      if (parsed.value != null) {
        const value = parsed.value;
        setValids((s) => ({ ...s, [v]: { ...(s[v] ?? {}), [slug]: { ...(s[v]?.[slug] ?? validOf(rows.find((r) => r.slug === slug)!)), [field]: value } } }));
      }
    },
    [vertical, rows],
  );
  const setRackable = useCallback(
    (slug: string, rackable: boolean) => {
      if (!vertical) return;
      const v = vertical.slug;
      setDrafts((d) => ({ ...d, [v]: { ...(d[v] ?? {}), [slug]: { ...(d[v]?.[slug] ?? draftOf(rows.find((r) => r.slug === slug)!)), rackable } } }));
    },
    [vertical, rows],
  );
  const reset = useCallback(() => {
    if (!vertical) return;
    setDrafts((d) => {
      const n = { ...d };
      delete n[vertical.slug];
      return n;
    });
    setValids((s) => {
      const n = { ...s };
      delete n[vertical.slug];
      return n;
    });
  }, [vertical]);

  const rise = useRise();
  const rowReveal = useRowReveal();
  if (error) return <PageError message={error} />;
  if (!data || !vertical) return <PageLoading />;
  const { meta, site, total, definitions, sources } = data;

  /* live figures, every one from data/cbm.ts */
  const live = rows.map((r) => {
    const d = draft[r.slug]!;
    const v = valid[r.slug]!;
    const unit = unitCbm(v.l, v.b, v.h);
    const tot = totalCbm(unit, v.q);
    const errors: Partial<Record<Field, string>> = {};
    for (const f of ['l', 'b', 'h'] as const) {
      const e = checkDim(d[f]).error;
      if (e) errors[f] = e.replace('a length', `a ${FIELD_LABEL[f]}`);
    }
    const qe = checkQty(d.q).error;
    if (qe) errors.q = qe;
    const pub = draftOf(r);
    /* changed means any input differs from its published text, so Reset is offered even when the rounded CBM is unchanged */
    return { r, d, v, unit, tot, delta: r2(tot - r.totalCbm), errors, changed: d.l !== pub.l || d.b !== pub.b || d.h !== pub.h || d.q !== pub.q || d.rackable !== pub.rackable };
  });
  const liveTotal = sumCbm(live.map((x) => x.tot));
  const liveRack = sumCbm(live.filter((x) => x.d.rackable).map((x) => x.tot));
  const liveNonRack = r2(liveTotal - liveRack);
  const liveUtil = utilPct(liveTotal, vertical.allocatedCbm);
  /* the store total counts every vertical's retained edits, not only the one on screen */
  const liveOf = (v: CalculatorVertical): number => {
    if (v.slug === vertical.slug) return liveTotal;
    const vv = valids[v.slug];
    if (!vv) return v.totalCbm;
    return sumCbm(v.rows.map((r) => {
      const x = vv[r.slug];
      return x ? totalCbm(unitCbm(x.l, x.b, x.h), x.q) : r.totalCbm;
    }));
  };
  const storeLive = sumCbm(verticals.map(liveOf));
  const storeUtil = utilPct(storeLive, site.capacityCbm);
  const editedElsewhere = verticals.filter((v) => v.slug !== vertical.slug && valids[v.slug] && H(liveOf(v)) !== H(v.totalCbm)).map((v) => v.name);
  /* breaches are judged on exact hundredths, never on the rounded percentage */
  const over = r2(liveTotal - vertical.allocatedCbm);
  const storeOver = r2(storeLive - site.capacityCbm);
  const storeBreached = H(storeLive) > H(site.capacityCbm);
  const anyChanged = live.some((x) => x.changed);
  const anyError = live.some((x) => Object.keys(x.errors).length > 0);
  const deltaTotal = r2(liveTotal - vertical.totalCbm);

  return (
    <div className="wrap">
      <Masthead meta={meta} />
      <motion.div className="page-head" {...rise()}>
        <div>
          <h1 className="display page-title">CBM calculator</h1>
          <p className="page-sub">Change a dimension, a quantity or the rackable flag and watch the vertical and the store recompute</p>
        </div>
        <p className="page-basis">
          Metres to two decimals, whole units
          <br />
          Edits live in this browser session only
        </p>
      </motion.div>

      <div className="calc-head">
        <VerticalPicker key={vertical.slug} verticals={verticals} selected={vertical.slug} onConfirm={(slug) => {
          const next = new URLSearchParams(params);
          next.set('v', slug);
          setParams(next);
        }} />
        <button type="button" id="calc-reset" className="btn press" onClick={reset} disabled={!anyChanged && !anyError}>
          Reset to published figures
        </button>
        <span className="muted" style={{ fontSize: 11 }}>
          Published: {cbm(vertical.totalCbm)} CBM of {cbm(vertical.allocatedCbm)} allocated, {pct(utilPct(vertical.totalCbm, vertical.allocatedCbm))}
        </span>
      </div>

      {/* An entry beat so this page is not static on arrival. Deliberately NOT a count-up:
          these figures track the reader's own edits and must move the instant a field changes. */}
      <motion.dl className="strip calc-live" aria-label="Live totals" {...rise(0.1)} style={{ '--cols': 6 } as React.CSSProperties}>
        <div>
          <dt>Rackable CBM</dt>
          <dd className="big" id="calc-rack">
            {cbm(liveRack)}
          </dd>
          <dd className="sub">published {cbm(vertical.rackableCbm)}</dd>
        </div>
        <div>
          <dt>Non-rackable CBM</dt>
          <dd className="big" id="calc-nonrack">
            {cbm(liveNonRack)}
          </dd>
          <dd className="sub">published {cbm(vertical.nonRackableCbm)}</dd>
        </div>
        <div>
          <dt>Grand total CBM</dt>
          <dd className={cx('big', over > 0 && 'bad')} id="calc-total">
            {cbm(liveTotal)}
          </dd>
          <dd className="sub">
            {anyChanged ? `${signedCbm(deltaTotal)} against published` : `published ${cbm(vertical.totalCbm)}`}
          </dd>
        </div>
        <div>
          <dt>Allocated CBM</dt>
          <dd className="big">{cbm(vertical.allocatedCbm)}</dd>
          <dd className={cx('sub', over > 0 && 'bad')}>{over > 0 ? `over by ${cbm(over)}` : `${cbm(-over)} idle`}</dd>
        </div>
        <div>
          <dt>{vertical.name} utilisation</dt>
          <dd className={cx('big', liveUtil > 100 && 'bad')} id="calc-util">
            {pct(liveUtil)}
          </dd>
          <dd className="sub">of its allocation; published {pct(utilPct(vertical.totalCbm, vertical.allocatedCbm))}</dd>
        </div>
        <div>
          <dt>Store utilisation</dt>
          <dd className={cx('big', storeBreached && 'bad')} id="calc-store-util">
            {pct(storeUtil)}
          </dd>
          <dd className="sub">
            {cbm(storeLive)} of {cbm(site.capacityCbm)} CBM; published {pct(total.utilPct)}
            {editedElsewhere.length > 0 ? `; includes your edits to ${editedElsewhere.join(', ')}` : ''}
          </dd>
        </div>
      </motion.dl>

      <div className={cx('calc-note', (over > 0 || storeBreached) && 'over')} id="calc-verdict" role="status" aria-live="polite">
        {storeBreached ? (
          <p>
            <strong className="bad">The store is over capacity.</strong> {cbm(storeLive)} CBM against {cbm(site.capacityCbm)}: {cbm(storeOver)} CBM has nowhere to go inside the building{over > 0 ? `, and ${vertical.name} alone is over its allocation by ${cbm(over)} CBM` : ''}.
          </p>
        ) : over > 0 ? (
          <p>
            <strong className="bad">{vertical.name} is over its allocation by {cbm(over)} CBM</strong> ({pct(liveUtil)}). That stock spills into other verticals' space or to the overflow store at AED {site.overflow.dailyRatePerCbm} per CBM per day, {(site.overflow.dailyRatePerCbm / site.dailyRatePerCbm).toFixed(1)} times the store rate.
          </p>
        ) : liveUtil > OPTIMAL_BAND.high ? (
          <p>
            {vertical.name} is at {pct(liveUtil)} of its allocation, above the {OPTIMAL_BAND.high} percent optimal ceiling: put-away and picking slow down before the space runs out.
          </p>
        ) : liveUtil < OPTIMAL_BAND.low ? (
          <p>
            {vertical.name} is at {pct(liveUtil)} of its allocation, below the {OPTIMAL_BAND.low} percent floor: {cbm(-over)} CBM is paid for and unused, AED {count(Math.round(-over * site.dailyRatePerCbm))} a day.
          </p>
        ) : (
          <p>
            {vertical.name} is at {pct(liveUtil)} of its allocation, inside the {OPTIMAL_BAND.low} to {OPTIMAL_BAND.high} percent band.
          </p>
        )}
        {anyError && <p className="bad">One or more fields are invalid. Totals use the last valid value of each field until it is corrected.</p>}
      </div>

      <Section id="rows" title={`${vertical.name}: material groups`} note="Length, breadth and height in metres per unit; quantity in units. Unit CBM and group CBM recompute as you type. Changed cells are bold; the change against the published CBM is shown beside each total." source={sources['groups']} asOf={meta.dataAsOfLabel} defs={['cbm', 'rackable', 'allocation', 'utilisation']} definitions={definitions}>
        {rows.length === 0 ? (
          <div className="empty">
            <strong>{vertical.name} holds nothing in the central store.</strong> Pick another vertical to edit, or use this one to see what a first stock line would cost in space: there is nothing to edit yet because the generator holds no groups for it.
          </div>
        ) : (
          <div className="scroll-x">
            <table className="mis calc sticky" id="calc-table">
              <thead>
                <tr>
                  <th scope="col">Material group</th>
                  <th scope="col">Length, m</th>
                  <th scope="col">Breadth, m</th>
                  <th scope="col">Height, m</th>
                  <th scope="col">Unit CBM</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Group CBM</th>
                  <th scope="col">Change</th>
                  <th scope="col">Rackable</th>
                </tr>
              </thead>
              <tbody>
                {live.map(({ r, d, unit, tot, delta, errors, changed }, i) => (
                  <motion.tr key={r.slug} className={cx('hov', changed && 'edited')} data-slug={r.slug} {...rowReveal(i)}>
                    <td>
                      <Link to={`/g/${r.slug}`} className="vlink press">
                        {r.name}
                      </Link>
                    </td>
                    {(['l', 'b', 'h'] as const).map((f) => (
                      <td key={f} className={cx('num', d[f] !== draftOf(r)[f] && 'changed')}>
                        <input type="text" inputMode="decimal" value={d[f]} aria-label={`${r.name}, ${FIELD_LABEL[f]} in metres`} aria-invalid={errors[f] ? 'true' : undefined} aria-describedby={errors[f] ? `err-${r.slug}-${f}` : undefined} onChange={(e) => setField(r.slug, f, e.target.value)} data-field={f} />
                        {errors[f] && (
                          <span className="field-err" id={`err-${r.slug}-${f}`}>
                            {errors[f]}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={cx('num', unit !== r.unitCbm && 'changed')} data-cell="unit">
                      {cbm(unit)}
                    </td>
                    <td className={cx('num qty', d.q !== String(r.quantity) && 'changed')}>
                      <input type="text" inputMode="numeric" value={d.q} aria-label={`${r.name}, quantity in units`} aria-invalid={errors.q ? 'true' : undefined} aria-describedby={errors.q ? `err-${r.slug}-q` : undefined} onChange={(e) => setField(r.slug, 'q', e.target.value)} data-field="q" />
                      {errors.q && (
                        <span className="field-err" id={`err-${r.slug}-q`}>
                          {errors.q}
                        </span>
                      )}
                    </td>
                    <td className={cx('num', changed && 'changed')} data-cell="total">
                      {cbm(tot)}
                    </td>
                    <td className="num" data-cell="delta">
                      {delta === 0 ? <span className="muted">unchanged</span> : <span className={cx('delta', delta > 0 && 'hz')} style={{ marginLeft: 0 }}>{signedCbm(delta)}</span>}
                    </td>
                    <td className="num">
                      <input type="checkbox" checked={d.rackable} aria-label={`${r.name}, rackable`} onChange={(e) => setRackable(r.slug, e.target.checked)} data-field="rackable" />
                    </td>
                  </motion.tr>
                ))}
                <tr className="total">
                  <td>{vertical.name}</td>
                  <td colSpan={3} className="left muted" style={{ fontWeight: 400 }}>
                    Limits: 0 to {LIMITS.dimMaxM} m per dimension, 0 to {count(LIMITS.qtyMax)} units
                  </td>
                  <td className="num" />
                  <td className="num">{count(live.reduce((a, x) => a + x.v.q, 0))}</td>
                  <td className="num" data-cell="sum">
                    {cbm(liveTotal)}
                  </td>
                  <td className="num">{anyChanged ? signedCbm(deltaTotal) : <span className="muted" style={{ fontWeight: 400 }}>unchanged</span>}</td>
                  <td className="num">{count(live.filter((x) => x.d.rackable).length)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Footer meta={meta} />
    </div>
  );
}
