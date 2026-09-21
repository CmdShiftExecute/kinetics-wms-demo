# Quality gates

Every gate is a real command against real output, chained by `bun run check` so a broken build cannot reach a commit.

## `bun run reconcile`

Re-reads the published JSON files, independent of the generator's own in-memory checks, and asserts that every figure published in more than one place ties exactly and that every derived figure follows its stated rule. This is the machine's own check, and its result renders in full on the [data basis page](08-data-basis.md). 2,493 of 2,493 assertions pass.

## `bun run stable`

The byte-stability gate. Hashes every file under `public/data`, regenerates the data and the reconciliation, hashes again, and fails if a single file differs, is added or is removed. It holds because no published file carries the clock time of the run; the generated-at and checked-at stamps are both set from one fixed instant, the same instant every page already shows as the data's as-of time. It runs inside `bun run check` immediately after reconcile, so a check before a commit never leaves the tree dirty and a diff under `public/data` is always a real change. 51 published files are confirmed identical across two runs.

## `bun run typecheck`

Runs the TypeScript compiler across the project in strict mode and fails on any type error.

## `bun run lint`

Runs oxlint across the source.

## `bun run motion`

Guards the chart draw-in itself. For every line a chart draws, the dash pattern the browser actually computed must be the one the animation library wrote as an SVG attribute, because a stylesheet rule on the same property can silently beat the attribute and leave a line pre-drawn and solid instead of animating in. Its negative control puts such a rule on a chart line deliberately and confirms the detector fires.

## `bun run contrast`

Reads the color tokens directly out of the stylesheet, so it cannot drift from what actually ships, and fails the build if any text pair falls under a 4.5 to 1 contrast ratio or any non-text mark falls under 3 to 1.

## `bun run interactions`

Drives a real, served build with a real browser automation tool and checks structure, keyboard behaviour and resilience: document width at three viewport widths, the overview's five headline answers and their supporting sections, table sorting, the utilisation chart and its optimal band, a full keyboard traversal in reading order, the capacity table's alignment gate, the projection chart's keyboard crosshair, the replenishment table's sticky column on a phone, the cost split footing to its total, the CBM calculator's live recompute and its full hostile-input handling, an unknown vertical in the address being corrected, the reset button, switching between verticals, the material group page, every report route rendering its own heading, an invalid route, missing group data, malformed data, reduced motion, and zero console errors on every route. The alignment gate carries its own negative control: it removes a cell from a table in browser memory, confirms the gate reports the break, then confirms the gate passes again once the cell is restored, so a check that has never been seen to fail is never trusted blind. Every chart with a view switch is also checked for the switch itself, that each view's marks actually entered with a real box and full opacity, and that a chosen view survives a reload. 140 of 140 checks pass against the live origin.

## `bun run screenshots`

Captures every route at desktop, laptop and phone widths with a real browser, waits for fonts to load and animation to settle, and fails the run on any console error or on a document wider than its own viewport.

## `bun run check`

Chains `data`, `reconcile`, `stable`, `typecheck`, `lint`, `motion`, `build` and `contrast`, in that order, so nothing downstream ever runs against data or code that has already failed an earlier gate.

## `scripts/scan_staged.sh`

Refuses a commit, a commit message or a push that carries a credential shape, an em or en dash, AI attribution, or any term listed in `scripts/forbidden_terms.txt`, matched whole word and case-insensitive. `scripts/install_hooks.sh` wires it into git as the pre-commit, commit-msg and pre-push hook for a clone.

## See also

- [Data model](data-model.md), for the precision policy these gates enforce.
- [README](../README.md)
