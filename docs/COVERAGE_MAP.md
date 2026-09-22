# Reference WIS coverage map

This map records every schedule and field of a reference warehouse management pack and where each one lives in this demo. The reference is generically described: a management view workbook with an assumptions sheet, six SKU-master sheets on one seventeen-column template and a KPI summary sheet; a detailed CBM calculator workbook with a vertical sheet per vertical and its own assumptions sheet; a site-options comparison sheet; and a plan document naming five model areas. Reference sheet and field names are given generically here, never by the name of any real workbook. Every figure in this demo is synthetic, generated from one seed by `scripts/generate_demo_data.ts`; only the structure is borrowed.

Verification evidence refers to the gates in this repository: `bun run reconcile` (cross-table assertions, published on the Data basis page, 2493 of 2493 passing in the 15 September 2026 verification), `bun run interactions` (the Playwright gate, including the alignment negative control), `bun run screenshots` (every route at 1440, 1024 and 390 pixels), and the assertion id patterns from `scripts/reconcile.ts`.

Disposition codes: **Implemented** (present, same meaning); **Adapted** (present, with a stated change of unit, grain or scope); **Not carried** (deliberately excluded, with the reason).

## Management view workbook, assumptions sheet

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Assumptions sheet | Usable floor area, sq ft | Data basis, "Store parameters" | Overview "Space and allocation" links to Capacity | reconcile `site-net-sqft` | Implemented |
| Assumptions sheet | Net usable percent | Data basis, "Store parameters" | Same | reconcile `site-net-sqft` (derives net sq ft from this percent) | Implemented |
| Assumptions sheet | Net usable area, sq ft and m2 | Data basis, "Store parameters"; the capacity definition on every page that opens the definitions disclosure | Overview, Capacity, Cost | reconcile `site-net-m2` | Implemented |
| Assumptions sheet | Stacking height | Data basis, "Store parameters" | Same | reconcile `site-capacity` (net m2 times stacking height) | Implemented |
| Assumptions sheet | Total cubic capacity, m3 | Overview "Space and allocation", Capacity utilisation chart, Data basis | Overview to Capacity | reconcile `site-capacity`, `allocations-capacity`, `overview-capacity` | Implemented; the demo calls the unit CBM throughout rather than switching to m3 partway, since CBM already means cubic metres |
| Assumptions sheet | Daily storage cost per CBM, from rent | Overview "Storage cost", Data basis definition "Daily storage rate" | Overview to Cost | reconcile `site-rate`, `site-rent` | Implemented |

## Management view workbook, SKU-master sheets

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Header strip | Average unit price | Not shown as a standalone division figure | | | Not carried: no single division-wide average unit price is published; per-group unit price is shown on every material group page instead |
| Header strip | Total material groups | Overview strip, Data basis "47 groups" figure implied by the group index | Overview, Data basis | reconcile `repl-rows`, `<slug>-groups` per vertical | Implemented, as the sum of the per-vertical group counts rather than one printed total |
| Header strip | Total value | Overview "Stock by vertical" total row, Data basis | Overview to any vertical | reconcile `total-value`, `overview-value` | Implemented |
| Header strip | Current CBM | Overview "Space and allocation" total, Capacity utilisation chart | Overview to Capacity | reconcile `total-cbm`, `overview-cbm` | Implemented |
| Header strip | Space utilisation percent | Overview "Space and allocation", Capacity utilisation chart and table | Overview to Capacity | reconcile `total-util`, `overview-util`, per-vertical `<slug>-util` | Implemented |
| Header strip | Groups below reorder point | Overview "Replenishment watch", Replenishment counts strip | Overview to Replenishment | reconcile `total-below`, `overview-below`, `repl-below` | Implemented |
| Header strip | Total daily storage cost | Overview "Storage cost", Cost split total row | Overview to Cost | reconcile `total-daily`, `overview-daily` | Implemented |
| Per-SKU row | SKU main group | Material group page title; every table row naming a group | Replenishment, Aging, Cost, Inbound to the group page | reconcile `<slug>-value`, `<slug>-summary` | Implemented |
| Per-SKU row | Brand | Material group page "WIS fields" | Group page | reconcile (carried through from generation, not independently asserted since it has no downstream figure) | Implemented |
| Per-SKU row | Current stock quantity | Material group page strip and "WIS fields"; Replenishment table | Replenishment, Group page | reconcile `<slug>-rop`, `<slug>-cover` (both consume quantity) | Implemented |
| Per-SKU row | Current stock value | Material group page strip; Overview, Aging, Cost, Inbound tables | Any table row to the group page | reconcile `<slug>-value`, `<slug>-summary` | Implemented |
| Per-SKU row | Vertical | Material group page subtitle; every table's vertical column | Group page to the vertical's rows on any report | reconcile per-vertical `<slug>-value` sums the groups back up | Implemented |
| Per-SKU row | Total CBM | Material group page strip; Capacity, Cost, Calculator | Group page | reconcile `<slug>-total-cbm`, `<slug>-unit` | Implemented |
| Per-SKU row | Cost per CBM per day | Material group page "WIS fields", stated as the group daily cost across its CBM, part at the overflow rate where held there | Group page | reconcile `<slug>-daily` checks the published cost against the rule | Implemented |
| Per-SKU row | Total daily storage cost | Material group page strip and "WIS fields"; Cost, by-group table | Cost to the group page | reconcile `<slug>-daily`, `<slug>-summary-daily` | Implemented |
| Per-SKU row | Safety stock | Material group page "WIS fields" | Group page | reconcile `<slug>-rop` (reorder point consumes safety stock) | Implemented |
| Per-SKU row | Max stock | Material group page "WIS fields" | Group page | consumed by the four-month projection; no group-level reconcile id since it has no independent published total | Implemented |
| Per-SKU row | Lead time, days | Material group page "WIS fields"; Replenishment rule note | Group page, Replenishment | reconcile `<slug>-rop`, `<slug>-cover`, `<slug>-status` (all take lead time as an input) | Implemented |
| Per-SKU row | Demand forecast, the stated window | Material group page "WIS fields" | Group page | reconcile `<slug>-dpd` | Implemented |
| Per-SKU row | Demand forecast, days | Material group page "WIS fields" (forecast window length) | Group page, Data basis definition "Forecast demand" | reconcile `<slug>-dpd` divides by this figure | Implemented |
| Per-SKU row | Average unit price | Material group page "WIS fields" and strip | Group page | reconcile `<slug>-value` (quantity times unit price) | Implemented |
| Per-SKU row | Unit CBM | Material group page "WIS fields", CBM inputs block, Calculator | Group page, Calculator | reconcile `<slug>-unit`, `calc-<slug>-unit` | Implemented |
| Per-SKU row | Reorder point | Material group page strip and "WIS fields"; Replenishment table | Replenishment to Group page | reconcile `<slug>-rop`, `repl-rop-<slug>` | Implemented |
| Per-SKU row | Space utilisation percent, per group | Material group page "WIS fields" ("Space share of vertical allocation") | Group page | reconcile `<slug>-share` | Implemented |

