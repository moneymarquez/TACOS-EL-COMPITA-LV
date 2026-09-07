# Design

`claude-design-export-dom.html` is the rendered DOM of the approved Claude Design
export ("El_Compita_Tacos", Modernist system, Archivo type), with inline styles
intact and image blobs removed. It is the reference for `public/site.css` and
`src/render/home.ts`.

What was ported 1:1: colors (#141110 ground, #f5efe6 cream, #f2892e orange,
#e0452c red-orange, #f5c132 yellow), the 2px rule system, Archivo at 400/600/800
(self-hosted variable font in `public/fonts/`), the 60px sticky header with the
real logo, section layout and headline copy, the square buttons, the gallery grid
with a 2x2 lead tile, the form styling, and the footer.

Where the spec won over the design (per the brief, the spec is the contract):

- **Two trucks, West Valley / West Jordan.** The design says one truck in Sandy.
  Copy was adapted; every geography string is editable in `/admin` (Text & contact),
  and a truck can be switched off there, so flipping to "one truck, Sandy" is a
  two-minute admin change if the design is the newer truth.
- **Click-to-call in the header.** The spec requires it site-wide; the design's
  header had no call link. It appears once a phone number is entered.
- **No placeholder content shipped.** The design carried example stops, example
  menu rows marked "[owner to confirm]", a 555 phone number, and AI-generated
  photography. None of that is in the seed. The photography slots (hero, location,
  menu, story, catering, contact) are filled from the owner's own uploads via the
  "Where it shows" dropdown in Admin > Photos; until then each slot is a quiet
  labeled panel, and the gallery shows the design's empty grey tiles.
- **"$3 a taco" / "Every taco, three dollars."** Kept from the design as the hero
  accent line and menu headline because the design carried it, but both are
  admin fields and should be confirmed by the owner before launch.
- **"Leave a Google review" button** only renders once the Google reviews link is
  set in admin (the design linked to a generic Google Maps URL).
- **Headcount minimum** is 1, not the design's 10; the spec sets no minimum.
