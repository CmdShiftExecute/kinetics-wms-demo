/**
 * Copies the ten Halvard verticals (slug and name only) from the MIS demo's
 * published index into data/verticals.json, so this demo names the same
 * verticals as the MIS without anyone retyping them.
 *
 * Run:  bun scripts/import_verticals.ts [--from <path to the MIS public/data/index.json>]
 * Out:  data/verticals.json (committed; the generator reads it)
 *
 * This is a one-shot import, not a build-time dependency: the WMS repo stays
 * self-contained once the file is written. Re-run it only if the MIS roster changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const i = args.indexOf('--from');
const from = i >= 0 && args[i + 1] ? args[i + 1]! : '/home/sharmas0910/code/kinetics-mis-demo/public/data/index.json';

function gstStamp(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}+04:00`;
}

const raw = JSON.parse(readFileSync(from, 'utf8')) as unknown;
if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${from} is not a non-empty array`);
const verticals = raw.map((v) => {
  if (typeof v !== 'object' || v === null || typeof (v as { slug?: unknown }).slug !== 'string' || typeof (v as { name?: unknown }).name !== 'string') throw new Error('index entry without slug and name');
  const { slug, name } = v as { slug: string; name: string };
  return { slug, name };
});
const out = { source: 'kinetics-mis-demo public/data/index.json', importedAt: gstStamp(), verticals };
writeFileSync(join(here, '..', 'data', 'verticals.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${verticals.length} verticals: ${verticals.map((v) => v.name).join(', ')}`);
