# Material group detail

One material group's full record: its seventeen WIS (Warehouse Information System) SKU-master fields, its CBM inputs, its age profile, its replenishment status, and twelve months of stock.

*No standalone screenshot of this route was captured for this guide; the page shares the same report chrome shown on every other page.*

## What is on the page

- **Headline strip.** Quantity against the reorder point, stock value, group CBM, storage cost per day, days of cover, and average age.
- **WIS fields.** All seventeen fields as a definition list: brand (a synthetic supplier code, never a real name), vertical, dimensions, unit and total CBM, rackable flag, price, stock value, storage cost, safety stock, max stock, lead time, demand, reorder point, days of cover, stock-out date, status and ABC class.
- **CBM inputs.** The group's own length, breadth, height, unit CBM, quantity, group CBM and rackable flag in one row, with a direct link into the calculator, pre-set to this group's own vertical.
- **Age profile.** The group's four age bands, with its turnover and ABC class as a footnote.
- **Replenishment status.** A status table plus a small commitments breakdown: mapped to purchase order, free stock, and in transit.
- **Twelve months of stock.** A chart of month-end quantity against the reorder point, with an expandable table of the underlying monthly values.

## How the figures are built

A group's brand is always a synthetic supplier code (for example, an invented alphanumeric tag), never an invented brand name, specifically because an invented name can accidentally collide with a real company where a code cannot. Where a group holds CBM at both the main store and the overflow store, its storage-cost field states both applicable rates together, rather than only the one that happens to apply to most of its stock, since a group split across both stores genuinely pays two different rates on two different portions of its volume.

## Interactions

The twelve-month chart supports the same keyboard crosshair behaviour as the store's other line chart, with a live announcement for assistive technology. If a group's data file cannot be found, the page renders a specific error naming the missing group rather than a generic message, with a link back to the full replenishment table.

## See also

- [Replenishment](04-replenishment.md), for the full table this page's rows are drawn from.
- [CBM calculator](06-calculator.md), for the shared arithmetic this page's CBM inputs section links into.
- [README](../README.md)