## Management view workbook, KPI summary sheet

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Division totals | Total stock value, total CBM, overall utilisation, total daily cost, groups below reorder point | Overview strip and the five question blocks; Data basis "Store parameters" | Overview | reconcile `total-value`, `total-cbm`, `total-util`, `total-daily`, `total-below` | Implemented |
| Per-vertical table | Vertical name, group count, stock value, CBM, allocation, utilisation, daily cost, below-reorder count, turnover | Overview "Stock by vertical" table; Capacity utilisation table; Cost split table | Overview, Capacity, Cost, each vertical link to its group rows | reconcile `<slug>-groups`, `<slug>-value`, `<slug>-cbm`, `<slug>-util`, `<slug>-daily`, `<slug>-below`, `<slug>-turnover` | Implemented |
| Per-vertical table | Over-allocated and under-used call-outs | Overview "Space and allocation" note naming the over and under vertical | Overview to Capacity | reconcile `overview-over`, `overview-under`, `overview-one-over` | Implemented |

## Detailed CBM calculator workbook, vertical sheets

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Sheet header | Rackable CBM, non-rackable CBM, grand total CBM | Calculator page header (`#calc-rack`, `#calc-nonrack`, `#calc-total`) | Calculator, one vertical at a time | reconcile `calc-<slug>-rack`, `calc-<slug>-nonrack`, `calc-<slug>-total` | Implemented |
| Row | Serial number | Not shown | | | Not carried: table order is the group's generation order, not a numbered serial; nothing downstream reads a serial number |
| Row | SKU main group | Calculator table row label, linking to the group page | Calculator to Group page | reconcile `calc-<slug>-rows` | Implemented |
| Row | Length, breadth, height, metres | Calculator table, editable fields | Calculator | reconcile `calc-<row>-unit` (unit CBM from these three); interactions checks the live recompute and the hostile-input handling on these fields | Implemented |
| Row | Unit CBM | Calculator table, recomputed live as dimensions change | Calculator | reconcile `calc-<row>-unit` | Implemented |
| Row | Total CBM | Calculator table, recomputed live as dimensions or quantity change, with the change against the published figure shown beside it | Calculator | reconcile `calc-<row>-total`; interactions checks the group and vertical totals move by the correct amount | Implemented |
| Row | Rackable flag | Calculator table, shown as a tag and folded into the rackable and non-rackable header totals | Calculator | reconcile `calc-<slug>-rack`, `calc-<slug>-nonrack` | Implemented |
| Row | Quantity | Calculator table, editable field | Calculator | interactions checks a fractional quantity is refused; reconcile `calc-<row>-total` | Implemented |
| Row | Notes | Not shown | | | Not carried: no free-text remark field exists on a material group in this data model |
| Vertical sheets, one per vertical | One sheet per vertical | Calculator page, a dropdown selecting one vertical at a time, with the address bar carrying the selection | Calculator | interactions checks switching vertical updates both the address and the table; the empty vertical shows a readable empty state | Adapted: this demo carries a multi-vertical roster, shared with the sibling MIS demo, in place of the reference's fixed sheet count; one vertical holds no material groups and its sheet is deliberately empty to prove the empty state |

