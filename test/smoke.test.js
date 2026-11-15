import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sevi-test-'));
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPass123';
const { app } = await import('../server.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

// minimal 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let b = body;
    if (body && !(body instanceof FormData)) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
    const r = await fetch(base + url, { method, headers: h, body: b, redirect: 'manual' });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const [kv] = c.split(';'); if (kv.endsWith('=')) this.cookie = ''; else this.cookie = kv; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, data, headers: r.headers };
  }
}
const adForm = (over = {}, img = PNG, name = 'banner.png') => {
  const v = { full_name: 'Amina Rahman', email: 'amina@example.com', whatsapp: '+1 555 123 4567', company: 'Rahman Co', title: 'Summer Launch',
    category_id: '1', description: 'A long enough description of the advert.', website_url: 'rahman.co', social_url: 'https://instagram.com/rahman',
    ad_type: 'Banner Ad', duration_days: '30', instructions: 'None', ...over };
  const fd = new FormData();
  for (const [k, val] of Object.entries(v)) if (val !== null) fd.append(k, val);
  if (img) fd.append('image', new Blob([img]), name);
  return fd;
};

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

const user = new Client(), admin = new Client(), other = new Client(), anon = new Client();
let code;

console.log('SEVI TRACK smoke tests');
await t('public pages served', async () => {
  for (const p of ['/', '/submit.html', '/login.html', '/dashboard.html', '/admin-login.html']) assert.equal((await anon.req('GET', p)).status, 200, p);
  assert.equal((await anon.req('GET', '/nope')).status, 404);
});
await t('admin page + assets protected from anonymous & users', async () => {
  for (const p of ['/admin', '/admin/admin.js', '/admin/admin.css']) {
    const r = await anon.req('GET', p); assert.equal(r.status, 302, p); assert.match(r.headers.get('location'), /admin-login/);
  }
  assert.equal((await anon.req('GET', '/private/admin.js')).status, 404);
});
await t('meta lists the 8 categories', async () => {
  const { data } = await anon.req('GET', '/api/meta');
  assert.deepEqual(data.categories.map((c) => c.name).sort(), ['Affiliate Marketing', 'Business Promotion', 'Education', 'Online Courses', 'Other', 'Products', 'Services', 'Social Media Promotion']);
});
await t('registration validation', async () => {
  let r = await user.req('POST', '/api/auth/register', { name: 'A', email: 'bad', password: 'short' });
  assert.equal(r.status, 400); assert.ok(r.data.fields.name && r.data.fields.email && r.data.fields.password);
});
await t('register + session + me', async () => {
  let r = await user.req('POST', '/api/auth/register', { name: 'Amina Rahman', email: 'Amina@Example.com', password: 'Secret123' });
  assert.equal(r.status, 201); assert.equal(r.data.user.role, 'user');
  r = await user.req('GET', '/api/auth/me'); assert.equal(r.data.user.email, 'amina@example.com');
  r = await anon.req('POST', '/api/auth/register', { name: 'Dup', email: 'amina@example.com', password: 'Secret123' });
  assert.equal(r.status, 409);
});
await t('unauthenticated cannot submit', async () => {
  assert.equal((await anon.req('POST', '/api/ads', adForm())).status, 401);
});
await t('required-field validation on submit', async () => {
  const r = await user.req('POST', '/api/ads', adForm({ full_name: '', email: 'x', whatsapp: 'abc', company: '', title: '', category_id: '999', description: 'short', website_url: 'not a url', social_url: 'https://evil.com/x', ad_type: 'Nope', duration_days: '5' }, null));
  assert.equal(r.status, 400);
  for (const k of ['full_name', 'email', 'whatsapp', 'company', 'title', 'category_id', 'description', 'website_url', 'social_url', 'ad_type', 'duration_days', 'image']) assert.ok(r.data.fields[k], 'missing error for ' + k);
});
await t('upload security: fake image, svg, html, oversize rejected', async () => {
  for (const [buf, name] of [[Buffer.from('<script>alert(1)</script>'.padEnd(64, ' ')), 'x.png'], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg'], [Buffer.from('GIF89'), 'x.gif']]) {
    const r = await user.req('POST', '/api/ads', adForm({}, buf, name)); assert.equal(r.status, 400, name); assert.ok(r.data.fields.image);
  }
  const big = Buffer.concat([PNG, Buffer.alloc(5.5 * 1024 * 1024)]);
  const r = await user.req('POST', '/api/ads', adForm({}, big)); assert.equal(r.status, 400); assert.match(r.data.fields.image, /5 MB/);
  assert.equal(fs.readdirSync(path.join(process.env.DATA_DIR, 'uploads')).length, 0, 'no orphan files stored');
});
await t('successful submission -> unique ID, pending, notification', async () => {
  const r = await user.req('POST', '/api/ads', adForm()); assert.equal(r.status, 201);
  code = r.data.ad.ad_code; assert.match(code, /^STA-\d{8}-[A-Z0-9]{6}$/); assert.equal(r.data.ad.status, 'pending');
  assert.equal(r.data.ad.website_url, 'https://rahman.co/');
  const r2 = await user.req('POST', '/api/ads', adForm({ title: 'Second ad' })); assert.notEqual(r2.data.ad.ad_code, code);
  const nt = (await user.req('GET', '/api/notifications')).data;
  assert.equal(nt.unread, 2); assert.equal(nt.notifications[0].type, 'submitted'); assert.match(nt.notifications[0].message, /STA-/);
});
await t('submission is persisted to disk db (survives re-open)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(path.join(process.env.DATA_DIR, 'sevi.db'));
  assert.equal(d.prepare('SELECT COUNT(*) c FROM ads').get().c, 2); d.close();
  assert.equal(fs.readdirSync(path.join(process.env.DATA_DIR, 'uploads')).length, 2);
});
await t('image served with correct type, only to owner/admin', async () => {
  let r = await user.req('GET', `/api/ads/${code}/image`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await anon.req('GET', `/api/ads/${code}/image`)).status, 401);
  await other.req('POST', '/api/auth/register', { name: 'Other Person', email: 'other@example.com', password: 'Secret123' });
  assert.equal((await other.req('GET', `/api/ads/${code}/image`)).status, 404);
  assert.equal((await other.req('GET', `/api/ads/${code}`)).status, 404);
  assert.equal((await other.req('GET', '/api/ads/mine')).data.ads.length, 0);
});
await t('role-based access: user & anon blocked from admin API', async () => {
  for (const c of [user, other, anon]) for (const p of ['/api/admin/ads', '/api/admin/stats', '/api/admin/categories', '/api/admin/users']) {
    const r = await c.req('GET', p); assert.ok([401, 403].includes(r.status), p + ' ' + r.status);
  }
  assert.equal((await user.req('POST', `/api/admin/ads/${code}/status`, { status: 'approved' })).status, 403);
  assert.equal((await user.req('DELETE', `/api/admin/ads/${code}`)).status, 403);
  assert.equal((await user.req('GET', '/admin')).status, 302);
});
await t('admin login: wrong password, user via admin portal rejected', async () => {
  assert.equal((await anon.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'wrong', portal: 'admin' })).status, 401);
  assert.equal((await anon.req('POST', '/api/auth/login', { email: 'amina@example.com', password: 'Secret123', portal: 'admin' })).status, 401);
  const r = await admin.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123', portal: 'admin' });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin');
  assert.equal((await admin.req('GET', '/admin')).status, 200);
  assert.equal((await admin.req('GET', '/admin/admin.js')).status, 200);
});
await t('admin sees all ads with advertiser details', async () => {
  const r = await admin.req('GET', '/api/admin/ads'); assert.equal(r.data.ads.length, 2);
  assert.ok(r.data.ads[0].email && r.data.ads[0].whatsapp && r.data.ads[0].image_url);
  assert.equal((await admin.req('GET', `/api/ads/${code}/image`)).status, 200);
});
await t('search + status + category filters', async () => {
  let r = await admin.req('GET', '/api/admin/ads?q=Second'); assert.equal(r.data.ads.length, 1);
  r = await admin.req('GET', `/api/admin/ads?q=${code}`); assert.equal(r.data.ads.length, 1);
  r = await admin.req('GET', '/api/admin/ads?q=%25'); assert.equal(r.data.ads.length, 0, 'wildcards escaped');
  r = await admin.req('GET', '/api/admin/ads?q=' + encodeURIComponent("' OR 1=1 --")); assert.equal(r.data.ads.length, 0);
  r = await admin.req('GET', '/api/admin/ads?status=pending'); assert.equal(r.data.ads.length, 2);
  r = await admin.req('GET', '/api/admin/ads?status=approved'); assert.equal(r.data.ads.length, 0);
  r = await admin.req('GET', '/api/admin/ads?category=1'); assert.equal(r.data.ads.length, 2);
  r = await admin.req('GET', '/api/admin/ads?category=2'); assert.equal(r.data.ads.length, 0);
});
await t('approve updates record + notifies user + history', async () => {
  const r = await admin.req('POST', `/api/admin/ads/${code}/status`, { status: 'approved' });
  assert.equal(r.status, 200); assert.equal(r.data.ad.status, 'approved');
  const mine = (await user.req('GET', '/api/ads/mine')).data.ads.find((a) => a.ad_code === code); assert.equal(mine.status, 'approved');
  const nt = (await user.req('GET', '/api/notifications')).data.notifications[0]; assert.equal(nt.type, 'approved'); assert.equal(nt.is_read, false);
  const d = (await user.req('GET', `/api/ads/${code}`)).data; assert.ok(d.history.some((h) => h.event === 'Status changed to approved'));
  assert.equal(d.ad.admin_note, undefined, 'admin-only fields hidden from user');
  assert.equal((await admin.req('POST', `/api/admin/ads/${code}/status`, { status: 'approved' })).status, 409);
});
await t('user cannot edit non-pending ad; can edit pending', async () => {
  assert.equal((await user.req('PUT', `/api/ads/${code}`, adForm({ title: 'Hack' }))).status, 409);
  const second = (await user.req('GET', '/api/ads/mine')).data.ads.find((a) => a.title === 'Second ad');
  const r = await user.req('PUT', `/api/ads/${second.ad_code}`, adForm({ title: 'Second ad edited' }, null)); assert.equal(r.status, 200); assert.equal(r.data.ad.title, 'Second ad edited');
  assert.equal((await other.req('PUT', `/api/ads/${second.ad_code}`, adForm({ title: 'Steal' }))).status, 404);
  const bad = await user.req('PUT', `/api/ads/${second.ad_code}`, adForm({ title: '' }, null)); assert.equal(bad.status, 400);
});
await t('reject requires reason; reason visible to user + notification', async () => {
  const second = (await user.req('GET', '/api/ads/mine')).data.ads.find((a) => a.title === 'Second ad edited');
  assert.equal((await admin.req('POST', `/api/admin/ads/${second.ad_code}/status`, { status: 'rejected' })).status, 400);
  const r = await admin.req('POST', `/api/admin/ads/${second.ad_code}/status`, { status: 'rejected', reason: 'Image is blurry' }); assert.equal(r.status, 200);
  const mine = (await user.req('GET', '/api/ads/mine')).data.ads.find((a) => a.ad_code === second.ad_code);
  assert.equal(mine.status, 'rejected'); assert.equal(mine.rejection_reason, 'Image is blurry');
  const nt = (await user.req('GET', '/api/notifications')).data.notifications[0]; assert.equal(nt.type, 'rejected'); assert.match(nt.message, /Image is blurry/);
  const h = (await user.req('GET', '/api/history')).data.history; assert.ok(h.length >= 4);
});
await t('publish sets expiry; auto-expire moves to expired', async () => {
  let r = await admin.req('POST', `/api/admin/ads/${code}/status`, { status: 'published' }); assert.equal(r.data.ad.status, 'published'); assert.ok(r.data.ad.expires_at);
  const { db } = await import('../src/db.js'); const { expireDue } = await import('../src/ads.js');
  db.prepare('UPDATE ads SET expires_at=? WHERE ad_code=?').run(new Date(Date.now() - 1000).toISOString(), code);
  assert.equal(expireDue(), 1);
  const mine = (await user.req('GET', '/api/ads/mine')).data.ads.find((a) => a.ad_code === code); assert.equal(mine.status, 'expired');
  assert.equal((await user.req('GET', '/api/notifications')).data.notifications[0].type, 'expired');
});
await t('admin edit updates record, replaces image, notifies', async () => {
  const r = await admin.req('PUT', `/api/admin/ads/${code}`, (() => { const f = adForm({ title: 'Edited by admin', admin_note: 'checked' }); return f; })());
  assert.equal(r.status, 200); assert.equal(r.data.ad.title, 'Edited by admin'); assert.equal(r.data.ad.admin_note, 'checked');
  assert.equal(fs.readdirSync(path.join(process.env.DATA_DIR, 'uploads')).length, 2, 'old image removed on replace');
});
await t('notifications: mark read / read-all, isolated per user', async () => {
  const nt = (await user.req('GET', '/api/notifications')).data; const first = nt.notifications[0];
  await other.req('POST', `/api/notifications/${first.id}/read`);
  assert.equal((await user.req('GET', '/api/notifications')).data.unread, nt.unread, 'other user cannot mark mine');
  await user.req('POST', `/api/notifications/${first.id}/read`);
  assert.equal((await user.req('GET', '/api/notifications')).data.unread, nt.unread - 1);
  await user.req('POST', '/api/notifications/read-all'); assert.equal((await user.req('GET', '/api/notifications')).data.unread, 0);
});
await t('category management: add, rename, dup, deactivate, delete rules', async () => {
  let r = await admin.req('POST', '/api/admin/categories', { name: 'Real Estate' }); assert.equal(r.status, 201); const id = r.data.category.id;
  assert.equal((await admin.req('POST', '/api/admin/categories', { name: 'real estate' })).status, 409);
  assert.equal((await admin.req('PATCH', `/api/admin/categories/${id}`, { name: 'Property' })).data.category.name, 'Property');
  assert.ok((await anon.req('GET', '/api/meta')).data.categories.some((c) => c.name === 'Property'));
  await admin.req('PATCH', `/api/admin/categories/${id}`, { active: false });
  assert.ok(!(await anon.req('GET', '/api/meta')).data.categories.some((c) => c.name === 'Property'));
  assert.equal((await user.req('POST', '/api/ads', adForm({ category_id: String(id) }))).status, 400, 'inactive category rejected');
  assert.equal((await admin.req('DELETE', '/api/admin/categories/1')).status, 409, 'in-use category cannot be deleted');
  assert.equal((await admin.req('DELETE', `/api/admin/categories/${id}`)).status, 200);
});
await t('admin delete removes record + image + related notifications', async () => {
  const before = fs.readdirSync(path.join(process.env.DATA_DIR, 'uploads')).length;
  assert.equal((await admin.req('DELETE', `/api/admin/ads/${code}`)).status, 200);
  assert.equal((await admin.req('GET', `/api/admin/ads/${code}`)).status, 404);
  assert.equal((await user.req('GET', '/api/ads/mine')).data.ads.length, 1);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(fs.readdirSync(path.join(process.env.DATA_DIR, 'uploads')).length, before - 1);
});
await t('stats are real counts', async () => {
  const s = (await admin.req('GET', '/api/admin/stats')).data; assert.equal(s.total, 1); assert.equal(s.by_status.rejected, 1); assert.equal(s.users, 2);
});
await t('password change: wrong current rejected, works, old login fails', async () => {
  assert.equal((await other.req('POST', '/api/auth/password', { current_password: 'nope', new_password: 'NewPass123' })).status, 400);
  assert.equal((await other.req('POST', '/api/auth/password', { current_password: 'Secret123', new_password: 'weak' })).status, 400);
  assert.equal((await other.req('POST', '/api/auth/password', { current_password: 'Secret123', new_password: 'NewPass123' })).status, 200);
  assert.equal((await anon.req('POST', '/api/auth/login', { email: 'other@example.com', password: 'Secret123' })).status, 401);
  assert.equal((await anon.req('POST', '/api/auth/login', { email: 'other@example.com', password: 'NewPass123' })).status, 200);
});
await t('CSRF: cross-origin writes blocked; security headers present', async () => {
  const r = await user.req('POST', '/api/auth/logout', {}, { origin: 'https://evil.example' }); assert.equal(r.status, 403);
  const p = await anon.req('GET', '/'); assert.match(p.headers.get('content-security-policy'), /script-src 'self'/); assert.equal(p.headers.get('x-content-type-options'), 'nosniff');
});
await t('XSS payloads stored verbatim and never executed server-side (escaped by client)', async () => {
  const r = await user.req('POST', '/api/ads', adForm({ title: '<img src=x onerror=alert(1)>' })); assert.equal(r.status, 201);
  assert.equal(r.data.ad.title, '<img src=x onerror=alert(1)>');
});
await t('login rate limiting', async () => {
  let last; for (let i = 0; i < 12; i++) last = await anon.req('POST', '/api/auth/login', { email: 'rl@example.com', password: 'x' });
  assert.equal(last.status, 429);
});
await t('logout invalidates session', async () => {
  await user.req('POST', '/api/auth/logout'); assert.equal((await user.req('GET', '/api/auth/me')).data.user, null);
});

console.log(`\n${n} tests passed${process.exitCode ? ' (with failures)' : ''}`);
server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
setTimeout(() => process.exit(process.exitCode || 0), 100);
