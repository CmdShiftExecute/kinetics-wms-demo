# Halvard Central Store demo (kinetics-wms-demo)

## What this is

This is a zero-backend Warehouse Information System demo for a fictional engineering group, Halvard Engineering Group, Building Technologies Division: the Halvard Central Store. It is a static Vite and React application sitting on top of finished JSON tables. Nothing is computed in the browser except the CBM calculator, which applies the same rule the generator used. All data is synthetic, generated from one seed. No real company, person or figure appears anywhere in this repository. It is the sibling of the Kinetics MIS demo (port 926) and shares its design system, and it is live at https://node-ss.tail640a1e.ts.net:927/.

## Routes

| Route | Description |
|---|---|
| `/` | Overview: the five answers on one line first (on the racks, how full, cost per day, aging, running out), then one block per question. The run-out list holds every group at or under its reorder point plus every group projected to run out within 60 days. |
| `/capacity` | Space and capacity: utilisation by vertical against its allocation, and the four-month space projection. |
| `/aging` | Aging and turnover: stock value by age band per vertical, the fifteen slowest-moving material groups, turnover by vertical, and the ABC classification. |
| `/replenishment` | Replenishment: the rule for each measure, then every material group sorted by least cover first, with groups at or under their reorder point marked. |
| `/cost` | Cost: the month's cost split by vertical, storage cost by material group, and the four site options compared on one template. |
| `/calculator` | CBM calculator: edit a group's dimensions or quantity in the browser and watch the vertical and store totals move, with the change against the published figure shown live. |
| `/inbound` | Inbound and commitments: stock mapped to purchase orders against free stock by vertical, and every open in-transit arrival. |
| `/data-basis` | Data basis: sources, definitions, the precision policy, the assumptions, and the reconciliation result. |
| `/g/:slug` | One material group's page: its seventeen WIS fields, its CBM inputs, its age profile, its replenishment status, and twelve months of stock. |
| `*` | Not found. |

## Run it

1. `bun install` installs dependencies.
2. `bun run verticals` imports the ten verticals from the MIS demo's published index into `data/verticals.json`. This is a one-shot import, not a build-time dependency; re-run it only if the MIS roster changes.
3. `bun run data` runs the generator, `scripts/generate_demo_data.ts`, and writes `public/data/rollup.json`, `index.json` and one file per material group under `public/data/groups/`.
4. `bun run reconcile` re-reads the written files and asserts every cross-table equality, then writes `public/data/reconciliation.json`. This is the check shown on the Data basis page.
5. `bun run typecheck` runs the TypeScript compiler in strict mode with no emitted output.
6. `bun run lint` runs oxlint.
7. `bun run build` runs the typecheck and then the Vite production build.
8. `bun run preview` serves the built site at `127.0.0.1:4181`.
9. `bun run contrast` measures the WCAG contrast of every text and surface pair the stylesheet defines.
10. `bun run interactions --base <origin> [--insecure]` runs the interaction, keyboard, structure and resilience gate against a served build. `--insecure` skips certificate checks when the origin is self-signed.
11. `bun run screenshots` captures every route at desktop, laptop and phone widths.
12. `bun scripts/perf_probe.ts [--base <origin>] [--path <route>]` scrolls a page in a real Chromium and records frame timing. It is run directly, not through a package script.
13. `bun run check` chains `data`, `reconcile`, `typecheck`, `lint`, `build` and `contrast`, in that order.
14. `bash scripts/install_hooks.sh` once per clone. It points this clone's git hooks at `scripts/scan_staged.sh`, so the scan runs itself before every commit, on every commit message, and before every push.
15. `bash scripts/scan_staged.sh [--tree]` runs the scan by hand: with no argument it checks the staged diff, `--tree` checks every tracked file instead.

`bun x playwright install chromium` installs the Chromium build the interaction gate, the screenshot script and the performance probe all drive. Run it once before the first use of any of the three.

## Data schema

`data/schema.ts` is the one contract every screen reads from.

