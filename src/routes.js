import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { db, now, UPLOAD_DIR } from './db.js';
import {
  createSession, destroySession, destroyOtherSessions, requireAuth, requireRole, rateLimit
} from './auth.js';
import {
  findByCode, serializeAd, createAd, updateAd, deleteAd, changeStatus, SELECT
} from './ads.js';
import {
  validateAd, validatePassword, isEmail, clean, sniffImage, AD_TYPES, DURATIONS, STATUSES
} from './validate.js';

export const router = express.Router();
const MAX_IMAGE = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1, fields: 30, fieldSize: 20000 } });

const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); } };
const categoryExists = (id) => !!db.prepare('SELECT 1 FROM categories WHERE id=? AND active=1').get(id);
const categoryExistsAny = (id) => !!db.prepare('SELECT 1 FROM categories WHERE id=?').get(id);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, whatsapp: u.whatsapp, role: u.role });

function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Validation failed.', fields: { image: 'Image must be 5 MB or smaller.' } });
    return res.status(400).json({ error: 'Upload failed.', fields: { image: 'Could not process the uploaded file.' } });
  });
}
/** returns {img} or {error} - image verified by magic bytes */
function readImage(req, { required }) {
  if (!req.file) return required ? { error: 'Please upload an advertisement image or banner.' } : { img: null };
  const kind = sniffImage(req.file.buffer);
  if (!kind) return { error: 'Only JPG, PNG, WEBP or GIF images are allowed.' };
  return { img: { buffer: req.file.buffer, ...kind } };
}

// ================= AUTH =================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  key: (req) => `login:${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.'
});
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: (req) => `reg:${req.ip}` });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/auth/register', registerLimiter, wrap((req, res) => {
  const b = req.body || {};
  const fields = {};
  const name = clean(b.name);
  const email = clean(b.email).toLowerCase();
  const whatsapp = clean(b.whatsapp);
  if (name.length < 2 || name.length > 100) fields.name = 'Enter your full name.';
  if (!isEmail(email)) fields.email = 'Enter a valid email address.';
  if (whatsapp && !/^\+?[\d\s\-()]{8,20}$/.test(whatsapp)) fields.whatsapp = 'Enter a valid WhatsApp number.';
  const pe = validatePassword(b.password);
  if (pe) fields.password = pe;
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'An account with this email already exists.', fields: { email: 'This email is already registered.' } });
  const hash = bcrypt.hashSync(b.password, 12);
  const r = db.prepare("INSERT INTO users (name,email,whatsapp,password_hash,role) VALUES (?,?,?,?,'user')")
    .run(name, email, whatsapp || null, hash);
  createSession(res, req, Number(r.lastInsertRowid));
  res.status(201).json({ user: publicUser({ id: Number(r.lastInsertRowid), name, email, whatsapp, role: 'user' }) });
}));

router.post('/auth/login', loginLimiter, wrap((req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const portal = req.body?.portal === 'admin' ? 'admin' : 'user';
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok || (portal === 'admin' && u.role !== 'admin'))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  createSession(res, req, u.id);
  res.json({ user: publicUser(u) });
}));

router.post('/auth/logout', wrap((req, res) => { destroySession(req, res); res.json({ ok: true }); }));
router.get('/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

router.post('/auth/password', requireAuth, rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (r) => `pw:${r.user?.id}` }), wrap((req, res) => {
  const { current_password, new_password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (typeof current_password !== 'string' || !bcrypt.compareSync(current_password, u.password_hash))
    return res.status(400).json({ error: 'Current password is incorrect.', fields: { current_password: 'Current password is incorrect.' } });
  const pe = validatePassword(new_password);
  if (pe) return res.status(400).json({ error: pe, fields: { new_password: pe } });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(new_password, 12), u.id);
  destroyOtherSessions(u.id, req);
  res.json({ ok: true });
}));

router.patch('/auth/profile', requireAuth, wrap((req, res) => {
  const name = clean(req.body?.name);
  const whatsapp = clean(req.body?.whatsapp);
  const fields = {};
  if (name.length < 2 || name.length > 100) fields.name = 'Enter your full name.';
  if (whatsapp && !/^\+?[\d\s\-()]{8,20}$/.test(whatsapp)) fields.whatsapp = 'Enter a valid WhatsApp number.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  db.prepare('UPDATE users SET name=?, whatsapp=? WHERE id=?').run(name, whatsapp || null, req.user.id);
  res.json({ user: publicUser({ ...req.user, name, whatsapp: whatsapp || null }) });
}));

// ================= PUBLIC META =================
router.get('/meta', (_req, res) => {
  res.json({
    categories: db.prepare('SELECT id,name FROM categories WHERE active=1 ORDER BY name').all(),
    ad_types: AD_TYPES, durations: DURATIONS, statuses: STATUSES, max_image_mb: MAX_IMAGE / 1048576
  });
});

