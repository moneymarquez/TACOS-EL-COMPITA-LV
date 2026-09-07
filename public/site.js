// El Compita - progressive enhancement only. Everything works without this file.
(function () {
  'use strict';

  /* Lightbox */
  var lb = document.getElementById('lightbox');
  if (lb && typeof lb.showModal === 'function') {
    var img = lb.querySelector('.lightbox__img');
    var cap = lb.querySelector('.lightbox__caption');
    document.querySelectorAll('.gallery__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        img.src = btn.getAttribute('data-full');
        img.alt = btn.getAttribute('data-alt') || '';
        cap.textContent = img.alt;
        lb.showModal();
      });
    });
    lb.querySelector('[data-close]').addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('close', function () { img.removeAttribute('src'); });
  }

  /* Catering form: submit in place, keep the user's input on failure */
  var form = document.getElementById('catering-form');
  var status = document.getElementById('form-status');
  if (form && window.fetch) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      btn.disabled = true;
      show('', '');
      fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false, error: 'Server error ' + res.status }; })
          .then(function (body) { return { res: res, body: body }; });
      }).then(function (r) {
        if (r.res.ok && r.body.ok) {
          form.reset();
          show('ok', 'Thanks! Your inquiry is in. We will get back to you soon.');
        } else {
          var msg = (r.body.errors && r.body.errors.join(' ')) || r.body.error || 'Something went wrong. Please try again.';
          show('err', msg + ' Your details are still filled in below.');
        }
      }).catch(function () {
        show('err', 'Could not reach the server. Check your connection and try again. Your details are still filled in below.');
      }).then(function () { btn.disabled = false; });
    });
  }
  function show(kind, msg) {
    if (!status) return;
    status.innerHTML = '';
    if (!msg) return;
    var p = document.createElement('p');
    p.className = 'notice notice--' + kind;
    p.textContent = msg;
    status.appendChild(p);
    status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* Clean the ?inquiry=... query left by a no-JS submit */
  if (window.history && /[?&]inquiry=/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
  }
})();
