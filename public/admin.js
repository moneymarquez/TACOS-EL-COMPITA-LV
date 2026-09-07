// El Compita admin. Plain JS, no build step. Talks to /api/admin/*.
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var state = { me: null, trucks: [], categories: [] };

  /* ── API ─────────────────────────────────────────────────────── */
  function api(method, path, body, isForm) {
    var opts = { method: method, headers: { accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) { opts.body = body; } else { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    return fetch('/api/admin' + path, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'Server error ' + res.status }; }).then(function (data) {
        if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Please sign in again.'); }
        if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
        return data;
      });
    });
  }
  function toast(msg, kind) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast toast--' + (kind || 'ok'); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, kind === 'err' ? 6000 : 2500);
  }
  function fail(e) { toast(e.message || String(e), 'err'); }
  function formData(form) { var o = {}; new FormData(form).forEach(function (v, k) { o[k] = v; }); return o; }
  function fill(form, obj) { Object.keys(obj).forEach(function (k) { var el = form.elements[k]; if (el && !(el instanceof RadioNodeList)) el.value = obj[k] == null ? '' : obj[k]; }); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k]; else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function btn(label, onclick, cls) { return el('button', { type: 'button', class: 'btn btn--sm ' + (cls || ''), text: label, onclick: onclick }); }
  function confirmDo(msg, fn) { if (confirm(msg)) fn(); }
  function fmtTime(t) { var p = t.split(':'), h = +p[0], m = p[1]; var s = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m === '00' ? '' : ':' + m) + ' ' + s; }
  function price(c) { return c == null ? 'not set' : '$' + (c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)); }
  function moveButtons(list, idx, onReorder) {
    return [
      btn('↑', function () { if (idx > 0) { var ids = list.map(function (x) { return x.id; }); ids.splice(idx - 1, 0, ids.splice(idx, 1)[0]); onReorder(ids); } }),
      btn('↓', function () { if (idx < list.length - 1) { var ids = list.map(function (x) { return x.id; }); ids.splice(idx + 1, 0, ids.splice(idx, 1)[0]); onReorder(ids); } })
    ];
  }

  /* ── auth ────────────────────────────────────────────────────── */
  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
  function showApp() { $('#login').hidden = true; $('#app').hidden = false; }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#login-error'); err.hidden = true;
    api('POST', '/login', { password: e.target.password.value }).then(boot).catch(function (ex) { err.textContent = ex.message; err.hidden = false; });
  });
  $('#logout').addEventListener('click', function () { api('POST', '/logout').then(showLogin); });

  function boot() {
    return api('GET', '/me').then(function (me) {
      state.me = me; showApp();
      return api('GET', '/settings').then(function (s) {
        var why = !me.emailConfigured ? 'the RESEND_API_KEY secret is not set (see README)' : !s.notify_email ? 'no notification email is set under Text & contact' : '';
        $('#email-warning').hidden = !why; $('#email-warning-why').textContent = why;
        openTab(location.hash.replace('#', '') || 'schedule');
      });
    }).catch(showLogin);
  }

  /* ── tabs ────────────────────────────────────────────────────── */
  var tabs = { schedule: schedule, menu: menu, photos: photos, content: content, reviews: reviews, inquiries: inquiries };
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { openTab(b.getAttribute('data-tab')); }); });
  function openTab(name) {
    if (!tabs[name]) name = 'schedule';
    $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    location.hash = name;
    var panel = $('#panel'); panel.innerHTML = '';
    panel.appendChild($('#tpl-' + name).content.cloneNode(true));
    tabs[name]();
  }

  /* ── schedule ────────────────────────────────────────────────── */
  function schedule() {
    var form = $('#schedule-form');
    api('GET', '/trucks').then(function (trucks) {
      state.trucks = trucks;
      var sel = $('#truck-select'); sel.innerHTML = '';
      trucks.forEach(function (t) { sel.appendChild(el('option', { value: t.id, text: t.label + (t.active ? '' : ' (off)') })); });
      form.elements.date.value = state.me.today;
      loadList();
    }).catch(fail);
    function resetForm() { form.reset(); form.elements.id.value = ''; form.elements.date.value = state.me.today; $('#schedule-submit').textContent = 'Add stop'; $('#schedule-cancel').hidden = true; }
    $('#schedule-cancel').addEventListener('click', resetForm);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(form), id = d.id; delete d.id;
      var p = id ? api('PUT', '/schedule/' + id, d) : api('POST', '/schedule', d);
      p.then(function () { toast(id ? 'Stop updated' : 'Stop added'); resetForm(); loadList(); }).catch(fail);
    });
    $('#clear-past').addEventListener('click', function () {
      confirmDo('Delete every stop dated before today?', function () { api('POST', '/schedule/clear-past').then(function (r) { toast('Deleted ' + r.deleted + ' past stops'); loadList(); }).catch(fail); });
    });
    function loadList() {
      api('GET', '/schedule').then(function (rows) {
        var list = $('#schedule-list'); list.innerHTML = '';
        if (!rows.length) { list.appendChild(el('div', { class: 'empty', text: 'No stops yet. Add today\'s location above - it appears on the site immediately.' })); return; }
        rows.forEach(function (r) {
          var truck = state.trucks.filter(function (t) { return t.id === r.truck_id; })[0];
          var past = r.date < state.me.today;
          list.appendChild(el('div', { class: 'list-item' + (past ? ' past' : '') }, [
            el('div', { class: 'title', text: (truck ? truck.label : 'Truck ' + r.truck_id) + ' · ' + r.date + (r.date === state.me.today ? ' (today)' : past ? ' (past)' : '') + ' · ' + fmtTime(r.start_time) + ' – ' + fmtTime(r.end_time) }),
            el('div', { class: 'meta', text: r.location_name + (r.street_address ? ' — ' + r.street_address : ' — no address (no directions button)') + (r.note ? ' · ' + r.note : '') }),
            el('div', { class: 'actions' }, [
              btn('Edit', function () { fill(form, r); $('#schedule-submit').textContent = 'Save changes'; $('#schedule-cancel').hidden = false; form.scrollIntoView({ behavior: 'smooth' }); }),
              btn('Delete', function () { confirmDo('Delete this stop?', function () { api('DELETE', '/schedule/' + r.id).then(loadList).catch(fail); }); }, 'btn--danger')
            ])
          ]));
        });
      }).catch(fail);
    }
  }

  /* ── menu ────────────────────────────────────────────────────── */
  function menu() {
    var itemForm = $('#item-form');
    function resetItem() { itemForm.reset(); itemForm.elements.id.value = ''; $('#item-submit').textContent = 'Add item'; $('#item-cancel').hidden = true; }
    $('#item-cancel').addEventListener('click', resetItem);
    $('#category-form').addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/menu/categories', formData(e.target)).then(function () { e.target.reset(); toast('Category added'); load(); }).catch(fail);
    });
    itemForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(itemForm), id = d.id; delete d.id;
      (id ? api('PUT', '/menu/items/' + id, d) : api('POST', '/menu/items', d)).then(function () { toast(id ? 'Item updated' : 'Item added'); resetItem(); load(); }).catch(fail);
    });
    load();
    function load() {
      api('GET', '/menu').then(function (m) {
        state.categories = m.categories;
        var chips = $('#category-list'); chips.innerHTML = '';
        var sel = $('#item-category'); var keep = sel.value; sel.innerHTML = '';
        if (!m.categories.length) chips.appendChild(el('span', { class: 'muted', text: 'No categories yet.' }));
        m.categories.forEach(function (c, idx) {
          sel.appendChild(el('option', { value: c.id, text: c.name }));
          var mv = moveButtons(m.categories, idx, function (ids) { api('POST', '/menu/categories/reorder', { ids: ids }).then(load).catch(fail); });
          chips.appendChild(el('span', { class: 'chip' }, [
            c.name,
            el('button', { type: 'button', title: 'Rename', text: '✎', onclick: function () { var n = prompt('Rename category', c.name); if (n && n.trim()) api('PUT', '/menu/categories/' + c.id, { name: n.trim() }).then(load).catch(fail); } }),
            el('button', { type: 'button', title: 'Move up', text: '↑', onclick: function () { mv[0].click(); } }),
            el('button', { type: 'button', title: 'Move down', text: '↓', onclick: function () { mv[1].click(); } }),
            el('button', { type: 'button', title: 'Delete', text: '✕', onclick: function () { confirmDo('Delete "' + c.name + '" and every item in it?', function () { api('DELETE', '/menu/categories/' + c.id).then(load).catch(fail); }); } })
          ]));
        });
        if (keep) sel.value = keep;
        var list = $('#item-list'); list.innerHTML = '';
        if (!m.items.length) { list.appendChild(el('div', { class: 'empty', text: 'No menu items yet. The site shows "Menu coming soon" until you add one.' })); return; }
        m.categories.forEach(function (c) {
          var items = m.items.filter(function (i) { return i.category_id === c.id; });
          if (!items.length) return;
          list.appendChild(el('h3', { text: c.name }));
          items.forEach(function (i, idx) {
            list.appendChild(el('div', { class: 'list-item' }, [
              el('div', { class: 'title', text: i.name + ' · ' + price(i.price_cents) + (i.availability !== 'available' ? ' · ' + i.availability.replace('_', ' ') : '') }),
              i.description ? el('div', { class: 'meta', text: i.description }) : null,
              el('div', { class: 'actions' }, moveButtons(items, idx, function (ids) {
                // Keep other categories' items in place: reorder within this category only.
                var all = m.items.map(function (x) { return x.id; }).filter(function (id) { return ids.indexOf(id) < 0; });
                api('POST', '/menu/items/reorder', { ids: ids.concat(all) }).then(load).catch(fail);
              }).concat([
                btn('Edit', function () { fill(itemForm, { id: i.id, category_id: i.category_id, name: i.name, description: i.description, price: i.price_cents == null ? '' : (i.price_cents / 100).toFixed(2), availability: i.availability }); $('#item-submit').textContent = 'Save changes'; $('#item-cancel').hidden = false; itemForm.scrollIntoView({ behavior: 'smooth' }); }),
                btn(i.availability === 'sold_out' ? 'Mark available' : 'Mark sold out', function () {
                  api('PUT', '/menu/items/' + i.id, { category_id: i.category_id, name: i.name, description: i.description, price: i.price_cents == null ? '' : (i.price_cents / 100).toFixed(2), availability: i.availability === 'sold_out' ? 'available' : 'sold_out' }).then(load).catch(fail);
                }),
                btn('Delete', function () { confirmDo('Delete "' + i.name + '"?', function () { api('DELETE', '/menu/items/' + i.id).then(load).catch(fail); }); }, 'btn--danger')
              ]))
            ]));
          });
        });
      }).catch(fail);
    }
  }

  /* ── photos ──────────────────────────────────────────────────── */
  var PLACEMENTS = [['gallery', 'Gallery grid'], ['hero', 'Hero background (top of page)'], ['location', 'Where We Are photo'], ['menu', 'Menu photo'], ['story', 'Our Story photo'], ['catering', 'Catering photo'], ['contact', 'Contact photo']];
  function placementSelect(value) {
    var sel = el('select', { 'aria-label': 'Where this photo shows' });
    PLACEMENTS.forEach(function (p) { sel.appendChild(el('option', { value: p[0], text: p[1] })); });
    sel.value = value || 'gallery';
    return sel;
  }
  function resizeImage(file, max) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file); var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { blob ? resolve({ blob: blob, width: cw, height: ch, type: 'image/jpeg' }) : reject(new Error('Could not process image')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
      img.src = url;
    });
  }
  function photos() {
    var form = $('#photo-form');
    $('#placement-select').replaceWith(placementSelect('gallery'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var file = form.elements.file.files[0]; if (!file) return;
      var submit = $('#photo-submit'); submit.disabled = true; submit.textContent = 'Uploading…';
      resizeImage(file, 1600).then(function (r) {
        var fd = new FormData();
        fd.append('file', r.blob, 'photo.jpg'); fd.append('alt_text', form.elements.alt_text.value); fd.append('width', r.width); fd.append('height', r.height);
        var placement = form.querySelector('select').value;
        return api('POST', '/photos', fd, true).then(function (row) { return placement === 'gallery' ? row : api('PUT', '/photos/' + row.id, { alt_text: row.alt_text, placement: placement }); });
      }).then(function () { toast('Photo uploaded'); form.reset(); load(); }).catch(fail)
        .then(function () { submit.disabled = false; submit.textContent = 'Upload photo'; });
    });
    load();
    function load() {
      api('GET', '/photos').then(function (rows) {
        var grid = $('#photo-list'); grid.innerHTML = '';
        if (!rows.length) { grid.appendChild(el('div', { class: 'empty', text: 'No photos yet. The site shows "Photos coming soon" until you upload one.' })); return; }
        rows.forEach(function (p, idx) {
          var alt = el('input', { value: p.alt_text, maxlength: '200', 'aria-label': 'Photo description' });
          var place = placementSelect(p.placement);
          var save = function () { api('PUT', '/photos/' + p.id, { alt_text: alt.value, placement: place.value }).then(function () { toast('Photo saved'); }).catch(fail); };
          alt.addEventListener('change', save); place.addEventListener('change', save);
          grid.appendChild(el('div', { class: 'photo' }, [
            el('img', { src: '/photos/' + p.r2_key, alt: p.alt_text, loading: 'lazy' }),
            alt, place,
            el('div', { class: 'actions' }, moveButtons(rows, idx, function (ids) { api('POST', '/photos/reorder', { ids: ids }).then(load).catch(fail); }).concat([
              btn('Delete', function () { confirmDo('Delete this photo?', function () { api('DELETE', '/photos/' + p.id).then(load).catch(fail); }); }, 'btn--danger')
            ]))
          ]));
        });
      }).catch(fail);
    }
  }

  /* ── content / settings / trucks ─────────────────────────────── */
  function content() {
    var form = $('#settings-form');
    api('GET', '/settings').then(function (s) { fill(form, s); }).catch(fail);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      api('PUT', '/settings', formData(form)).then(function (s) { fill(form, s); toast('Saved'); boot(); }).catch(fail);
    });
    api('GET', '/trucks').then(function (trucks) {
      var list = $('#truck-list'); list.innerHTML = '';
      trucks.forEach(function (t) {
        var name = el('input', { value: t.label, maxlength: '60', 'aria-label': 'Truck name' });
        var active = el('input', { type: 'checkbox' }); active.checked = !!t.active;
        var save = btn('Save', function () { api('PUT', '/trucks/' + t.id, { label: name.value, active: active.checked }).then(function () { toast('Truck saved'); }).catch(fail); });
        list.appendChild(el('div', { class: 'row' }, [name, el('label', { class: 'row' }, [active, 'Shown on site']), save]));
      });
    }).catch(fail);
  }

  /* ── reviews ─────────────────────────────────────────────────── */
  function reviews() {
    var form = $('#review-form');
    function reset() { form.reset(); form.elements.id.value = ''; form.elements.source.value = 'Google'; $('#review-submit').textContent = 'Add quote'; $('#review-cancel').hidden = true; }
    $('#review-cancel').addEventListener('click', reset);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(form), id = d.id; delete d.id;
      (id ? api('PUT', '/reviews/' + id, d) : api('POST', '/reviews', d)).then(function () { toast(id ? 'Quote updated' : 'Quote added'); reset(); load(); }).catch(fail);
    });
    load();
    function load() {
      api('GET', '/reviews').then(function (rows) {
        var list = $('#review-list'); list.innerHTML = '';
        if (!rows.length) { list.appendChild(el('div', { class: 'empty', text: 'No quotes yet. The site shows "Reviews coming soon" until you add the rating or a quote.' })); return; }
        rows.forEach(function (r, idx) {
          list.appendChild(el('div', { class: 'list-item' }, [
            el('div', { class: 'title', text: r.reviewer_name + ' · ' + '★'.repeat(r.star_rating) + ' · ' + r.source }),
            el('div', { class: 'meta', text: r.quote }),
            el('div', { class: 'actions' }, moveButtons(rows, idx, function (ids) { api('POST', '/reviews/reorder', { ids: ids }).then(load).catch(fail); }).concat([
              btn('Edit', function () { fill(form, r); $('#review-submit').textContent = 'Save changes'; $('#review-cancel').hidden = false; form.scrollIntoView({ behavior: 'smooth' }); }),
              btn('Delete', function () { confirmDo('Delete this quote?', function () { api('DELETE', '/reviews/' + r.id).then(load).catch(fail); }); }, 'btn--danger')
            ]))
          ]));
        });
      }).catch(fail);
    }
  }

  /* ── inquiries ───────────────────────────────────────────────── */
  function inquiries() {
    load();
    function load() {
      api('GET', '/inquiries').then(function (rows) {
        var list = $('#inquiry-list'); list.innerHTML = '';
        if (!rows.length) { list.appendChild(el('div', { class: 'empty', text: 'No catering inquiries yet.' })); return; }
        rows.forEach(function (q) {
          var when = new Date(q.submitted_at).toLocaleString();
          list.appendChild(el('div', { class: 'list-item' }, [
            el('div', { class: 'title' }, [q.name + ' · ' + q.event_date + (q.headcount ? ' · ' + q.headcount + ' people' : '') + ' ', el('span', { class: 'status ' + q.notify_status, title: q.notify_error, text: 'email ' + q.notify_status.replace('_', ' ') })]),
            el('div', { class: 'meta' }, [el('a', { href: 'tel:' + q.phone.replace(/[^\d+]/g, ''), text: q.phone }), ' · ', el('a', { href: 'mailto:' + q.email, text: q.email }), q.event_location ? ' · ' + q.event_location : '']),
            q.message ? el('pre', { class: 'msg', text: q.message }) : null,
            el('div', { class: 'meta muted', text: 'Received ' + when + (q.notify_error ? ' · ' + q.notify_error : '') }),
            el('div', { class: 'actions' }, [btn('Delete', function () { confirmDo('Delete this inquiry?', function () { api('DELETE', '/inquiries/' + q.id).then(load).catch(fail); }); }, 'btn--danger')])
          ]));
        });
      }).catch(fail);
    }
  }

  boot();
})();
