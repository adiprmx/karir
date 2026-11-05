# DESIGN.md — Karir web app (written from the built world, 6 Nov 2026)

## World

White ground, near-black (`#0a0a0a`) header and footer, hairline dividers. One
functional palette: green `#16a34a` verified target, amber `#d97706` mismatch,
gray for everything else. System font stack, no external fonts. Tabular
numerals on every figure. No gradients, no glass, no glow, no eyebrow labels,
no side stripes, no decoration that is not data.

## Tokens

- Radius: cards 12px, chips pill, inputs and buttons 8px.
- Elevation: a 1px `#e5e5e5` border only, never border plus shadow.
- Buttons: primary black fill white text, secondary white fill with gray
  border, press scale 0.98, min height 44px.
- Focus: 3px solid `#111111` outline, offset 2px, on every interactive element.
- Selection: black background, white text.

## Layout families (one use each)

- Hero: left-aligned headline (max two lines desktop), one short subtext,
  the working search form as the dominant element, tappable example chips.
- Stats: a plain figure strip with hairline dividers, no cards.
- Vacancies: horizontal scroll-snap rail of compact cards, sized to content.
- How it works: a numbered list with hairline dividers, no cards.
- Dashboard: data bars (label, track, count) plus hairline-divided lists.
- Search results: a two-column card grid on desktop, one column on mobile,
  with `minmax(0, 1fr)` tracks and `overflow-wrap: anywhere` so long URLs
  and lokasi strings never push the page wider.

## Motion

One authored moment: the stat figures count up from 0 to their real value
over 800ms with cubic ease-out, and views fade in with a 4px rise on switch.
Both collapse to instant under `prefers-reduced-motion`. Nothing else moves.

## States

Loading: "Memuat data…" in the result count. Empty: an honest empty state
with recovery text. Error: a plain failure message. Every card shows the
status badge, match chips, and the honest "belum terverifikasi" notice when
the searched role has no match in the data.
