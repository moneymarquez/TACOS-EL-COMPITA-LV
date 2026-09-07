import type { Env } from '../env';
import type { MenuItem, Photo, ScheduleEntry, SiteData, Truck } from '../db';
import { directionsUrl, esc, fmtDateLabel, fmtPrice, fmtTime } from '../util';

const NAME = 'El Compita';

/** Renders the whole one-page site from D1 data. Every string from the DB passes through esc(). */
export function renderHome(data: SiteData, env: Env, today: string, flash: { kind: 'sent' | 'error'; msg: string } | null): string {
  const s = data.settings;
  const phoneHref = s.phone ? `tel:${s.phone.replace(/[^\d+]/g, '')}` : '';
  const title = `${NAME} · Tacos in West Valley & West Jordan, Utah`;
  const description = [s.hero_headline, s.hero_subline].filter(Boolean).join(' ') || `${NAME} taco trucks, West Valley and West Jordan, Utah.`;
  const ogImage = data.photos[0] ? `${env.SITE_URL}/photos/${data.photos[0].r2_key}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0e0b09">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${esc(env.SITE_URL)}/">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(env.SITE_URL)}/">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<link rel="stylesheet" href="/site.css">
<script type="application/ld+json">${structuredData(data, env)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <a class="topbar__brand" href="#top" aria-label="${esc(NAME)} home">${esc(NAME)}</a>
  <nav class="topbar__nav" aria-label="Sections">
    <a href="#menu">Menu</a>
    <a href="#location">Location</a>
    <a href="#catering">Catering</a>
  </nav>
  ${phoneHref ? `<a class="topbar__call" href="${esc(phoneHref)}" aria-label="Call ${esc(NAME)}">${icon('phone')}<span>Call</span></a>` : ''}
</header>

<main id="main">
${hero(data)}
${whereWeAre(data, today)}
${menu(data)}
${photos(data)}
${story(data)}
${catering(data, flash)}
${reviews(data)}
${contact(data, phoneHref)}
</main>

<footer class="footer">
  <div class="footer__brand">${esc(NAME)}</div>
  ${s.hours_summary ? `<p class="footer__hours">${esc(s.hours_summary)}</p>` : `<p class="footer__hours muted">Hours vary by stop. See today's locations above.</p>`}
  <div class="footer__links">
    ${s.instagram_url ? `<a href="${esc(s.instagram_url)}" rel="noopener" target="_blank">${icon('instagram')} Instagram</a>` : ''}
    ${phoneHref ? `<a href="${esc(phoneHref)}">${icon('phone')} ${esc(s.phone)}</a>` : ''}
  </div>
  <p class="footer__legal">© ${new Date().getFullYear()} ${esc(NAME)}. ${esc(s.service_area || 'Utah')}.</p>
</footer>

<dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
  <button class="lightbox__close" type="button" data-close aria-label="Close">${icon('close')}</button>
  <img class="lightbox__img" alt="">
  <p class="lightbox__caption"></p>
</dialog>
<script src="/site.js" defer></script>
</body>
</html>`;
}

/* ── sections ─────────────────────────────────────────────────────── */

function hero(d: SiteData): string {
  const s = d.settings;
  return `<section class="hero" id="top">
  <div class="hero__inner">
    <p class="hero__eyebrow">Taco trucks · West Valley &amp; West Jordan, UT</p>
    <h1 class="hero__logo">${esc(NAME)}</h1>
    ${s.hero_headline ? `<p class="hero__headline">${esc(s.hero_headline)}</p>` : ''}
    ${s.hero_subline ? `<p class="hero__sub">${esc(s.hero_subline)}</p>` : ''}
    <div class="hero__cta">
      <a class="btn btn--primary" href="#location">Where we are today</a>
      <a class="btn btn--ghost" href="#menu">See the menu</a>
    </div>
  </div>
</section>`;
}

function whereWeAre(d: SiteData, today: string): string {
  const byTruck = new Map<number, ScheduleEntry[]>();
  for (const e of d.schedule) byTruck.set(e.truck_id, [...(byTruck.get(e.truck_id) ?? []), e]);
  const trucks = d.trucks.length ? d.trucks : [];
  return `<section class="section" id="location">
  <div class="section__head">
    <h2>Where We Are Today</h2>
    <p class="section__lede">Both trucks post their stops here. Tap a stop for directions.</p>
  </div>
  ${trucks.length === 0 ? emptyState('No trucks are active right now.', 'Turn a truck on in the admin to show its schedule here.') : ''}
  <div class="trucks">
    ${trucks.map((t) => truckCard(t, (byTruck.get(t.id) ?? []).slice(0, 8), today, d)).join('')}
  </div>
</section>`;
}

function truckCard(t: Truck, entries: ScheduleEntry[], today: string, d: SiteData): string {
  const s = d.settings;
  const body = entries.length
    ? `<ol class="stops">${entries.map((e) => stop(e, today)).join('')}</ol>`
    : `<div class="empty empty--inline">
         <p><strong>No stops posted yet.</strong></p>
         <p>${s.instagram_url ? `Check <a href="${esc(s.instagram_url)}" rel="noopener" target="_blank">Instagram</a> for today's location.` : 'Today\'s location will be posted here.'}</p>
       </div>`;
  return `<article class="truck">
  <h3 class="truck__name">${esc(t.label)}</h3>
  ${body}
</article>`;
}

function stop(e: ScheduleEntry, today: string): string {
  const isToday = e.date === today;
  const link = e.map_link || (e.street_address ? directionsUrl(e.street_address) : '');
  return `<li class="stop${isToday ? ' stop--today' : ''}">
  <div class="stop__when">
    <span class="stop__date">${esc(fmtDateLabel(e.date, today))}</span>
    <span class="stop__hours">${esc(fmtTime(e.start_time))} – ${esc(fmtTime(e.end_time))}</span>
  </div>
  <div class="stop__where">
    <span class="stop__name">${esc(e.location_name)}</span>
    ${e.street_address ? `<span class="stop__addr">${esc(e.street_address)}</span>` : ''}
    ${e.note ? `<span class="stop__note">${esc(e.note)}</span>` : ''}
  </div>
  ${link
    ? `<a class="btn btn--small btn--primary stop__dir" href="${esc(link)}" rel="noopener" target="_blank">${icon('pin')} Get directions</a>`
    : `<span class="stop__nodir">Address not posted yet</span>`}
</li>`;
}

function menu(d: SiteData): string {
  const byCat = new Map<number, MenuItem[]>();
  for (const i of d.items) byCat.set(i.category_id, [...(byCat.get(i.category_id) ?? []), i]);
  const cats = d.categories.filter((c) => (byCat.get(c.id) ?? []).length > 0);
  return `<section class="section" id="menu">
  <div class="section__head">
    <h2>Menu</h2>
    <p class="section__lede">Steak cut fresh every day. Prices include everything on the taco.</p>
  </div>
  ${cats.length === 0
    ? emptyState('Menu coming soon.', 'Tacos and drinks, including Mexican Coke. Full menu with prices will be posted here.')
    : cats.map((c) => `<div class="menu-cat">
      <h3 class="menu-cat__name">${esc(c.name)}</h3>
      <ul class="menu-list">
        ${(byCat.get(c.id) ?? []).map(menuItem).join('')}
      </ul>
    </div>`).join('')}
</section>`;
}

function menuItem(i: MenuItem): string {
  const price = fmtPrice(i.price_cents);
  const sold = i.availability === 'sold_out';
  return `<li class="menu-item${sold ? ' menu-item--sold' : ''}">
  <div class="menu-item__text">
    <span class="menu-item__name">${esc(i.name)}${sold ? ' <span class="tag">Sold out</span>' : ''}</span>
    ${i.description ? `<span class="menu-item__desc">${esc(i.description)}</span>` : ''}
  </div>
  <span class="menu-item__price">${price ? esc(price) : '<span class="muted">Ask at truck</span>'}</span>
</li>`;
}

function photos(d: SiteData): string {
  return `<section class="section" id="photos">
  <div class="section__head">
    <h2>Photos</h2>
  </div>
  ${d.photos.length === 0
    ? emptyState('Photos coming soon.', 'Real photos of the food and the trucks go here.')
    : `<ul class="gallery">${d.photos.map(photoTile).join('')}</ul>`}
</section>`;
}

function photoTile(p: Photo): string {
  const src = `/photos/${esc(p.r2_key)}`;
  const dims = p.width && p.height ? ` width="${p.width}" height="${p.height}"` : '';
  return `<li class="gallery__item">
  <button type="button" class="gallery__btn" data-full="${src}" data-alt="${esc(p.alt_text)}" aria-label="Open photo: ${esc(p.alt_text)}">
    <img src="${src}" alt="${esc(p.alt_text)}" loading="lazy" decoding="async"${dims}>
  </button>
</li>`;
}

function story(d: SiteData): string {
  const s = d.settings;
  return `<section class="section section--story" id="story">
  <div class="section__head">
    <h2>Our Story</h2>
  </div>
  ${s.story_text ? paragraphs(s.story_text, 'story__text') : emptyState('Story coming soon.', 'The owner\'s story - Vegas roots, steak cut daily, and the plan for a taco stand in every city - goes here.')}
  <ul class="pillars">
    <li>${icon('knife')}<span>Steak cut daily</span></li>
    <li>${icon('truck')}<span>Two trucks</span></li>
    <li>${icon('bottle')}<span>Mexican Coke</span></li>
  </ul>
</section>`;
}

function catering(d: SiteData, flash: { kind: 'sent' | 'error'; msg: string } | null): string {
  const s = d.settings;
  return `<section class="section" id="catering">
  <div class="section__head">
    <h2>Catering &amp; Events</h2>
    ${s.catering_copy ? paragraphs(s.catering_copy, 'section__lede') : ''}
  </div>
  <form class="form" id="catering-form" method="post" action="/api/inquiries" novalidate>
    <div class="form__status" id="form-status" role="status" aria-live="polite">${flash ? `<p class="notice notice--${flash.kind === 'sent' ? 'ok' : 'err'}">${esc(flash.msg)}</p>` : ''}</div>
    <div class="form__grid">
      <label class="field"><span>Your name</span><input name="name" type="text" autocomplete="name" required maxlength="120"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="40"></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="200"></label>
      <label class="field"><span>Event date</span><input name="event_date" type="date" required></label>
      <label class="field"><span>Headcount</span><input name="headcount" type="number" inputmode="numeric" min="1" max="100000" placeholder="About how many people?"></label>
      <label class="field"><span>Event location</span><input name="event_location" type="text" autocomplete="street-address" maxlength="300" placeholder="City or address"></label>
      <label class="field field--full"><span>Tell us about the event</span><textarea name="message" rows="4" maxlength="3000"></textarea></label>
      <label class="hp" aria-hidden="true"><span>Leave this empty</span><input name="website" type="text" tabindex="-1" autocomplete="off"></label>
    </div>
    <button class="btn btn--primary btn--wide" type="submit">Send catering inquiry</button>
    <p class="form__privacy">We use this only to reply about your event. Your details are saved so we can follow up and are never shared or sold.</p>
  </form>
</section>`;
}

function reviews(d: SiteData): string {
  const s = d.settings;
  const rating = s.google_rating;
  const count = s.google_review_count;
  const head = rating
    ? `<div class="rating">
        <span class="rating__num">${esc(rating)}</span>
        <span class="rating__stars" aria-label="${esc(rating)} out of 5 stars">${stars(Math.round(Number(rating)))}</span>
        <span class="rating__meta">on Google${count ? ` · ${esc(count)} reviews` : ''}</span>
      </div>`
    : '';
  const quotes = d.reviews.length
    ? `<ul class="quotes">${d.reviews.map((r) => `<li class="quote">
        <span class="quote__stars" aria-label="${r.star_rating} out of 5 stars">${stars(r.star_rating)}</span>
        <blockquote class="quote__text">${esc(r.quote)}</blockquote>
        <cite class="quote__who">${esc(r.reviewer_name)} · ${esc(r.source)}</cite>
      </li>`).join('')}</ul>`
    : '';
  const empty = !rating && !d.reviews.length
    ? emptyState('Reviews coming soon.', 'The Google rating and a few customer quotes will appear here once they are added.')
    : '';
  return `<section class="section" id="reviews">
  <div class="section__head"><h2>Reviews</h2></div>
  ${head}${quotes}${empty}
  ${s.google_reviews_url ? `<p class="center"><a class="btn btn--ghost" href="${esc(s.google_reviews_url)}" rel="noopener" target="_blank">Read reviews on Google</a></p>` : ''}
</section>`;
}

function contact(d: SiteData, phoneHref: string): string {
  const s = d.settings;
  const row = (label: string, value: string, html: string) =>
    `<li class="contact__row"><span class="contact__label">${label}</span>${value ? html : `<span class="muted">${label} coming soon</span>`}</li>`;
  return `<section class="section" id="contact">
  <div class="section__head"><h2>Contact &amp; Follow</h2></div>
  <ul class="contact">
    ${row('Phone', s.phone, `<a href="${esc(phoneHref)}">${icon('phone')} ${esc(s.phone)}</a>`)}
    ${row('Email', s.email, `<a href="mailto:${esc(s.email)}">${icon('mail')} ${esc(s.email)}</a>`)}
    ${row('Instagram', s.instagram_url, `<a href="${esc(s.instagram_url)}" rel="noopener" target="_blank">${icon('instagram')} Follow on Instagram</a>`)}
    <li class="contact__row"><span class="contact__label">Service area</span><span>${esc(s.service_area || 'West Valley City and West Jordan, Utah')}</span></li>
  </ul>
</section>`;
}

/* ── helpers ──────────────────────────────────────────────────────── */

function emptyState(title: string, detail: string): string {
  return `<div class="empty"><p><strong>${esc(title)}</strong></p><p>${esc(detail)}</p></div>`;
}

function paragraphs(text: string, cls: string): string {
  return text.split(/\n{2,}|\r\n{2,}/).map((p) => `<p class="${cls}">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function stars(n: number): string {
  const k = Math.max(0, Math.min(5, n));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

function structuredData(d: SiteData, env: Env): string {
  const s = d.settings;
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    name: NAME,
    url: `${env.SITE_URL}/`,
    servesCuisine: 'Mexican',
    areaServed: ['West Valley City, UT', 'West Jordan, UT'],
    priceRange: '$',
  };
  if (s.hero_headline) obj.description = s.hero_headline;
  if (s.phone) obj.telephone = s.phone;
  if (s.email) obj.email = s.email;
  if (s.instagram_url) obj.sameAs = [s.instagram_url];
  if (d.photos[0]) obj.image = `${env.SITE_URL}/photos/${d.photos[0].r2_key}`;
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
  // "<" cannot appear literally inside a <script>; escape it in the JSON.
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function icon(name: 'phone' | 'instagram' | 'pin' | 'close' | 'mail' | 'knife' | 'truck' | 'bottle'): string {
  const paths: Record<string, string> = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2.1z"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
    knife: '<path d="M3 21 21 3M14 4l6 6M4 14l6 6"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    bottle: '<path d="M9 2h6M10 2v4l-2 3v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2"/>',
  };
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
