# El Compita — taco trucks site

One-page, mobile-first marketing site for El Compita (two taco trucks, West Valley /
West Jordan, Utah) plus an owner admin at `/admin` for the schedule, menu, photos,
site text, reviews, and catering inquiries.

**Stack:** one Cloudflare Worker (TypeScript, no framework, no build step beyond
Wrangler's bundler) that renders the home page from **D1** (SQLite) and serves
photos from **R2**. Static assets (CSS, JS, admin page) come from `public/`.
Catering-inquiry emails go through **Resend** (free tier). Nothing else is paid or
required.

Why this stack: the public page has no client-side state, so React would only add
weight. Server-rendering from D1 means the schedule and menu are in the first byte
of HTML (Lighthouse mobile: 99 performance, 100 accessibility, measured with six
photos loaded), and structured data is always in sync with what the owner typed.
D1 + R2 keep everything on the Cloudflare account the operator already deploys to:
one login, one CLI, no second vendor, no extra API keys beyond the email sender.

## Repo layout

```
./
  wrangler.jsonc        Worker + D1 + R2 + assets config (edit database_id once)
  package.json          npm scripts (dev, deploy, db:*)
  migrations/0001_init.sql   schema
  seed/seed.sql         idempotent seed: 2 trucks, Tacos/Drinks categories, brief copy
  src/index.ts          router: / (render), /photos/*, /api/inquiries, /api/admin/*
  src/render/home.ts    the whole public page, one function per section
  src/api/public.ts     catering inquiry: validate, store, email owner
  src/api/admin.ts      owner CRUD for everything
  src/auth.ts           password login -> signed HttpOnly cookie
  src/email.ts          Resend notification
  public/site.css|js    public styles + lightbox/form enhancement
  public/admin.html|css|js   the owner admin (plain JS)
  scripts/smoke.mjs     end-to-end test against a running dev server
  design/               the approved Claude Design export (DOM) + porting notes
```

## Local run (one command)

```bash
git clone https://github.com/moneymarquez/tacos-el-compita-lv && cd tacos-el-compita-lv
npm install
cp .dev.vars.example .dev.vars     # set ADMIN_PASSWORD to anything for local use
npm run dev                        # applies migrations + seed to a local D1, serves http://localhost:8787
```

Open http://localhost:8787 (site) and http://localhost:8787/admin (admin). Photos
upload to a local R2 emulation; nothing touches Cloudflare.

Test everything end to end (with `npm run dev` running in another terminal):

```bash
ADMIN_PASSWORD=<what you put in .dev.vars> npm run smoke
```

## First deploy (fresh laptop or phone with Wrangler)

Prerequisites: a free Cloudflare account, Node 20+, and `npm install -g wrangler`
(or use `npx wrangler`). Everything below runs from the repo root.

```bash
npm install
npx wrangler login                                   # opens the browser once

# 1. Create the database and photo bucket (once)
npx wrangler d1 create el-compita                    # prints a database_id
#    -> paste that id into wrangler.jsonc at "database_id"
npx wrangler r2 bucket create el-compita-photos

# 2. Apply the schema + seed to the real database
npm run db:remote

# 3. Secrets (prompted, never stored in the repo)
npx wrangler secret put ADMIN_PASSWORD               # the owner's /admin password
npx wrangler secret put RESEND_API_KEY               # optional but needed for inquiry emails

# 4. Deploy
npm run deploy                                       # typechecks, then wrangler deploy
```

The deploy prints the live URL (`https://el-compita.<your-subdomain>.workers.dev`).
Put that URL into `wrangler.jsonc` as `SITE_URL` and deploy once more so canonical
links, Open Graph tags, and the admin link in emails are correct. Add a custom domain
later under Workers & Pages → el-compita → Settings → Domains & Routes.

Every later deploy is just:

```bash
git pull && npm install && npm run deploy
```

Schema changes: add `migrations/0002_*.sql`, run `npm run db:remote`, deploy.

## Environment variables and secrets

| Name | Kind | Where it comes from | Required |
|---|---|---|---|
| `ADMIN_PASSWORD` | secret | you choose it; `wrangler secret put ADMIN_PASSWORD` | yes, or `/admin` cannot sign in (it says so) |
| `RESEND_API_KEY` | secret | resend.com → API Keys | for inquiry emails; without it inquiries are still stored and the admin shows a warning |
| `RESEND_FROM_EMAIL` | var in `wrangler.jsonc` | default `onboarding@resend.dev` works only for sending to the Resend account's own email; verify the real domain in Resend and change this to e.g. `El Compita <site@elcompita.com>` | yes |
| `SITE_URL` | var in `wrangler.jsonc` | the deployed URL | yes |
| `SITE_TIMEZONE` | var in `wrangler.jsonc` | `America/Denver` | yes |
| D1 `database_id` | `wrangler.jsonc` | printed by `wrangler d1 create el-compita` | yes |

The notification **recipient** is not an env var: the owner sets it in
Admin → Text & contact → "Send new inquiries to this email".

## What the owner changes without a developer (`/admin`)

- **Schedule**: add/edit/delete stops per truck (date, hours, location, address, optional
  custom map link, note). Stops appear from their date and disappear once the day passes.
  "Get directions" is built from the street address (no API key); a stop with no address
  shows "Address not posted yet" instead of a broken button.
- **Menu**: categories (add/rename/reorder/delete) and items (name, description, price,
  available / sold out / hidden, reorder).
- **Photos**: upload (resized in the browser to 1600px), edit description, choose where it
  shows (gallery grid, or the hero / location / menu / story / catering / contact picture
  spot from the design), reorder, delete.
- **Text & contact**: hero headline + orange accent line, subline, section headlines for
  location / menu / story, menu intro, story text and pull quote, catering copy, phone (click-to-call),
  email, Instagram link, service area, footer hours, Google rating + review count + link,
  truck names/on-off, notification email.
- **Reviews**: quotes with name, stars, source; reorder.
- **Inquiries**: list with email-delivery status per inquiry, delete, CSV export.

## Content the owner still needs to supply

The brief gave no phone, email, Instagram handle, addresses, prices, photos,
Google rating, or review quotes. None were invented. Each renders as a labeled
"coming soon" state until entered in `/admin`. The design's photography was
AI-generated mockup imagery and is not shipped; the owner's real photos fill those
spots. Seeded copy (hero, section headlines, story, pull quote, catering) comes from
the approved design, adapted to the spec's two-truck West Valley / West Jordan
geography, and the "$3 a taco" price line should be confirmed by the owner. See
`design/README.md` for every place the spec overrode the design.

## Security notes

- Admin auth is a single owner password, compared in constant time, exchanged for an
  HMAC-signed `HttpOnly; SameSite=Strict; Secure` cookie (7 days).
- Strict CSP (`default-src 'self'`), no inline scripts, all DB text HTML-escaped.
- Inquiry form: server-side validation, honeypot field, 8 MB photo cap, image MIME allow-list.
- `robots.txt` disallows `/admin` and `/api/`.