`Meta` carries the company name, division, system name, the stock position date and its label, a data-as-of timestamp and label, a revision tag, currency, the forecast window and its length in days, the four projection month labels, the seed and a generated-at timestamp. `Site` carries the store's floor area, net usable share, stacking height, rent, the derived capacity and daily rate, and the overflow store's own capacity, rate and CBM in use. `Group` is one material group, the row of the WIS SKU master: its dimensions, unit and total CBM, rackable flag, overflow CBM, price and stock value, daily storage cost, safety stock, max stock, lead time, demand and demand per day, reorder point, days of cover, stock-out date, status, age bands, average age, ABC class, value share, mapped-to-PO and free stock, any in-transit order, and twelve months of month-end stock. `VerticalRow` is the same shape rolled up to one of the ten verticals, plus its allocation, idle CBM, turnover and its own four-month projection. `Rollup` is the front-page data: `site`, `sources`, `definitions`, `precisionPolicy`, `assumptions`, `overview`, `verticals`, the `total` row, `projectionTotal`, `aging`, `replenishment`, `cost`, `inbound`, `calculator` and a `groups` summary list. `Reconciliation` is the shape `reconcile.ts` writes: a checked-at timestamp, the policy lines, and the list of assertions with each one's pass or fail state.

Files on disk: `public/data/rollup.json` (everything above except individual groups), `public/data/index.json` (one entry per vertical listing its groups and their file paths), `public/data/groups/<slug>.json` (one full `Group` plus the shared `meta` block, per material group), and `public/data/reconciliation.json` (written by the reconcile step).

Units: money is an integer in AED. CBM is cubic metres to two decimals. Percentages are plain numbers to one decimal, so 69.1 means 69.1 percent. Every timestamp is GST, Asia/Dubai, with a real plus-four-hours offset. None of them are UTC.

## The rules the generator encodes

Supplier codes, not names. The brand column carries a synthetic supplier code (Supplier HS-114 and so on) because an invented name can collide with a real company and a code cannot.

The CBM rule, `data/cbm.ts`, shared by the generator, the reconciliation script and the browser calculator, so all three compute the same figure from the same inputs. Unit CBM is length times breadth times height in metres, formed in whole cubic centimetres and rounded once to two decimals, so a true half (1.13 by 1.00 by 0.50 is 0.565) always rounds up to 0.57 and never down through a floating-point residue. Total CBM for a group is unit CBM times quantity, exact in hundredths. Every higher CBM figure is a sum of those two-decimal figures, carried in hundredths so no floating-point residue can creep in. Utilisation is stock CBM over capacity or allocation, to one decimal, from those sums.

The precision policy. Money is an integer in AED at the material-group level, rounded once: quantity times unit price for stock value, CBM times the daily rate for storage cost. Every vertical and store figure is a sum of those integers, so tables that show the same figure tie exactly. Percentages are one decimal from the sums, never from other percentages. Shares that must total 100.0, the ABC classes and the value shares, are allocated by largest remainder. Age bands, CBM by age band, and the month's cost allocations are integer splits by largest remainder, so each set sums exactly to its total.

Capacity and the daily rate. Net usable floor area (floor area times the net usable percent) times the stacking height gives the store's capacity in CBM. The daily storage rate is annual rent over 365 days over that capacity, to four decimals, so every group's storage cost derives from one rate.

Allocations. Each of the ten verticals is given a percentage share of the store's capacity; the shares sum to exactly 100 percent of capacity. A vertical's idle CBM is its allocation less the CBM it actually holds; a negative figure means the vertical is stocked over its allocation, and the generator deliberately leaves exactly one vertical in that state and one badly under it, so every page has something real to show.

Utilisation and the 60 to 80 band. Utilisation is CBM in stock over allocated CBM (or over store capacity, for the whole store), as a percentage to one decimal. The optimal band is 60 to 80 percent: below it, space is paid for and sitting empty; above it, picking and put-away slow down.

