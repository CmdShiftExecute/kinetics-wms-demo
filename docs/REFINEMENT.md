# Central Store refinement

## Design and scope

This is a boardroom reading pass on the existing Swiss industrial interface. The palette, Archivo Black/JetBrains Mono pairing, chart grammar, line entrances, row hover and detailed reports remain the foundation.

Three compositions were considered: five equal headlines with lighter copy; a single dominant stock figure with a side panel; and two leading measures with three supporting measures. The third was chosen because warehouse value and capacity are distinct first questions, while cost, ageing and replenishment still need immediate visibility. Management attention is ordered as current replenishment review, local allocation pressure and long-held value. This is a presentation judgment, not a computed severity score or a claim of certain stockout or recoverable savings.

## Before/after analytical map

| Original answer | Retained location and semantics |
|---|---|
| Value on the racks | Leading AED 24.4m headline; `#value` retains exact AED 24,441,915, every vertical, shares, CBM, reorder counts and total. Free stock AED 18,131,313 and inbound AED 11,912,022 remain separate. Vertical links still open the calculator. |
| Fullness | Leading 69.1%, explicitly 3,415.97 / 4,942.08 CBM with 60-80% band. `#space` retains allocation bars/ring, overflow, rackable stock, Cooling over-allocation and Trading underuse. Capacity retains exact allocation, idle/overflow distinctions and month-end projection. |
| Daily cost | AED 861/day including AED 107 overflow. `#cost` retains annualised position, the separate monthly cost, five largest verticals and all-vertical total. `/cost` retains every vertical/group, base and overflow costs, physical vacancy, cost ring/stacked views and site options. |
| Ageing | 24.6% of stock value over 180 days; AED 6,014,903 remains in band values. Over-one-year value AED 2,092,287 and 8.6% remain prominent. `#aging` retains four value bands and 4.7x turnover; `/aging` retains the 15 slow groups, ABC policy, volume and turnover detail. |
| Replenishment | Ten at/below reorder is separate from the 17-group union of at/below reorder or non-null cover <=60 days. `#runout` retains all 17 rows and their group links, quantities, reorder, cover, projected runout, transit arrivals and status. `/replenishment` retains all 47 groups and the 10/9/28 status split. |
| Material-level evidence | All 47 `/g/:slug` pages remain, with their five sections, monthly stock switches, age profiles, reorder/safety/max/lead/demand fields and calculator links. Null cover continues to mean no forecast demand. |
| Commitments and receipts | `/inbound` keeps stock commitments plus free stock equalling current stock, and arrivals outside stock value. Expected arrivals and projection remain assumptions, not guarantees. |
| Calculator | `data/cbm.ts` unchanged. True-half 1.13 x 1 x 0.5 = 0.57 CBM; exact hundredths aggregation; drafts per vertical; store-wide edited totals; invalid-input retention and messages; current-vertical reset; query fallback; small raw-CBM breach warnings all retained. Only context selection gains explicit Open vertical activation. |
| Definitions and sources | Original `Section` definition disclosures, sticky definition rail, sources, stock date, data-as-of stamp and `/data-basis` retained. Overview explanatory prose is shortened without removing the detailed basis. |

Capacity idle is allocation minus all stock: 1,526.11 CBM. Cost's physical main-store vacancy is 1,704.80 CBM. Overflow is included in stock space demand but is physically outside the main store; these two idle quantities must not be substituted.

## Interface contract

- Parchment, Light and Dark use the finalized suite's semantic colors, including the inverted chart readout's adverse-text token. Preference restores in the document head before rendering; invalid or unavailable storage falls back to Parchment.
- Module and Theme are 44px circular icon-only triggers, with labels and current selection in the menus. Enter/Space activate; arrows and Home/End browse; Escape restores trigger focus; outside pointer and Tab dismiss.
- The sticky masthead measures its height. Anchors and definition rails use its offset, including narrow screens. The section picker requires Go and transfers focus to the heading. Router scrolling waits for incoming route content and masthead measurement, so direct hashes, Back and repeated Go remain reliable with lazy routes and asynchronous data.
- On narrow phones all eight report links remain reachable through horizontal scrolling. Theme/module menus remain inside the viewport.
- There is no shared storage or source dependency on sibling applications. Module destinations remain the three HTTPS suite ports, including the current module's staging destination.

## Verification plan and repeatable gates

1. `bun run check`: generation, independent reconciliation, byte stability, strict typecheck, lint, production build and all-theme contrast.
2. `bun scripts/interactions.ts --base <review-origin> --out <directory>`: original table, arithmetic, calculator hostile-input, sorting, chart switching/hover, malformed/missing data and motion gates. Numerical and negative-control assertions remain intact. Presentation assertions now check the compact masthead and scope vertical-link traversal to the actual table. Entry motion uses continuous compositor frames plus at least three visible intermediate headline states; serial screenshot capture could miss a complete short entrance. The static reduced-motion negative control remains.
3. `WMS_BASE=<review-origin> WMS_OUT=<directory> node scripts/refinement.mjs`: all 47 groups and eight reports in all three themes, 1440/1024/390/360px overview controls, report widths at 1024/360px, trigger geometry and hit tests, keyboard/touch activation, local storage fallback, direct anchors and Back, calculator explicit activation and opening spacing. Repeat with `WMS_BROWSER=firefox`.
4. Compare SHA-256 of all 51 public-data fixtures with the preserved original manifest, and verify original staging remains unchanged. Inspect actual full-page and first-screen screenshots.
5. Run the staged and tracked-tree scanners before delivery. A passing HTTP response alone is not visual evidence.

The new spacing assertion was added after visual inspection caught an overbroad offset substitution; it checks the entire report family. Screenshot timing and host load can affect animation sampling, so preserve failed logs and distinguish a probe failure from a reproduced product defect.

## Deployment and recovery boundary

This branch is a review preview only. Do not build in the main checkout: its dist is served directly on staging :927. No staging promotion, sibling change or shared service edit is part of this preview delivery.

Original source is commit `96c1651c5a9171970a236aeda49b0f10801a6133`. The task artifact directory retains the tracked-source archive, exact served-build archive, their hashes, all original fixture/build hashes and documentation backups. Restore source to a fresh worktree from that commit or extract the source archive to a new directory. For an authorized served-build rollback, verify the archived build digest first and replace only WMS's selected dist; this is a deployment action. The archived build's provenance is its recorded bytes, not a claim that it was freshly built from that commit. Never delete these backups without explicit authorization.