// ================= USER ADS =================
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (r) => `submit:${r.user?.id}`, message: 'Submission limit reached. Please try again later.' });

router.post('/ads', requireAuth, submitLimiter, handleUpload, wrap((req, res) => {
  const { errors, values } = validateAd(req.body, { categoryExists });
  const { img, error } = readImage(req, { required: true });
  if (error) errors.image = error;
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
  const ad = createAd(req.user, values, img);
  res.status(201).json({ ad: serializeAd(ad) });
}));

router.get('/ads/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT} WHERE a.user_id=? ORDER BY a.created_at DESC, a.id DESC`).all(req.user.id);
  res.json({ ads: rows.map((a) => serializeAd(a)) });
});

router.get('/history', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT h.id,h.event,h.status,h.actor_role,h.note,h.created_at,a.ad_code,a.title
    FROM ad_history h JOIN ads a ON a.id=h.ad_id WHERE a.user_id=? ORDER BY h.id DESC LIMIT 300`).all(req.user.id);
  res.json({ history: rows });
});

function ownAd(req, res) {
  const ad = findByCode(req.params.code);
  if (!ad || (ad.user_id !== req.user.id && req.user.role !== 'admin')) { res.status(404).json({ error: 'Advertisement not found.' }); return null; }
  return ad;
}

router.get('/ads/:code', requireAuth, (req, res) => {
  const ad = ownAd(req, res); if (!ad) return;
  const history = db.prepare('SELECT event,status,actor_role,note,created_at FROM ad_history WHERE ad_id=? ORDER BY id DESC').all(ad.id);
  res.json({ ad: serializeAd(ad, { admin: req.user.role === 'admin' }), history });
});

router.put('/ads/:code', requireAuth, handleUpload, wrap((req, res) => {
  const ad = ownAd(req, res); if (!ad) return;
  if (ad.user_id !== req.user.id) return res.status(403).json({ error: 'Use the admin dashboard to edit other users\' advertisements.' });
  if (ad.status !== 'pending') return res.status(409).json({ error: 'Only pending advertisements can be edited.' });
  const { errors, values } = validateAd(req.body, { categoryExists: (id) => categoryExists(id) || id === ad.category_id });
  const { img, error } = readImage(req, { required: false });
  if (error) errors.image = error;
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
  res.json({ ad: serializeAd(updateAd(ad, values, img, req.user)) });
}));

router.get('/ads/:code/image', requireAuth, (req, res) => {
  const ad = ownAd(req, res); if (!ad) return;
  const file = path.join(UPLOAD_DIR, path.basename(ad.image_file));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Image not found.' });
  res.set({ 'Content-Type': ad.image_mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
  fs.createReadStream(file).pipe(res);
});

// ================= NOTIFICATIONS =================
router.get('/notifications', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT n.id,n.type,n.title,n.message,n.is_read,n.created_at,a.ad_code
    FROM notifications n LEFT JOIN ads a ON a.id=n.ad_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 200`).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(req.user.id).c;
  res.json({ notifications: rows.map((n) => ({ ...n, is_read: !!n.is_read })), unread });
});
router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(parseInt(req.params.id, 10) || 0, req.user.id);
  res.json({ ok: true });
});

// ================= ADMIN =================
export const admin = express.Router();
admin.use(requireRole('admin'));

admin.get('/stats', (_req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) c FROM ads GROUP BY status').all();
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { by[r.status] = r.c; });
  res.json({
    total: Object.values(by).reduce((a, b) => a + b, 0), by_status: by,
    users: db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get().c
  });
});