## Detailed CBM calculator workbook, assumptions sheet

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Assumptions sheet | Space parameters (floor area, net usable share, stacking height) | Data basis "Store parameters" | Data basis | reconcile `site-net-sqft`, `site-net-m2`, `site-capacity` | Implemented |
| Assumptions sheet | Daily storage cost | Data basis definition "Daily storage rate"; Overview "Storage cost" | Data basis, Overview | reconcile `site-rate` | Implemented |
| Allocation table, per vertical | Rackable CBM | Capacity utilisation table | Capacity | reconcile `<slug>-rackable`, `total-rackable` | Implemented |
| Allocation table, per vertical | Total CBM | Capacity utilisation table, Overview | Capacity, Overview | reconcile `<slug>-cbm`, `total-cbm` | Implemented |
| Allocation table, per vertical | Idle CBM | Capacity utilisation table, shown in red when negative (over allocation) | Capacity | reconcile `<slug>-idle`, `total-idle` | Implemented |

## Site-options comparison sheet

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Option row | Total size, sq m and sq ft | Cost page, "Site options" | Cost | reconcile `option-<key>-sqm` | Implemented |
| Option row | Location | Cost page, "Site options" note column | Cost | not independently asserted; carried as descriptive text alongside the priced fields | Implemented |
| Option row | Annual rent | Cost page, "Site options" | Cost | reconcile `option-<key>-monthly` (derives monthly from annual) | Implemented |
| Option row | Monthly rent | Cost page, "Site options" | Cost | reconcile `option-<key>-monthly` | Implemented |
| Option row | Monthly rate per sq ft | Cost page, "Site options" | Cost | reconcile `option-<key>-rate` | Implemented |
| Option row | One-off agent commission | Cost page, "Site options" | Cost | reconcile `option-<key>-effective` (spreads commission into the effective rate) | Implemented |
| Option row | Effective rate including commission | Cost page, "Site options" | Cost | reconcile `option-<key>-effective` | Implemented, spread over a stated term of months rather than left as a one-off charge, so the four options compare on one like-for-like monthly figure |

## Plan document, five model areas

| Reference location | Field or schedule | Application report | Drill-down path | Verification evidence | Disposition |
|---|---|---|---|---|---|
| Model area 1, storage cost per sq ft and per product | Storage cost per unit of space; storage cost per material group | Cost page, "Cost split by vertical" and "Storage cost by material group"; Data basis definitions "Daily storage rate" and "Daily storage cost" | Cost | reconcile `cost-row-<slug>`, `cost-daily-<slug>`, `<slug>-daily` | Adapted: cost per unit of space is expressed per CBM rather than per sq ft, because the store is measured and rented by volume throughout this demo, not by a floor footprint per product; the underlying rent-per-sq-ft input is still shown on Data basis |
| Model area 2, handling and logistics cost fixed and variable | Fixed handling cost; variable handling cost by movement | Cost page, "Cost split by vertical" | Cost | reconcile `cost-row-<slug>`, `cost-total-handlingFixed`, `cost-total-handlingVariable` | Implemented |
| Model area 3, inventory aging and turnover | Age bands; slow movers; turnover by vertical | Aging page, "Value by age band", "Slow movers", "Turnover by vertical" | Aging, each row to its group or vertical | reconcile `total-age`, `slow-<slug>`, `<slug>-turnover`, `total-turnover` | Implemented |
| Model area 4, space utilisation and capacity planning | Utilisation against the 60 to 80 percent band; ABC classification | Overview and Capacity utilisation charts; Aging page "ABC classification" | Overview, Capacity, Aging | reconcile `total-util`, `<slug>-util`, `abc-<class>-groups`, `abc-<class>-value`, `abc-rule` | Implemented |
| Model area 5, forecast-driven replenishment triggers | Reorder point; days of cover; the three statuses; the four-month space projection | Replenishment page, "The rule for each measure" and the material groups table; Capacity page, "Space need, next four months" | Replenishment, Capacity, each row to its group page | reconcile `repl-rule-<slug>`, `<slug>-rop`, `<slug>-cover`, `<slug>-status`, `total-projection-<n>` | Implemented |

## What is deliberately not carried

The calculator's serial number and free-text notes columns: no downstream figure in this data model reads either, and the browser calculator identifies a row by its material group name and links straight to that group's own page instead of a row number. The reference's set of vertical sheets is replaced end to end by the multi-vertical roster this demo shares with the sibling MIS demo, so the count and the names differ from the reference by design, not by omission. The header strip's single division-wide average unit price is not published as one figure; the same information is available per material group on every group page instead. No workbook input-cell legend or editing instructions are carried, because editing here is a live browser calculator with its own on-screen field errors, not a spreadsheet convention of blue input cells.
