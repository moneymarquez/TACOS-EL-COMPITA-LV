// End-to-end smoke test against a running dev server (npm run dev in another terminal).
//   BASE=http://localhost:8787 ADMIN_PASSWORD=... node scripts/smoke.mjs
// Exercises: login, schedule/menu/photo/review/settings CRUD via the admin API,
// public rendering of each, catering inquiry (JSON + plain form), CSV export, cleanup.
const BASE = process.env.BASE ?? 'http://localhost:8787';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'test-password-123';
let cookie = '';
let failures = 0;
const created = { schedule: [], items: [], categories: [], photos: [], reviews: [], inquiries: [] };

function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}
async function api(method, path, body, form = false) {
  const headers = { accept: 'application/json', ...(cookie ? { cookie } : {}) };
  if (body !== undefined && !form) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form ? body : body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const home = async () => (await fetch(BASE + '/')).text();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());

// 1x1 JPEG
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

try {
  // Auth
  let r = await api('GET', '/api/admin/schedule');
  check('admin API rejects anonymous', r.status === 401);
  r = await api('POST', '/api/admin/login', { password: 'nope' });
  check('wrong password rejected', r.status === 401);
  r = await api('POST', '/api/admin/login', { password: PASSWORD });
  check('login sets cookie', r.status === 200 && cookie.startsWith('ec_admin='));
  r = await api('GET', '/api/admin/me');
  check('session works', r.status === 200 && r.data.ok);

  // Schedule (criterion 11)
  r = await api('POST', '/api/admin/schedule', { truck_id: 1, date: today, start_time: '11:00', end_time: '20:00', location_name: 'SMOKE Stop A', street_address: '3180 S 5600 W, West Valley City, UT 84120', note: 'smoke' });
  check('create schedule entry', r.status === 201 && r.data.id, JSON.stringify(r.data).slice(0, 120));
  created.schedule.push(r.data.id);
  r = await api('POST', '/api/admin/schedule', { truck_id: 2, date: today, start_time: '11:00', end_time: '10:00', location_name: 'bad' });
  check('rejects end before start', r.status === 400);
  r = await api('POST', '/api/admin/schedule', { truck_id: 2, date: today, start_time: '12:00', end_time: '13:00', location_name: 'SMOKE Stop NoAddr' });
  created.schedule.push(r.data.id);
  let html = await home();
  check('schedule entry rendered on home', html.includes('SMOKE Stop A') && html.includes('Today ·'));
  check('Get Directions deep link built from address', html.includes('https://www.google.com/maps/dir/?api=1&amp;destination=3180%20S%205600%20W'));
  check('no-address stop shows visible failure state', html.includes('Address not posted yet'));
  r = await api('PUT', `/api/admin/schedule/${created.schedule[0]}`, { truck_id: 1, date: today, start_time: '11:00', end_time: '20:00', location_name: 'SMOKE Stop A edited', street_address: '', map_link: 'https://maps.app.goo.gl/abc' });
  html = await home();
  check('edit schedule entry reflected + custom map link used', r.status === 200 && html.includes('SMOKE Stop A edited') && html.includes('https://maps.app.goo.gl/abc'));

  // Menu (criterion 12)
  r = await api('POST', '/api/admin/menu/categories', { name: 'SMOKE Cat' });
  check('create category', r.status === 201); created.categories.push(r.data.id);
  r = await api('POST', '/api/admin/menu/items', { category_id: r.data.id, name: 'SMOKE Taco', description: 'test desc', price: '3.50', availability: 'available' });
  check('create item', r.status === 201); created.items.push(r.data.id);
  r = await api('POST', '/api/admin/menu/items', { category_id: created.categories[0], name: 'SMOKE Bad', price: 'abc' });
  check('rejects bad price', r.status === 400);
  html = await home();
  check('menu item rendered with price', html.includes('SMOKE Taco') && html.includes('$3.50') && html.includes('test desc'));
  await api('PUT', `/api/admin/menu/items/${created.items[0]}`, { category_id: created.categories[0], name: 'SMOKE Taco', price: '3', availability: 'sold_out' });
  html = await home();
  check('sold-out tag + whole-dollar price', html.includes('Sold out') && html.includes('>$3<'));
  await api('PUT', `/api/admin/menu/items/${created.items[0]}`, { category_id: created.categories[0], name: 'SMOKE Taco', price: '3', availability: 'hidden' });
  html = await home();
  check('hidden item not rendered', !html.includes('SMOKE Taco'));

  // Photos
  const fd = new FormData();
  fd.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'p.jpg');
  fd.append('alt_text', 'SMOKE photo alt'); fd.append('width', '1'); fd.append('height', '1');
  r = await api('POST', '/api/admin/photos', fd, true);
  check('upload photo to R2', r.status === 201 && r.data.r2_key, JSON.stringify(r.data).slice(0, 120));
  created.photos.push(r.data.id);
  const img = await fetch(BASE + '/photos/' + r.data.r2_key);
  check('photo served from R2 with immutable cache', img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && (img.headers.get('cache-control') || '').includes('immutable'));
  html = await home();
  check('gallery renders photo with alt', html.includes('SMOKE photo alt') && html.includes('loading="lazy"'));

  // Reviews + settings
  r = await api('POST', '/api/admin/reviews', { reviewer_name: 'SMOKE Reviewer', quote: 'SMOKE quote text', star_rating: 5, source: 'Google' });
  check('create review', r.status === 201); created.reviews.push(r.data.id);
  const before = (await api('GET', '/api/admin/settings')).data;
  r = await api('PUT', '/api/admin/settings', { phone: '(801) 555-0100', google_rating: '4.9', google_review_count: '12', instagram_url: 'https://www.instagram.com/smoke' });
  check('update settings', r.status === 200 && r.data.phone === '(801) 555-0100');
  r = await api('PUT', '/api/admin/settings', { instagram_url: 'not a url' });
  check('rejects bad instagram url', r.status === 400);
  html = await home();
  check('phone renders as click-to-call', html.includes('href="tel:8015550100"'));
  check('rating + review quote rendered', html.includes('4.9') && html.includes('SMOKE quote text') && html.includes('12 reviews'));
  check('instagram link rendered', html.includes('https://www.instagram.com/smoke'));
  check('structured data includes rating + phone', html.includes('"aggregateRating"') && html.includes('"telephone":"(801) 555-0100"'));

  // Catering inquiry (criterion 9)
  r = await api('POST', '/api/inquiries', { name: 'SMOKE Person', phone: '801-555-0199', email: 'smoke@example.com', event_date: today, headcount: 40, event_location: 'West Jordan', message: 'smoke msg' });
  check('inquiry JSON submit stored', r.status === 200 && r.data.ok && r.data.id, JSON.stringify(r.data));
  created.inquiries.push(r.data.id);
  r = await api('POST', '/api/inquiries', { name: 'X', phone: '1', email: 'bad', event_date: 'nope' });
  check('inquiry validation errors returned', r.status === 400 && Array.isArray(r.data.errors) && r.data.errors.length >= 3, (r.data.errors || []).join(' | '));
  const formRes = await fetch(BASE + '/api/inquiries', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'SMOKE NoJS', phone: '8015550111', email: 'nojs@example.com', event_date: today }) });
  check('no-JS form post redirects back with success flag', formRes.status === 303 && (formRes.headers.get('location') || '').includes('inquiry=sent'), formRes.headers.get('location'));
  const honey = await api('POST', '/api/inquiries', { name: 'Bot', phone: '8015550111', email: 'bot@example.com', event_date: today, website: 'http://spam' });
  check('honeypot swallowed silently', honey.status === 200 && honey.data.ok && !honey.data.id);
  await new Promise((res) => setTimeout(res, 800)); // let waitUntil finish
  r = await api('GET', '/api/admin/inquiries');
  const mine = r.data.filter((q) => q.name.startsWith('SMOKE'));
  created.inquiries = mine.map((q) => q.id);
  check('inquiries listed in admin', mine.length === 2, `found ${mine.length}`);
  check('email status recorded honestly', mine.every((q) => ['sent', 'failed', 'not_configured'].includes(q.notify_status)), mine.map((q) => q.notify_status + (q.notify_error ? ` (${q.notify_error})` : '')).join(', '));
  r = await api('GET', '/api/admin/inquiries.csv');
  check('CSV export', r.status === 200 && String(r.data).includes('SMOKE Person') && (r.headers.get('content-type') || '').includes('text/csv'));
  const flash = await (await fetch(BASE + '/?inquiry=sent')).text();
  check('server-side success flash renders', flash.includes('Your inquiry is in'));

  // Restore settings
  await api('PUT', '/api/admin/settings', { phone: before.phone, google_rating: before.google_rating, google_review_count: before.google_review_count, instagram_url: before.instagram_url });
} catch (e) {
  check('unexpected exception', false, String(e));
} finally {
  // Cleanup
  for (const id of created.schedule) await api('DELETE', `/api/admin/schedule/${id}`);
  for (const id of created.items) await api('DELETE', `/api/admin/menu/items/${id}`);
  for (const id of created.categories) await api('DELETE', `/api/admin/menu/categories/${id}`);
  for (const id of created.photos) await api('DELETE', `/api/admin/photos/${id}`);
  for (const id of created.reviews) await api('DELETE', `/api/admin/reviews/${id}`);
  for (const id of created.inquiries) await api('DELETE', `/api/admin/inquiries/${id}`);
  const html = await home();
  check('cleanup: no smoke data left on home', !html.includes('SMOKE'));
  await api('POST', '/api/admin/logout');
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
