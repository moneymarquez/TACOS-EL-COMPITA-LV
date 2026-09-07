import type { Env } from '../env';
import type { MenuItem, Photo, Placement, ScheduleEntry, SiteData, Truck } from '../db';
import { directionsUrl, esc, fmtDateLabel, fmtPrice, fmtTime } from '../util';

// Implements the approved Claude Design export (design/claude-design-export-dom.html).
// Every string from the DB passes through esc(). Empty states are honest: nothing is invented.

const NAME = 'El Compita';
const LOGO_ALT = 'Tacos El Compita LV';

interface Ctx { photos: Partial<Record<Placement, Photo>>; gallery: Photo[]; today: string; nowHHMM: string }

export function renderHome(data: SiteData, env: Env, today: string, nowHHMM: string, flash: { kind: 'sent' | 'error'; msg: string } | null): string {
  const s = data.settings;
  const ctx: Ctx = { photos: {}, gallery: [], today, nowHHMM };
  for (const p of data.photos) {
    if (p.placement === 'gallery') ctx.gallery.push(p);
    else if (!ctx.photos[p.placement]) ctx.photos[p.placement] = p;
  }
  const phoneHref = s.phone ? `tel:${s.phone.replace(/[^\d+]/g, '')}` : '';
  const title = `${NAME} · Taco trucks in West Valley & West Jordan, Utah`;
  const description = [s.hero_headline, s.hero_headline_accent, s.hero_subline].filter(Boolean).join(' ');
  const og = ctx.photos.hero ?? ctx.gallery[0];
  const ogImage = og ? `${env.SITE_URL}/photos/${og.r2_key}` : `${env.SITE_URL}/logo-192.png`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#141110">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(env.SITE_URL)}/">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(env.SITE_URL)}/">
<meta property="og:image" content="${esc(ogImage)}">
<link rel="preload" href="/fonts/Archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
<script type="application/ld+json">${structuredData(data, env, ogImage)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar__inner">
    <a class="topbar__brand" href="#top" aria-label="${esc(LOGO_ALT)} — home">${logo(52)}</a>
    <nav class="topbar__nav" aria-label="Sections">
      <a href="#menu">Menu</a>
      <a href="#location">Location</a>
      <a href="#catering">Catering</a>
      ${phoneHref ? `<a class="topbar__call" href="${esc(phoneHref)}" aria-label="Call ${esc(NAME)}">Call</a>` : ''}
    </nav>
  </div>
</header>

<main id="main">
${hero(data, ctx)}
${whereWeAre(data, ctx)}
${menu(data, ctx)}
${photosSection(ctx)}
${story(data, ctx)}
${catering(data, ctx, flash)}
${reviews(data)}
${contact(data, ctx, phoneHref)}
</main>

<footer class="footer">
  <div class="footer__col">
    ${logo(96)}
    ${phoneHref ? `<a class="footer__phone" href="${esc(phoneHref)}">${esc(s.phone)}</a>` : ''}
    <div>${esc(s.service_area || 'West Valley City and West Jordan, Utah')} · Started in Las Vegas</div>
  </div>
  <div class="footer__col">
    <div class="footer__label">Hours</div>
    <div class="footer__text">${s.hours_summary ? esc(s.hours_summary) : `Posted daily with today's location — <a href="#location">see the schedule</a>.`}</div>
  </div>
  <div class="footer__col">
    <div class="footer__label">Follow</div>
    <div class="footer__links">
      ${s.instagram_url ? `<a href="${esc(s.instagram_url)}" target="_blank" rel="noopener">Instagram</a>` : ''}
      ${phoneHref ? `<a href="${esc(phoneHref)}">Call</a>` : ''}
      ${!s.instagram_url && !phoneHref ? '<span class="muted">Instagram and phone coming soon</span>' : ''}
    </div>
  </div>
  <div class="footer__legal">© ${new Date().getFullYear()} ${esc(NAME)} Tacos. All rights reserved.</div>
</footer>

<dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
  <button class="lightbox__close" type="button" data-close aria-label="Close">×</button>
  <img class="lightbox__img" alt="">
  <p class="lightbox__caption"></p>
</dialog>
<script src="/site.js" defer></script>
</body>
</html>`;
}

/* ── sections ─────────────────────────────────────────────────────── */

function hero(d: SiteData, ctx: Ctx): string {
  const s = d.settings;
  const p = ctx.photos.hero;
  return `<section class="hero${p ? '' : ' hero--nophoto'}" id="top">
  ${p ? `<img class="hero__img" src="/photos/${esc(p.r2_key)}" alt="${esc(p.alt_text)}" loading="eager" fetchpriority="high"${dims(p)}>` : ''}
  <div class="hero__shade" aria-hidden="true"></div>
  <div class="hero__inner">
    <div class="eyebrow eyebrow--dot">Taco trucks · West Valley &amp; West Jordan, Utah</div>
    <h1 class="hero__h1">${esc(s.hero_headline || NAME)}${s.hero_headline_accent ? `<br><span class="hero__accent">${esc(s.hero_headline_accent)}</span>` : ''}</h1>
    ${s.hero_subline ? `<p class="hero__sub">${esc(s.hero_subline)}</p>` : ''}
    <div class="hero__cta">
      <a class="btn btn-primary btn--w210" href="#location">Where we are today <span aria-hidden="true" class="btn__arrow">→</span></a>
      <a class="btn btn-secondary btn--w150" href="#menu">See the menu</a>
    </div>
  </div>
</section>`;
}

function whereWeAre(d: SiteData, ctx: Ctx): string {
  const s = d.settings;
  const byTruck = new Map<number, ScheduleEntry[]>();
  for (const e of d.schedule) byTruck.set(e.truck_id, [...(byTruck.get(e.truck_id) ?? []), e]);
  return `<section class="section" id="location">
  <div class="split">
    <div class="split__text">
      <div class="eyebrow">Where we are today</div>
      <h2 class="h2">${esc(s.location_headline || 'Updated every morning.')}</h2>
      <p class="lede">The owner posts today's spots and hours before the trucks open. Tap a stop for directions.</p>
      ${figure(ctx.photos.location, 'figure--16x9', 'A photo of the truck goes here.')}
    </div>
    <div class="stops">
      ${d.trucks.length === 0 ? `<div class="stop stop--empty"><div class="stop__name">No trucks are active right now.</div><div class="stop__addr">Turn a truck on in the admin to show its schedule here.</div></div>` : ''}
      ${d.trucks.map((t) => truckBlock(t, (byTruck.get(t.id) ?? []).slice(0, 6), ctx, s.instagram_url)).join('')}
    </div>
  </div>
</section>`;
}

function truckBlock(t: Truck, entries: ScheduleEntry[], ctx: Ctx, instagram: string): string {
  const rows = entries.length
    ? entries.map((e) => stop(e, ctx)).join('')
    : `<article class="stop stop--empty">
        <div class="stop__col">
          <div class="stop__name">No stops posted yet.</div>
          <div class="stop__addr">${instagram ? `Check <a href="${esc(instagram)}" target="_blank" rel="noopener">Instagram</a> for today's location.` : "Today's location will be posted here before the truck opens."}</div>
        </div>
      </article>`;
  return `<div class="truck">
  <div class="truck__label">${esc(t.label)}</div>
  ${rows}
</div>`;
}

function stop(e: ScheduleEntry, ctx: Ctx): string {
  const isToday = e.date === ctx.today;
  const openNow = isToday && ctx.nowHHMM >= e.start_time && ctx.nowHHMM < e.end_time;
  const link = e.map_link || (e.street_address ? directionsUrl(e.street_address) : '');
  return `<article class="stop${isToday ? ' stop--today' : ''}">
  <div class="stop__col">
    <div class="stop__meta">
      <span class="stop__date">${esc(fmtDateLabel(e.date, ctx.today))}</span>
      ${openNow ? '<span class="badge">Open now</span>' : ''}
    </div>
    <div class="stop__name">${esc(e.location_name)}</div>
    ${e.street_address ? `<div class="stop__addr">${esc(e.street_address)}</div>` : `<div class="stop__addr muted">Address not posted yet</div>`}
    <div class="stop__hours">${esc(fmtTime(e.start_time))} – ${esc(fmtTime(e.end_time))}${e.note ? ` · <span class="stop__note">${esc(e.note)}</span>` : ''}</div>
  </div>
  ${link
    ? `<a class="btn btn-secondary btn--compact stop__dir" href="${esc(link)}" target="_blank" rel="noopener" aria-label="Get directions to ${esc(e.location_name)}">Directions</a>`
    : `<span class="stop__nodir" aria-label="Directions unavailable until an address is posted">—</span>`}
</article>`;
}

function menu(d: SiteData, ctx: Ctx): string {
  const s = d.settings;
  const byCat = new Map<number, MenuItem[]>();
  for (const i of d.items) byCat.set(i.category_id, [...(byCat.get(i.category_id) ?? []), i]);
  const cats = d.categories.filter((c) => (byCat.get(c.id) ?? []).length > 0);
  return `<section class="section" id="menu">
  <div class="split">
    <div class="split__text">
      <div class="eyebrow">Menu</div>
      <h2 class="h2">${esc(s.menu_headline || 'Menu')}</h2>
      ${s.menu_lede ? `<p class="lede">${esc(s.menu_lede)}</p>` : ''}
      ${figure(ctx.photos.menu, 'figure--4x5', 'A photo of the tacos goes here.')}
    </div>
    <div class="menu-cats">
      ${cats.length === 0
        ? `<div class="empty"><div class="empty__title">Menu coming soon.</div><p>Tacos and drinks, including Mexican Coke. Items and prices will be posted here once the owner enters them.</p></div>`
        : cats.map((c) => {
          const items = byCat.get(c.id) ?? [];
          const prices = new Set(items.map((i) => i.price_cents));
          const same = prices.size === 1 && items[0]?.price_cents != null ? fmtPrice(items[0].price_cents) : null;
          return `<div class="menu-cat">
          <div class="menu-cat__head">${esc(c.name)}${same && items.length > 1 ? ` <span class="menu-cat__each">${esc(same)} each</span>` : ''}</div>
          ${items.map(menuItem).join('')}
        </div>`;
        }).join('')}
      ${cats.length ? '<p class="fineprint">Prices can change. Ask at the window about specials.</p>' : ''}
    </div>
  </div>
</section>`;
}

function menuItem(i: MenuItem): string {
  const price = fmtPrice(i.price_cents);
  const sold = i.availability === 'sold_out';
  return `<div class="menu-item${sold ? ' menu-item--sold' : ''}">
  <div class="menu-item__name">${esc(i.name)}${sold ? ' <span class="badge badge--muted">Sold out</span>' : ''}</div>
  <div class="menu-item__price">${price ? esc(price) : '<span class="muted">ask</span>'}</div>
  ${i.description ? `<div class="menu-item__desc">${esc(i.description)}</div>` : ''}
</div>`;
}

function photosSection(ctx: Ctx): string {
  return `<section class="section" id="photos">
  <div class="stack">
    <div class="stack__head">
      <div class="eyebrow">Photos</div>
      <h2 class="h2">The truck, the window, the cut.</h2>
    </div>
    ${ctx.gallery.length === 0
      ? `<div class="gallery gallery--empty" aria-hidden="true">${'<div class="gallery__ph"></div>'.repeat(7)}</div>
         <p class="fineprint">Photos coming soon. Real photos of the food and the trucks will go here.</p>`
      : `<div class="gallery">${ctx.gallery.map((p, n) => photoTile(p, n === 0)).join('')}</div>`}
  </div>
</section>`;
}

function photoTile(p: Photo, big: boolean): string {
  const src = `/photos/${esc(p.r2_key)}`;
  return `<button type="button" class="gallery__btn${big ? ' gallery__btn--big' : ''}" data-full="${src}" data-alt="${esc(p.alt_text)}" aria-label="Open photo: ${esc(p.alt_text)}">
  <img src="${src}" alt="${esc(p.alt_text)}" loading="lazy" decoding="async"${dims(p)}>
</button>`;
}

function story(d: SiteData, ctx: Ctx): string {
  const s = d.settings;
  return `<section class="section" id="story">
  <div class="split split--img-first">
    ${figure(ctx.photos.story, 'figure--3x2', 'A photo of the owner at the grill goes here.')}
    <div class="split__text">
      <div class="eyebrow">Our story</div>
      <h2 class="h2">${esc(s.story_headline || 'Our story')}</h2>
      ${s.story_text ? paragraphs(s.story_text, 'lede lede--wide') : `<div class="empty"><div class="empty__title">Story coming soon.</div></div>`}
      ${s.story_quote ? `<blockquote class="pull">“${esc(s.story_quote)}”<footer>— the owner, on where this is going</footer></blockquote>` : ''}
    </div>
  </div>
</section>`;
}

function catering(d: SiteData, ctx: Ctx, flash: { kind: 'sent' | 'error'; msg: string } | null): string {
  const s = d.settings;
  return `<section class="section" id="catering">
  <div class="split">
    <div class="split__text">
      <div class="eyebrow-row"><div class="eyebrow">Catering &amp; events</div><span class="badge">Catering available</span></div>
      <h2 class="h2">Bring the truck, or bring the taco bar.</h2>
      ${s.catering_copy ? paragraphs(s.catering_copy, 'lede') : ''}
      <ul class="rows">
        <li><span class="rows__k">Truck on site</span><span class="rows__v">Serves from the window</span></li>
        <li><span class="rows__k">Taco bar</span><span class="rows__v">Trays, tortillas, salsas</span></li>
        <li><span class="rows__k">Service area</span><span class="rows__v">${esc(s.service_area || 'West Valley City and West Jordan, Utah')}</span></li>
      </ul>
      ${figure(ctx.photos.catering, 'figure--16x9', 'A photo from a catered event goes here.')}
    </div>
    <form class="form" id="catering-form" method="post" action="/api/inquiries" novalidate aria-label="Catering inquiry">
      <div class="form__title">Catering inquiry</div>
      <div class="form__status" id="form-status" role="status" aria-live="polite">${flash ? `<p class="notice notice--${flash.kind === 'sent' ? 'ok' : 'err'}">${esc(flash.msg)}</p>` : ''}</div>
      <div class="form__grid">
        <div class="field"><label for="f-name">Name</label><input id="f-name" class="input" name="name" type="text" autocomplete="name" placeholder="Your name" required maxlength="120"></div>
        <div class="field"><label for="f-phone">Phone</label><input id="f-phone" class="input" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="Best number to reach you" required maxlength="40"></div>
        <div class="field"><label for="f-email">Email</label><input id="f-email" class="input" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required maxlength="200"></div>
        <div class="field"><label for="f-date">Event date</label><input id="f-date" class="input" name="event_date" type="date" required></div>
        <div class="field"><label for="f-count">Headcount</label><input id="f-count" class="input" name="headcount" type="number" inputmode="numeric" min="1" max="100000" placeholder="50"></div>
        <div class="field"><label for="f-loc">Event location</label><input id="f-loc" class="input" name="event_location" type="text" autocomplete="street-address" placeholder="City or address" maxlength="300"></div>
      </div>
      <div class="field"><label for="f-msg">Anything else</label><textarea id="f-msg" class="input" name="message" rows="4" placeholder="Time of day, truck vs. taco bar, dietary notes" maxlength="3000"></textarea></div>
      <label class="hp" aria-hidden="true"><span>Leave this empty</span><input name="website" type="text" tabindex="-1" autocomplete="off"></label>
      <div class="form__actions">
        <button type="submit" class="btn btn-primary btn--w200">Request a quote</button>
        <span class="fineprint">We use this only to reply about your event. Your details are saved so we can follow up and are never shared or sold.</span>
      </div>
    </form>
  </div>
</section>`;
}

function reviews(d: SiteData): string {
  const s = d.settings;
  const rating = s.google_rating, count = s.google_review_count;
  const quotes = d.reviews.length
    ? `<div class="quotes">${d.reviews.map((r) => `<blockquote class="quote">
        <span class="quote__stars" aria-label="${r.star_rating} out of 5 stars">${stars(r.star_rating)}</span>
        <p>${esc(r.quote)}</p>
        <footer>${esc(r.reviewer_name)} · ${esc(r.source)}</footer>
      </blockquote>`).join('')}</div>`
    : '';
  return `<section class="section" id="reviews">
  <div class="stack">
    <div class="stack__head">
      <div class="eyebrow">Reviews</div>
      <h2 class="h2">What people say at the window.</h2>
    </div>
    <div class="split split--top">
      <div class="split__text">
        <div class="rating${rating ? '' : ' rating--none'}">${rating ? `${esc(rating)}<span class="rating__stars" aria-label="${esc(rating)} out of 5 stars">${stars(Math.round(Number(rating)))}</span>` : '—'}<span class="rating__src">on Google${count ? ` · ${esc(count)} reviews` : ''}</span></div>
        ${rating || d.reviews.length ? '' : `<p class="lede">Google rating and review quotes will be posted here once the Business Profile is live. Nothing invented in the meantime.</p>`}
      </div>
      <div class="split__text split__text--center">
        <p class="cta-text">Been to the truck? A Google review is the fastest way to help people find it.</p>
        ${s.google_reviews_url ? `<a class="btn btn-secondary" href="${esc(s.google_reviews_url)}" target="_blank" rel="noopener">Leave a Google review</a>` : '<span class="fineprint">Google review link coming soon.</span>'}
      </div>
    </div>
    ${quotes}
  </div>
</section>`;
}

function contact(d: SiteData, ctx: Ctx, phoneHref: string): string {
  const s = d.settings;
  const row = (label: string, value: string, href: string, text: string, ext = false) => value
    ? `<a class="crow" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="crow__k">${label}</span><span class="crow__v${label === 'Phone' ? ' crow__v--accent' : ''}">${esc(text)}${ext ? ' ↗' : ''}</span></a>`
    : `<div class="crow"><span class="crow__k">${label}</span><span class="crow__v muted">${label} coming soon</span></div>`;
  const handle = s.instagram_url ? '@' + s.instagram_url.replace(/\/+$/, '').split('/').pop() : '';
  return `<section class="section" id="contact">
  <div class="split">
    <div class="split__text">
      <div class="eyebrow">Contact &amp; follow</div>
      <h2 class="h2">Call, text, or find us on Instagram.</h2>
      <div class="crows">
        ${row('Phone', s.phone, phoneHref, s.phone)}
        ${row('Email', s.email, `mailto:${s.email}`, s.email)}
        ${row('Instagram', s.instagram_url, s.instagram_url, handle, true)}
        <div class="crow"><span class="crow__k">Service area</span><span class="crow__v">${esc(s.service_area || 'West Valley City and West Jordan, Utah')}</span></div>
      </div>
    </div>
    ${figure(ctx.photos.contact, 'figure--3x2', 'A photo of the service window goes here.')}
  </div>
</section>`;
}

/* ── helpers ──────────────────────────────────────────────────────── */

function logo(h: 52 | 96): string {
  const w = Math.round(830 * h / 866);
  return `<picture><source srcset="/logo-192.webp" type="image/webp"><img class="logo logo--${h}" src="/logo-192.png" alt="${esc(LOGO_ALT)}" width="${w}" height="${h}"></picture>`;
}

function dims(p: Photo): string {
  return p.width && p.height ? ` width="${p.width}" height="${p.height}"` : '';
}

/** A design image slot: the owner's photo if one is assigned to it, else a quiet labeled placeholder. */
function figure(p: Photo | undefined, cls: string, missing: string): string {
  if (p) return `<figure class="figure ${cls}"><img src="/photos/${esc(p.r2_key)}" alt="${esc(p.alt_text)}" loading="lazy" decoding="async"${dims(p)}></figure>`;
  return `<figure class="figure figure--empty ${cls}"><figcaption>${esc(missing)}</figcaption></figure>`;
}

function paragraphs(text: string, cls: string): string {
  return text.split(/\r?\n\s*\r?\n/).map((p) => `<p class="${cls}">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function stars(n: number): string {
  const k = Math.max(0, Math.min(5, n));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

function structuredData(d: SiteData, env: Env, image: string): string {
  const s = d.settings;
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    name: NAME,
    alternateName: LOGO_ALT,
    url: `${env.SITE_URL}/`,
    logo: `${env.SITE_URL}/logo-192.png`,
    image,
    servesCuisine: 'Mexican',
    areaServed: ['West Valley City, UT', 'West Jordan, UT'],
    priceRange: '$',
  };
  if (s.hero_headline) obj.description = [s.hero_headline, s.hero_subline].filter(Boolean).join(' ');
  if (s.phone) obj.telephone = s.phone;
  if (s.email) obj.email = s.email;
  if (s.instagram_url) obj.sameAs = [s.instagram_url];
  if (s.google_rating && s.google_review_count) {
    obj.aggregateRating = { '@type': 'AggregateRating', ratingValue: s.google_rating, reviewCount: s.google_review_count, bestRating: '5' };
  }
  if (d.items.length) {
    obj.hasMenu = {
      '@type': 'Menu',
      hasMenuSection: d.categories.map((c) => ({
        '@type': 'MenuSection',
        name: c.name,
        hasMenuItem: d.items.filter((i) => i.category_id === c.id).map((i) => {
          const item: Record<string, unknown> = { '@type': 'MenuItem', name: i.name };
          if (i.description) item.description = i.description;
          if (i.price_cents !== null) item.offers = { '@type': 'Offer', price: (i.price_cents / 100).toFixed(2), priceCurrency: 'USD' };
          return item;
        }),
      })).filter((sec) => (sec.hasMenuItem as unknown[]).length > 0),
    };
  }
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
