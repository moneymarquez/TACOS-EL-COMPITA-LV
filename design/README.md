# Design drop-in

The approved Claude Design export was not available when this site was built
(the brief's section 6 was empty), so the page implements the brief's written
direction: near-black ground, cream type, orange/red-orange accents, real
photography carrying the page.

When the export is ready, put the HTML file in this folder. The pieces to port:

- `public/site.css` — every color, font, and spacing token lives at the top in `:root`.
- `src/render/home.ts` — one function per section (`hero`, `whereWeAre`, `menu`,
  `photos`, `story`, `catering`, `reviews`, `contact`). Section order, ids, and
  empty states must stay as they are (they are what the spec and tests check).
- Logo: the hero currently renders "El Compita" as a text wordmark. Drop the
  real logo at `public/logo.svg` and replace the `<h1 class="hero__logo">` in
  `hero()` with an `<img>` that has real width/height attributes.

Where the design and the spec disagree, the spec wins.
