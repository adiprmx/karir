# PRODUCT.md — Karir (inferred from the owner's brief, 6 Nov 2026)

## Product truth

- Karir is a directory of 406 official career channels of Indonesian companies, each opened and checked live in a browser on 4–5 Nov 2026.
- The web app is static only (GitHub Pages, folder `docs/`). No backend, no accounts, no personal data, no analytics, no CDN, no external fonts or frameworks. The only network request is fetching `companies.json` from the same origin.
- Data is honest: vacancy findings were checked for warehouse/production/cleaning/office boy/packing/crew store roles. Other roles are recommended as channels with an honest "not yet verified" label. Denial sentences in the data never count as matches.
- Budget is zero rupiah. The owner has no VPS. Control stays with the owner and the assistant only.

## Audience and job

Indonesian job seekers. They open the app, type where they live and what position they want, and get the official career channels worth opening. They must be able to tell within seconds whether a result is a verified vacancy or just a channel to check.

## Direction contract (surface: docs/index.html)

- THESIS: the tool is the hero. The first viewport is a working search, not a headline about a search. The app has three clear screens (Beranda, Cari, Dasbor) behind one navigation, each with one job. It refuses the category default: dark band plus giant headline plus three equal cards plus staggered reveals.
- OWN-WORLD: near-black header and footer on white ground, hairline dividers, 12px cards, pill chips, 8px inputs and buttons, system font stack, tabular numbers. Color only for function: green verified target, amber mismatch, gray everything else. No gradients, no glass, no glow, no eyebrow labels, no side stripes, no stock decoration.
- STORY: the visitor understands in one glance that this is 406 real checked channels, believes the numbers because every figure is computed from the data, and acts by typing domicile and position, then opening a channel.
- FIRST VIEWPORT: left-aligned headline (two lines max) and one short subtext above a real search form (Domisili, Posisi atau perusahaan, Cari). Quick examples underneath with real queries. Stats as a plain figure strip with hairline dividers, not cards.
- FORM: code-led (Operate surface). Signature interaction: typing a domicile and position re-ranks 406 real companies instantly, with match chips explaining each rank.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
