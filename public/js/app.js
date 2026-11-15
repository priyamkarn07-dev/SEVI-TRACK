/* SEVI TRACK shared client helpers */
(function () {
  'use strict';
  const ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/>',
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Zm4 9a2 2 0 0 0 4 0" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/>',
    inbox: '<path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Zm0 0h5l1 3h6l1-3h5" stroke-linecap="round" stroke-linejoin="round"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" stroke-linecap="round" stroke-linejoin="round"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" stroke-linejoin="round"/>',
    chart: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" stroke-linecap="round"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" stroke-linecap="round" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4" stroke-linecap="round" stroke-linejoin="round"/>',
    bell2: '<path d="M12 8v5m0 3h.01M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<path d="M9 9h10v11H9V9Zm-4 6V4h10" stroke-linecap="round" stroke-linejoin="round"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>'
  };
  const icon = (n, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso, withTime = true) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString(undefined, withTime
      ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
  const badge = (s) => `<span class="badge ${esc(s)}">${esc(cap(s))}</span>`;
  const safeLink = (u) => /^https?:\/\//i.test(u || '') ? u : '#';

  async function api(path, opts = {}) {
    const o = { credentials: 'same-origin', ...opts, headers: { ...(opts.headers || {}) } };
    if (o.body && !(o.body instanceof FormData) && typeof o.body !== 'string') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    let res;
    try { res = await fetch('/api' + path, o); }
    catch { const e = new Error('Network error. Check your connection and try again.'); e.network = true; throw e; }
    let data = null;
    try { data = await res.json(); } catch { /* non-json */ }
    if (!res.ok) {
      const e = new Error((data && data.error) || `Request failed (${res.status})`);
      e.status = res.status; e.fields = data && data.fields; throw e;
    }
    return data;
  }

  function toast(msg, type = 'info', ms = 4500) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<span class="ti">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><div>${esc(msg)}</div>`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  function setLoading(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.classList.add('loading'); btn.disabled = true; if (label) btn.firstChild && (btn.innerHTML = esc(label)); }
    else { btn.classList.remove('loading'); btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  function copyText(text) {
    const done = () => toast('Copied: ' + text, 'success', 2200);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { toast('Copy failed', 'error'); }
      ta.remove();
    }
  }

  // ---- form field error helpers ----
  function clearErrors(form) {
    form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    form.querySelectorAll('.err').forEach((e) => { e.textContent = ''; });
  }
  function showFieldError(form, name, msg) {
    const el = form.querySelector(`[data-field="${name}"]`);
    if (!el) return false;
    el.classList.add('invalid');
    const err = el.querySelector('.err');
    if (err) err.textContent = msg;
    return true;
  }
  function applyErrors(form, fields) {
    let first = null;
    Object.entries(fields || {}).forEach(([k, m]) => {
      if (showFieldError(form, k, m) && !first) first = form.querySelector(`[data-field="${k}"]`);
    });
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = first.querySelector('input,select,textarea'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 350); }
    return first;
  }
  function banner(form, msg, type = 'error') {
    const b = form.querySelector('.form-alert');
    if (!b) return;
    b.className = 'form-alert show ' + type; b.textContent = msg;
  }
  function hideBanner(form) { const b = form.querySelector('.form-alert'); if (b) b.className = 'form-alert'; }

  // ---- header ----
  const state = { user: null };
  async function getUser() {
    try { state.user = (await api('/auth/me')).user; } catch { state.user = null; }
    return state.user;
  }

  async function renderHeader(active) {
    const host = document.getElementById('site-header');
    if (!host) return;
    const u = await getUser();
    const links = [];
    links.push(['/', 'Home', 'home']);
    if (u && u.role === 'admin') {
      links.push(['/admin', 'Admin Dashboard', 'admin']);
    } else {
      links.push(['/submit.html', 'Submit Ad', 'submit']);
      if (u) links.push(['/dashboard.html', 'My Dashboard', 'dashboard']);
    }
    const nav = links.map(([h, t, k]) => `<a class="nl ${active === k ? 'active' : ''}" href="${h}">${t}${k === 'dashboard' ? '<span class="badge-dot hidden" id="nav-unread">0</span>' : ''}</a>`).join('');
    const auth = u
      ? `<span class="sep"></span><span class="small muted" style="padding:0 6px">${esc(u.name.split(' ')[0])}</span><button class="btn btn-sm btn-ghost" id="logout-btn" type="button">Sign out</button>`
      : `<span class="sep"></span><a class="nl ${active === 'login' ? 'active' : ''}" href="/login.html">Sign in</a><a class="btn btn-sm btn-primary" href="/login.html?tab=register">Get started</a>`;
    host.innerHTML = `<header class="site-header"><div class="container">
      <a class="brand" href="/" aria-label="SEVI TRACK home"><img src="/assets/logo-mark.svg" alt="" width="36" height="36"><span>SEVI<b>TRACK</b></span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false" type="button">${icon('menu')}</button>
      <nav class="nav" id="main-nav" aria-label="Main">${nav}${auth}</nav></div></header>`;
    const toggle = document.getElementById('nav-toggle'); const navEl = document.getElementById('main-nav');
    toggle.addEventListener('click', () => { const o = navEl.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); });
    navEl.addEventListener('click', (e) => { if (e.target.closest('a')) navEl.classList.remove('open'); });
    const lo = document.getElementById('logout-btn');
    if (lo) lo.addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} location.href = '/'; });
    if (u && u.role !== 'admin') refreshUnread();
  }

  async function refreshUnread() {
    try {
      const { unread } = await api('/notifications');
      const el = document.getElementById('nav-unread');
      if (el) { el.textContent = unread > 99 ? '99+' : unread; el.classList.toggle('hidden', !unread); }
      return unread;
    } catch { /* ignore */ }
  }

  function renderFooter() {
    const host = document.getElementById('site-footer');
    if (!host) return;
    host.innerHTML = `<footer class="site-footer"><div class="container">
      <div class="brand" style="font-size:1rem"><img src="/assets/logo-mark.svg" alt="" width="28" height="28"><span>SEVI<b>TRACK</b></span></div>
      <div>&copy; ${new Date().getFullYear()} SEVI TRACK. All rights reserved.</div>
      <div><a href="/admin-login.html">Admin</a></div></div></footer>`;
  }

  function observeFade() {
    const els = document.querySelectorAll('.fade-up');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  function initPassToggles() {
    document.querySelectorAll('.pw-wrap button').forEach((b) => b.addEventListener('click', () => {
      const i = b.parentElement.querySelector('input'); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
    }));
  }

  // ---- modal ----
  function openModal(id) { const m = document.getElementById(id); m.classList.add('open'); document.body.style.overflow = 'hidden'; const f = m.querySelector('input,select,textarea,button.x'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 50); }
  function closeModal(id) { const m = document.getElementById(id); m.classList.remove('open'); if (!document.querySelector('.modal.open')) document.body.style.overflow = ''; }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) closeModal(c.closest('.modal').id);
    else if (e.target.classList && e.target.classList.contains('modal')) closeModal(e.target.id);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach((m) => closeModal(m.id)); });

  // ---- image picker w/ preview ----
  function initImagePicker(root, { maxMB = 5, onChange } = {}) {
    const input = root.querySelector('input[type=file]');
    const dz = root.querySelector('.dropzone');
    const prev = root.querySelector('.preview');
    const img = prev.querySelector('img');
    const meta = prev.querySelector('.meta-text');
    const rm = prev.querySelector('[data-remove]');
    let url = null;
    const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    function fail(msg) { const f = root.closest('.field') || root; f.classList.add('invalid'); const er = f.querySelector('.err'); if (er) er.textContent = msg; reset(false); }
    function reset(clearErr = true) {
      input.value = ''; if (url) URL.revokeObjectURL(url); url = null;
      prev.classList.remove('show'); img.removeAttribute('src');
      if (clearErr) { const f = root.closest('.field') || root; f.classList.remove('invalid'); }
      onChange && onChange(null);
    }
    function set(file) {
      if (!file) return;
      if (!TYPES.includes(file.type)) return fail('Only JPG, PNG, WEBP or GIF images are allowed.');
      if (file.size > maxMB * 1048576) return fail(`Image must be ${maxMB} MB or smaller.`);
      (root.closest('.field') || root).classList.remove('invalid');
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(file); img.src = url;
      meta.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      prev.classList.add('show'); onChange && onChange(file);
    }
    input.addEventListener('change', () => set(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { try { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; } catch {} set(f); } });
    rm.addEventListener('click', () => reset());
    return { reset, setExisting(src, label) { img.src = src; meta.textContent = label || 'Current image'; prev.classList.add('show'); } };
  }

  // ---- shared ad form (submit + edit) ----
  async function loadMeta() { return api('/meta'); }
  function fillSelects(form, meta) {
    const cat = form.querySelector('[name=category_id]');
    cat.innerHTML = '<option value="">Select a category…</option>' + meta.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    const type = form.querySelector('.type-cards');
    type.innerHTML = meta.ad_types.map((t, i) => `<label><input type="radio" name="ad_type" value="${esc(t)}" ${i === 0 ? '' : ''}><span>${esc(t)}</span></label>`).join('');
    const dur = form.querySelector('.dur-cards');
    dur.innerHTML = meta.durations.map((d) => `<label><input type="radio" name="duration_days" value="${d}"><span>${d} days</span></label>`).join('');
  }

  /** Client-side validation that mirrors server rules. Returns {fields}. */
  function validateAdForm(form, { imageRequired }) {
    const f = {}; const v = (n) => (form.elements[n]?.value || '').trim();
    if (v('full_name').length < 2) f.full_name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) f.email = 'Enter a valid email address.';
    const d = v('whatsapp').replace(/\D/g, '');
    if (!/^\+?[\d\s\-()]+$/.test(v('whatsapp')) || d.length < 8 || d.length > 15) f.whatsapp = 'Enter a valid WhatsApp number with country code (8–15 digits).';
    if (v('company').length < 2) f.company = 'Enter your business / company name.';
    if (v('title').length < 3) f.title = 'Advertisement title must be at least 3 characters.';
    if (!v('category_id')) f.category_id = 'Select a category.';
    if (v('description').length < 20) f.description = 'Description must be at least 20 characters.';
    const urlOk = (x, hosts) => { if (!x) return true; try { const u = new URL(/^https?:\/\//i.test(x) ? x : 'https://' + x); if (!u.hostname.includes('.')) return false; return !hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; } };
    if (!urlOk(v('website_url'))) f.website_url = 'Enter a valid website URL.';
    if (!urlOk(v('social_url'), ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'instagr.am'])) f.social_url = 'Enter a valid Instagram or Facebook link.';
    if (!form.querySelector('[name=ad_type]:checked')) f.ad_type = 'Select an advertisement type.';
    if (!form.querySelector('[name=duration_days]:checked')) f.duration_days = 'Select an advertisement duration.';
    if (v('instructions').length > 1000) f.instructions = 'Keep additional instructions under 1000 characters.';
    if (imageRequired && !(form.elements.image.files && form.elements.image.files[0])) f.image = 'Please upload an advertisement image or banner.';
    return f;
  }

  window.ST = {
    api, esc, fmtDate, cap, badge, safeLink, toast, setLoading, copyText, icon,
    clearErrors, applyErrors, banner, hideBanner, getUser, state,
    renderHeader, renderFooter, refreshUnread, observeFade, initPassToggles,
    openModal, closeModal, initImagePicker, loadMeta, fillSelects, validateAdForm
  };
  document.addEventListener('DOMContentLoaded', () => { renderFooter(); observeFade(); });
})();
