import crypto from 'node:crypto';
import { db, now } from './db.js';

const COOKIE = 'sevi_session';
const SESSION_MS = 7 * 24 * 3600 * 1000;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const created = new Date();
  db.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(sha(token), userId, created.toISOString(), new Date(created.getTime() + SESSION_MS).toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_MS, path: '/'
  });
}

export function destroySession(req, res) {
  const t = req.cookies?.[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(t));
  res.clearCookie(COOKIE, { path: '/' });
}

export function destroyOtherSessions(userId, req) {
  const t = req.cookies?.[COOKIE];
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, t ? sha(t) : '');
}

export function loadUser(req, _res, next) {
  req.user = null;
  const t = req.cookies?.[COOKIE];
  if (t && typeof t === 'string') {
    const row = db.prepare(`SELECT u.id,u.name,u.email,u.whatsapp,u.role,s.expires_at FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha(t));
    if (row && row.expires_at > now()) req.user = { id: row.id, name: row.name, email: row.email, whatsapp: row.whatsapp, role: row.role };
  }
  next();
}

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' });

export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (req.user.role !== role) return res.status(403).json({ error: 'You do not have permission to do that.' });
  next();
};

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}

// ---- tiny in-memory rate limiter ----
const buckets = new Map();
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many attempts. Please try again later.' }) {
  return (req, res, next) => {
    const k = key(req);
    const t = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < t) { b = { count: 0, reset: t + windowMs }; buckets.set(k, b); }
    b.count++;
    if (b.count > max) {
      res.set('Retry-After', Math.ceil((b.reset - t) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60000).unref();
