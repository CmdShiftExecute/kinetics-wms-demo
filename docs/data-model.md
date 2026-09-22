# Data model

Every screen in this application reads from one contract, `data/schema.ts`, and one generator, `scripts/generate_demo_data.ts`, run from a single fixed seed (`20260912`).

## Types

- **Meta.** Company name, division, system name, the stock position date and its label, a data-as-of timestamp and label, a revision tag, currency, the forecast window and its length in days, the four projection month labels, the seed, and a generated-at stamp. The generated-at stamp is fixed to the same recorded instant as the data-as-of label rather than the clock time of any given run, which is what makes the published output byte-stable.
- **Site.** The store's floor area, net usable share, stacking height, rent, the derived capacity and daily rate, and the overflow store's own capacity, rate and CBM in use.
- **Group.** One material group, the row of the WMS SKU master: dimensions, unit and total CBM, rackable flag, overflow CBM, price and stock value, daily storage cost, safety stock, max stock, lead time, demand and demand per day, reorder point, days of cover, stock-out date, status, age bands, average age, ABC class, value share, mapped-to-purchase-order and free stock, any in-transit order, and twelve months of month-end stock.
- **VerticalRow.** The same shape rolled up to one vertical, plus its allocation, idle CBM, turnover, and its own four-month projection.
- **Rollup.** The front-page data: site, sources, definitions, the precision policy, assumptions, overview, verticals, the total row, the projection total, aging, replenishment, cost, inbound, the calculator payload, and a groups summary list.
- **Reconciliation.** The shape `scripts/reconcile.ts` writes: a checked-at timestamp, the policy lines, and the full list of assertions with each one's pass or fail state.

## Files on disk

- `public/data/rollup.json`, everything above except individual groups.
- `public/data/index.json`, one entry per vertical listing its groups and their file paths.
- `public/data/groups/<slug>.json`, one full group plus the shared meta block, per material group.
- `public/data/reconciliation.json`, written by the reconcile step.

## Units

Money is an integer in AED. CBM is cubic metres to two decimals. Percentages are plain numbers to one decimal, so 69.1 means 69.1 percent. Every timestamp carries a real, fixed UTC offset rather than the clock time of the run, so the published files never change from one regeneration to the next.

## The precision policy

Money is an integer at the material-group level, rounded once: quantity times unit price for stock value, CBM times the daily rate for storage cost. Every vertical and store figure is a sum of those integers, so any two tables showing the same figure tie exactly. Percentages are one decimal, derived from the summed totals rather than from other percentages. Any set of shares that must total 100.0, the ABC classes, the value shares, the age bands and the month's cost allocation, is assigned by largest remainder so it always does.

CBM follows one shared rule, `data/cbm.ts`, used by the generator, the reconciliation script and the browser calculator alike. Unit CBM is length times breadth times height in metres, formed in whole cubic centimetres and rounded once to two decimals, so a true half always rounds up and never drifts down through a floating-point residue. Total CBM for a group is unit CBM times quantity, exact in hundredths, and every higher CBM figure is a sum of those hundredths.

## The rules the generator encodes

**Capacity and rate.** Net usable floor area times stacking height gives the store's capacity in CBM. The daily storage rate is annual rent over 365 days over that capacity, to four decimals, so every group's storage cost derives from one rate.

**Allocations.** Each vertical holds a fixed percentage share of the store's capacity, summing to exactly 100 percent. A vertical's idle CBM is its allocation minus what it actually holds; the generator deliberately leaves one vertical over its allocation and one well under it, so every page has something real to show.

**Reorder rule.** Safety stock is ten to twenty-five days of forecast demand, set per group. Lead time is drawn from that group's vertical's supplier history. Demand per day is forecast quantity for the stated window divided by the window's length, to two decimals. The reorder point is safety stock plus lead time times demand per day, rounded up. Days of cover is quantity over demand per day, rounded down; a group with no forecast demand has no days of cover and no stock-out date at all.

**Age bands and ABC.** Stock value splits into four age bands by an integer split that sums exactly to the group's stock value, with CBM by age band following the same proportion. Average age is value-weighted using the band midpoints. ABC classification ranks every group by stock value: class A is the first 70 percent of cumulative value, B the next 20, C the last 10.

**The month's cost split.** Rent charged to stock is each group's CBM times the applicable daily rate times the days in the month, rounded once per group. Rent for capacity charged to no group's stock at all is shown on its own idle-capacity line, so the month's rent rows always add to the actual monthly rent.

**The four-month projection.** Simulated day by day: each group's balance falls by demand per day and never below zero; an order is placed the first day a group is at or under its reorder point with nothing already on order, and lands one lead time later, in whichever month that falls.

**The round-thousand guard.** Before any file is written, the generator checks its own arithmetic in memory and refuses to write output if the store's total stock value lands on an exact round thousand, since a number that looks that clean reads as a placeholder rather than a real figure. Alongside that guard it asserts the store's stock value, capacity and overall utilisation fall in plausible ranges, that exactly one vertical sits over its allocation, that every group's age bands and its mapped-plus-free split sum to its stock value, and that CBM figures tie to the CBM rule.

## See also

- [Quality gates](quality-gates.md), for how `scripts/reconcile.ts` independently re-checks every rule above against the written files.
- [Data basis](08-data-basis.md), the page that renders the reconciliation result and the definitions this contract publishes.
- [README](../README.md)