admin.get('/ads', (req, res) => {
  const where = []; const args = [];
  const status = String(req.query.status || '');
  if (STATUSES.includes(status)) { where.push('a.status=?'); args.push(status); }
  const cat = parseInt(req.query.category, 10);
  if (Number.isInteger(cat)) { where.push('a.category_id=?'); args.push(cat); }
  const q = clean(String(req.query.q || '')).slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    where.push(`(a.ad_code LIKE ? ESCAPE '\\' OR a.title LIKE ? ESCAPE '\\' OR a.full_name LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\' OR a.company LIKE ? ESCAPE '\\' OR a.whatsapp LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`);
    for (let i = 0; i < 7; i++) args.push(like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
  const rows = db.prepare(`${SELECT} ${w} ORDER BY a.created_at ${sort}, a.id ${sort} LIMIT 500`).all(...args);
  res.json({ ads: rows.map((a) => serializeAd(a, { admin: true })) });
});

admin.get('/ads/:code', (req, res) => {
  const ad = findByCode(req.params.code);
  if (!ad) return res.status(404).json({ error: 'Advertisement not found.' });
  const history = db.prepare('SELECT event,status,actor_role,note,created_at FROM ad_history WHERE ad_id=? ORDER BY id DESC').all(ad.id);
  res.json({ ad: serializeAd(ad, { admin: true }), history });
});

admin.put('/ads/:code', handleUpload, wrap((req, res) => {
  const ad = findByCode(req.params.code);
  if (!ad) return res.status(404).json({ error: 'Advertisement not found.' });
  const { errors, values } = validateAd(req.body, { categoryExists: (id) => categoryExistsAny(id) });
  const { img, error } = readImage(req, { required: false });
  if (error) errors.image = error;
  let adminNote;
  if (req.body?.admin_note !== undefined) {
    adminNote = clean(req.body.admin_note) || null;
    if (adminNote && adminNote.length > 1000) errors.admin_note = 'Admin note must be under 1000 characters.';
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
  res.json({ ad: serializeAd(updateAd(ad, values, img, req.user, { adminNote }), { admin: true }) });
}));

admin.post('/ads/:code/status', wrap((req, res) => {
  const ad = findByCode(req.params.code);
  if (!ad) return res.status(404).json({ error: 'Advertisement not found.' });
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (status === ad.status) return res.status(409).json({ error: `Advertisement is already ${status}.` });
  const reason = clean(req.body?.reason);
  if (status === 'rejected' && (reason.length < 3 || reason.length > 1000))
    return res.status(400).json({ error: 'Please provide a rejection reason (3-1000 characters).', fields: { reason: 'A rejection reason is required.' } });
  res.json({ ad: serializeAd(changeStatus(ad, status, req.user, reason), { admin: true }) });
}));

admin.delete('/ads/:code', (req, res) => {
  const ad = findByCode(req.params.code);
  if (!ad) return res.status(404).json({ error: 'Advertisement not found.' });
  deleteAd(ad);
  res.json({ ok: true });
});

// ---- categories ----
const catSql = `SELECT c.id,c.name,c.active,c.created_at,(SELECT COUNT(*) FROM ads a WHERE a.category_id=c.id) AS ad_count FROM categories c`;
admin.get('/categories', (_req, res) => {
  res.json({ categories: db.prepare(`${catSql} ORDER BY c.name`).all().map((c) => ({ ...c, active: !!c.active })) });
});
function catName(v) {
  const n = clean(v).replace(/\s+/g, ' ');
  return n.length >= 2 && n.length <= 60 ? n : null;
}
admin.post('/categories', (req, res) => {
  const n = catName(req.body?.name);
  if (!n) return res.status(400).json({ error: 'Category name must be 2-60 characters.' });
  if (db.prepare('SELECT 1 FROM categories WHERE name=?').get(n)) return res.status(409).json({ error: 'That category already exists.' });
  const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(n);
  res.status(201).json({ category: db.prepare(`${catSql} WHERE c.id=?`).get(Number(r.lastInsertRowid)) });
});
admin.patch('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: 'Category not found.' });
  let name = cur.name; let active = cur.active;
  if (req.body?.name !== undefined) {
    const n = catName(req.body.name);
    if (!n) return res.status(400).json({ error: 'Category name must be 2-60 characters.' });
    const dup = db.prepare('SELECT id FROM categories WHERE name=? AND id<>?').get(n, id);
    if (dup) return res.status(409).json({ error: 'That category already exists.' });
    name = n;
  }
  if (req.body?.active !== undefined) active = req.body.active ? 1 : 0;
  if (!active && db.prepare('SELECT COUNT(*) c FROM categories WHERE active=1 AND id<>?').get(id).c === 0)
    return res.status(400).json({ error: 'At least one category must remain active.' });
  db.prepare('UPDATE categories SET name=?, active=? WHERE id=?').run(name, active, id);
  const c = db.prepare(`${catSql} WHERE c.id=?`).get(id);
  res.json({ category: { ...c, active: !!c.active } });
});
admin.delete('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = db.prepare(`${catSql} WHERE c.id=?`).get(id);
  if (!c) return res.status(404).json({ error: 'Category not found.' });
  if (c.ad_count > 0) return res.status(409).json({ error: `This category is used by ${c.ad_count} advertisement(s). Deactivate it instead of deleting.` });
  if (c.active && db.prepare('SELECT COUNT(*) c FROM categories WHERE active=1 AND id<>?').get(id).c === 0)
    return res.status(400).json({ error: 'At least one category must remain active.' });
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
  res.json({ ok: true });
});

// ---- users (read-only overview) ----
admin.get('/users', (_req, res) => {
  const rows = db.prepare(`SELECT u.id,u.name,u.email,u.whatsapp,u.role,u.created_at,
    (SELECT COUNT(*) FROM ads a WHERE a.user_id=u.id) AS ad_count FROM users u ORDER BY u.id DESC LIMIT 500`).all();
  res.json({ users: rows });
});
export { now };