The overflow store. A third party rents space by the CBM per day, at a materially higher rate than the store's own. It holds only non-rackable items from a handful of groups across three verticals, and that CBM counts toward each vertical's own utilisation, because the stock exists whether or not it fits on site.

The reorder rule. Safety stock is ten to twenty-five days of forecast demand, set per group. Lead time is days from purchase order to receipt, per group, drawn from its vertical's supplier history. Demand per day is the forecast quantity for the stated window (July to December 2026, 184 days) divided by that window, to two decimals. The reorder point is safety stock plus lead time times demand per day, rounded up. Days of cover is quantity over demand per day, rounded down; dead stock carries no forecast demand at all, so it has no days of cover and no stock-out date, shows as healthy for ordering and as a slow mover for aging. Three statuses follow with no hand overrides: below reorder point (quantity at or under the reorder point, order now), within lead time (above the reorder point but days of cover within lead time plus 30 days, order this month), and healthy (neither).

Age bands and ABC. Stock value is split into four age bands, under 90 days, 90 to 180, 180 to 365, and over 365, by an integer split that sums exactly to the group's stock value; CBM by age band splits the group's CBM in the same proportion. Average age is value-weighted, using the band midpoints 45, 135, 270 and 540 days. ABC classification ranks every material group by stock value: class A is the first 70 percent of cumulative value, B the next 20, C the last 10, with the shares themselves summing to exactly 100.0.

The cost split for the month with idle capacity. For the stated month, rent charged to stock is a group's main-store CBM times the daily rate times the days in the month, rounded once per group; overflow CBM is charged at the overflow rate the same way. Handling splits into a fixed share (four storekeepers, split by CBM share across verticals) and a variable share (forecast movements in the month times a fixed rate per movement). Rent for capacity that is not charged to any group's stock is shown on its own "idle capacity" line, so the month's rent rows add up to the actual monthly rent rather than only to what is charged to stock. The table's CBM column counts main-store CBM only, so it adds to the store capacity; overflow CBM has its own column. Each row's share of the month total is allocated by largest remainder so the shares sum to exactly 100.0. A site option's annual rent is the sum of its parts, each an area at a rate, so a blended rate can be checked by hand; the agent commission is 5 percent of the rent on new space only.

The four-month projection, simulated day by day. Each group's balance falls by its demand per day and never below zero; material in transit lands on its expected date; an order for max stock less the balance is placed on the first day the balance is at or under the reorder point while nothing is on order, and lands one lead time in days later, in whatever month that day falls (a group already below on the stock date orders that day). An arrival lands on the floored balance, never against a shortfall. Month-end CBM is unit CBM times the balance in whole units. The reconciliation script re-implements this rule from the definition and replays it from the group files, so the published projection cannot drift from the stated rule.

The round-thousand guard and the other generator assertions. Before any file is written, the generator checks its own arithmetic in memory: the store's total stock value would read as a placeholder if it landed on an exact round thousand, so the generator throws and refuses to write output if it does, forcing a change to the seed rather than shipping a number that looks fake. Alongside that guard it asserts the store's stock value, capacity and overall utilisation fall in plausible ranges, that exactly one vertical sits over its allocation and the least used stocked vertical is well under its own (at or below 40 percent), that every group's age bands and its mapped-plus-free split sum to its stock value, that CBM figures tie to the CBM rule, and that the rent rows for the month add to the actual monthly rent. `scripts/reconcile.ts` then re-checks all of this independently against the written JSON files, not against the generator's own memory.

## Gates

`bun run reconcile` re-reads the written JSON files, independently of the generator's own in-memory checks, and asserts that every figure published in more than one place ties exactly, and that every derived figure follows its stated rule. This is the machine's own check, and its result renders on the Data basis page.

`bun run typecheck` runs the TypeScript compiler across the project in strict mode and fails on any type error.

`bun run lint` runs oxlint across the source.

`bun run contrast` reads the color tokens directly out of the stylesheet, so it cannot drift from it, and fails if any text pair falls below a 4.5 to 1 contrast ratio or any non-text mark falls below 3 to 1.

