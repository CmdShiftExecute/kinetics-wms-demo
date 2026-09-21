# Design system

A brutalist, print-inspired interface built to read as an internal engineering system, not a generic dashboard. There is no card grid, no gradient text and no icon-above-heading pattern anywhere in the application.

## Color

The color set is defined once as semantic custom properties, never hard-coded per component, so a theme change touches one place. It is otherwise entirely paper-and-ink neutrals; a single second print ink and its lighter tint carry every chart mark, bar and ring, and hazard red is the one accent in the whole system. Hazard red is earned only by a real risk or breach: a group below its reorder point, a vertical over its own allocation, stock older than a year, or a failed reconciliation assertion. A separate, slightly darker hazard token is used specifically for hazard-colored text, so red text clears the stricter 4.5 to 1 text-contrast bar while red bars and marks only need to clear the looser 3 to 1 non-text bar. `bun run contrast` reads these tokens straight from the stylesheet and fails the build if either bar is missed, so the split is a build-enforced contract rather than a styling choice that could quietly regress.

## Typography

Two families, both self-hosted so there is no external font request and no flash of unstyled text. A single display face carries the masthead wordmark and every heading, set in uppercase with tight tracking. A single monospace face, set with tabular numerals so every column of figures aligns, carries every label, every table cell and every line of prose; there is no separate body sans-serif anywhere in the app. One shared size token keeps the masthead's system name and every page's heading at the same visual scale at any viewport width.

## Square surfaces, circular controls

A global reset squares every corner across tables, inputs, tags and ordinary buttons. The two deliberate exceptions are the circular icon-only suite controls in the masthead, whose geometry is checked directly because the global reset would otherwise flatten them too.

## Layout

An eight-step spacing scale drives every margin, padding and gap in the stylesheet rather than ad hoc pixel values, and one maximum-width wrapper contains every page. Layout is CSS grid throughout, with flexbox reserved for small inline groups: a headline-figure strip that collapses from six columns down to two as the viewport narrows, a two-column section layout for pages with more than one leading topic, and a shared table skin with right-aligned, tabular-numeral figures, a heavy rule under the header row and a lighter rule under every body row. A sticky-first-column modifier keeps a table's row identity visible while the rest of the row scrolls horizontally on a phone.

## Warehouse charts

Four SVG chart types exist only in this application, none shared with the sibling demos: an age-band composition chart, a month-end stock line against a reorder point, a four-month projection line against capacity or allocation, and a utilisation bar chart against allocation, each with its own dedicated set of chart classes in the stylesheet. The CBM calculator's editable table carries its own styling on top of the shared table skin: right-aligned inline inputs, a hazard border and message on an invalid field, and a status block that turns hazard-bordered the moment a real breach occurs.

## Motion

One easing curve drives every transition and animation in the application, at three tiers: page-level (each route fades and rises 6px on navigation), section and row-level (sections reveal on scroll, table rows stagger in), and micro-interaction (every clickable control gives a small scale-down press on activation; chart bars grow in on scroll; line charts draw in along their own path). Reduced motion is handled twice, deliberately: a blanket stylesheet rule removes every transition and animation, and every motion-driven hook and component independently checks the same reduced-motion preference in code and omits its animated props entirely, so neither mechanism alone is a single point of failure.

## Accessibility

A consistent, high-contrast focus ring applies globally to every interactive element. Sortable table columns use a real button inside the header cell with its sort direction exposed, rather than a bare clickable cell. Both line charts support full keyboard operation: focusing the chart selects a starting point, the arrow keys move a crosshair, escape clears it, and a live region announces the same reading a sighted user sees on hover. The CBM calculator's inputs carry an invalid-state flag and point to their own inline error message, so an assistive-technology user gets the same message a sighted user reads visually. Contrast itself is gated at build time, not only designed by eye.

## Phone pass

Every route is checked at a real phone viewport width in a real mobile browser context, with real motion running rather than disabled for the check: no sideways scroll, every chart label inside its own chart, every data mark actually drawn once scrolled into view, and every tap target sized for a coarse pointer. One chart-entry check specifically guards against a mobile browser engine reporting a chart's scroll-into-view only once and never again, which had previously left a chart drawing no marks at all on a real phone while every desktop-browser check still passed.

## See also

- [Quality gates](quality-gates.md), for the `contrast`, `interactions` and `motion` commands that enforce this system at build time.
- [README](../README.md)
