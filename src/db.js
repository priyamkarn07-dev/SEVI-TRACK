import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'sevi.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  whatsapp TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL,
  website_url TEXT,
  social_url TEXT,
  image_file TEXT NOT NULL,
  image_mime TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','published','expired')),
  rejection_reason TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_created ON ads(created_at);
CREATE TABLE IF NOT EXISTS ad_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT,
  actor_id INTEGER,
  actor_role TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hist_ad ON ad_history(ad_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`);

export const now = () => new Date().toISOString();

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

// ---- seed categories ----
const DEFAULT_CATEGORIES = [
  'Business Promotion', 'Affiliate Marketing', 'Education', 'Online Courses',
  'Products', 'Services', 'Social Media Promotion', 'Other'
];
if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
  const ins = db.prepare('INSERT INTO categories (name) VALUES (?)');
  DEFAULT_CATEGORIES.forEach((n) => ins.run(n));
}

// ---- seed admin ----
export function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@sevitrack.com').trim().toLowerCase();
  const exists = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (exists) return;
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  const hash = bcrypt.hashSync(password, 12);
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")
    .run('SEVI TRACK Admin', email, hash);
  if (generated) {
    const file = path.join(DATA_DIR, 'initial-admin-credentials.txt');
    fs.writeFileSync(file, `SEVI TRACK initial admin login\nEmail: ${email}\nPassword: ${password}\n\nChange this password after first login (Admin > Account) and delete this file.\n`, { mode: 0o600 });
    console.log(`\n[SEVI TRACK] Admin account created.\n  Email:    ${email}\n  Password: ${password}\n  (also saved to ${file} - change it after first login)\n`);
  } else {
    console.log(`[SEVI TRACK] Admin account created for ${email} using ADMIN_PASSWORD from environment.`);
  }
}