`bun run interactions` drives a real, served build with Playwright and checks structure, keyboard behaviour and resilience: document width at three viewport widths, the five overview questions in order, table sorting, the utilisation chart and its 60 to 80 band, a full keyboard traversal in reading order, the alignment gate on the capacity table, the projection chart's keyboard crosshair, the replenishment table's sticky column on a phone, the cost split footing to its total with its CBM column adding to capacity and its shares to 100.0, the CBM calculator's live recompute and its hostile-input handling (a negative length, a non-numeric entry, a value past the limit, an empty field, a three-decimal length, an exponent-form entry, a fractional quantity, each with a message the input points to for assistive technology), an unknown vertical in the address being corrected, reset, switching vertical, the material group page, every report route rendering its heading, an invalid route, missing group data, malformed rollup data, reduced motion, and zero console errors. The alignment gate carries a negative control: it removes a cell from a table in browser memory and confirms the gate reports the break, then confirms the gate passes again once the cell is restored, so a check that has never been seen to fail is not trusted blind. One chart check guards the draw-in itself: for every line Motion is drawing, the dash pattern the browser computed must be the one Motion wrote as an attribute, because a stylesheet rule on `stroke-dasharray` silently beats that attribute and leaves the line pre-drawn and solid; its negative control puts such a rule on the projection line and expects the detector to fire. Every chart also carries a view switch, so the gate additionally checks that each of the eleven switches offers its views, that each view's marks actually entered with a real box and full opacity (with a negative control), that a chosen view survives a reload, and that the cost ring's arcs sum to the whole circle.

`bun run screenshots` captures every route at desktop, laptop and phone widths with a real Chromium, waits for fonts to load and for animation to settle, and fails the run on any console error or on a document wider than its viewport.

`scripts/perf_probe.ts` scrolls a page for several seconds in a real Chromium and records frame interval timing: median, 95th percentile, maximum, and the count of intervals above 25 milliseconds. Its numbers are observer-dependent, so they are only meaningful when comparing before and after a change, on the same machine, against the same origin.

`scripts/scan_staged.sh` refuses a commit, a commit message or a push that carries a credential shape, an em or en dash, AI attribution, or any term listed in `scripts/forbidden_terms.txt` (matched whole word, case-insensitive). `scripts/install_hooks.sh` wires it into git as the pre-commit, commit-msg and pre-push hooks for the clone.

## Regenerating

To build a different but still internally coherent store, change `SEED` near the top of `scripts/generate_demo_data.ts` and rerun `bun run data`, then `bun run reconcile`. To change vertical allocations, target utilisation, lead times, material groups, dimensions or prices, edit the `VERTICALS` array in the same file, then regenerate the same way. To change which ten verticals the demo names, re-run `bun run verticals` against a different MIS index and regenerate.

If a figure on screen is wrong, the fix belongs in the generator or in `data/schema.ts`. It never belongs in a component. A component only sorts, filters, formats and, on the calculator page only, recomputes from `data/cbm.ts` what the generator has already computed.

## Stack

Vite 8, React 19, TypeScript in strict mode, Tailwind v4 through its Vite plugin, Motion, d3-scale, d3-shape and d3-array, React Router, and Bun as the runtime and package manager. Fonts are self-hosted through Fontsource: Archivo Black and JetBrains Mono.

## Deploying

The build output is a static `dist` folder; any static host that falls back to `index.html` for unknown paths works, since the app is a single-page application. On node-ss, `deploy/kinetics-wms-demo.nginx` is a tailnet-only HTTPS site on port 927 serving `dist/` directly, with no dynamic behaviour and no backend. `bash deploy/install-site.sh` installs or re-installs it: it copies the site file when it differs, tests the nginx configuration, reloads only on a passing test, and then proves port 927 answers with this build's own `index.html` without touching the sibling MIS demo on port 926. A rebuild alone needs no reload, since nginx serves the built files as static assets; re-run the installer only after a change to the nginx site file itself.
