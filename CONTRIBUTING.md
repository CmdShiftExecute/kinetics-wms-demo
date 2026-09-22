# Contributing

## Run it locally

1. `bun install` installs dependencies.
2. `bun run verticals` imports the multi-vertical roster from the sibling MIS demo's published index. One-shot; re-run only if that roster changes.
3. `bun run data` runs the generator and writes the published JSON tables under `public/data/`.
4. `bun run check` runs the full gate chain: data, reconcile, stability, typecheck, lint, motion, build and contrast.
5. `bun run dev` starts the development server.

## Gates that must pass

- `bun run check` chains `data`, `reconcile`, `stable`, `typecheck`, `lint`, `motion`, `build` and `contrast`. All eight must exit clean before a change ships.
- `bun run interactions` drives a real served build with Playwright: sorting, chart view switches, a full keyboard traversal, hostile-input handling on the calculator, and zero console errors.

## Data is generated, never edited

Every figure the browser shows is read from JSON produced by `scripts/generate_demo_data.ts`. If a figure is wrong, the fix belongs in the generator (or in `data/schema.ts` if it is a contract issue), never in a component and never by hand-editing a file under `public/data/`. Run `bun run data` to regenerate, then `bun run reconcile` and `bun run stable` to prove the change.

## Style

No em dashes anywhere in prose; `bun run scan` refuses a commit that contains one. No AI attribution in commits, comments or documentation.

## Opening an issue or PR

Open an issue describing the problem or proposal first. For a PR, run `bun run check` and `bun run interactions` locally before pushing, and describe what changed and why in the description.
