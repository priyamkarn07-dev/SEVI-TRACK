import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, now, tx, UPLOAD_DIR } from './db.js';

const SELECT = `SELECT a.*, c.name AS category, ru.name AS reviewed_by_name
  FROM ads a LEFT JOIN categories c ON c.id=a.category_id LEFT JOIN users ru ON ru.id=a.reviewed_by`;

export function serializeAd(a, { admin = false } = {}) {
  if (!a) return null;
  const { image_file, image_mime, reviewed_by, ...rest } = a; // eslint-disable-line no-unused-vars
  const out = { ...rest, image_url: `/api/ads/${a.ad_code}/image?v=${encodeURIComponent(a.updated_at)}` };
  if (!admin) { delete out.admin_note; delete out.user_id; delete out.reviewed_by_name; }
  return out;
}

export const findByCode = (code) => db.prepare(`${SELECT} WHERE a.ad_code=?`).get(String(code));
export const findById = (id) => db.prepare(`${SELECT} WHERE a.id=?`).get(id);

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 20; i++) {
    let s = '';
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) s += ALPHA[b % ALPHA.length];
    const code = `STA-${d}-${s}`;
    if (!db.prepare('SELECT 1 FROM ads WHERE ad_code=?').get(code)) return code;
  }
  throw new Error('Could not allocate advertisement ID');
}

export function addHistory(adId, event, { status = null, actor = null, note = null } = {}) {
  db.prepare('INSERT INTO ad_history (ad_id,event,status,actor_id,actor_role,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(adId, event, status, actor?.id ?? null, actor?.role ?? 'system', note, now());
}

export function notify(userId, adId, type, title, message) {
  db.prepare('INSERT INTO notifications (user_id,ad_id,type,title,message,is_read,created_at) VALUES (?,?,?,?,?,0,?)')
    .run(userId, adId, type, title, message, now());
}

export function saveImage(buf, ext) {
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf, { mode: 0o640 });
  return name;
}
export function removeImage(name) {
  if (!name || name !== path.basename(name)) return;
  try { fs.rmSync(path.join(UPLOAD_DIR, name), { force: true }); } catch { /* best effort */ }
}

export function createAd(user, v, img) {
  const file = saveImage(img.buffer, img.ext);
  try {
    return tx(() => {
      const t = now();
      const code = newCode();
      const r = db.prepare(`INSERT INTO ads (ad_code,user_id,full_name,email,whatsapp,company,title,category_id,description,
        website_url,social_url,image_file,image_mime,ad_type,duration_days,instructions,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`)
        .run(code, user.id, v.full_name, v.email, v.whatsapp, v.company, v.title, v.category_id, v.description,
          v.website_url, v.social_url, file, img.mime, v.ad_type, v.duration_days, v.instructions, t, t);
      const id = Number(r.lastInsertRowid);
      addHistory(id, 'Advertisement submitted', { status: 'pending', actor: user });
      notify(user.id, id, 'submitted', 'Advertisement submitted',
        `Your advertisement "${v.title}" was submitted successfully. Advertisement ID: ${code}. It is now pending review.`);
      return findById(id);
    });
  } catch (e) { removeImage(file); throw e; }
}

const FIELDS = ['full_name', 'email', 'whatsapp', 'company', 'title', 'category_id', 'description',
  'website_url', 'social_url', 'ad_type', 'duration_days', 'instructions'];

export function updateAd(ad, v, img, actor, { adminNote } = {}) {
  let newFile = null;
  if (img) newFile = saveImage(img.buffer, img.ext);
  try {
    tx(() => {
      const sets = FIELDS.map((f) => `${f}=?`);
      const vals = FIELDS.map((f) => v[f]);
      if (img) { sets.push('image_file=?', 'image_mime=?'); vals.push(newFile, img.mime); }
      if (adminNote !== undefined) { sets.push('admin_note=?'); vals.push(adminNote); }
      sets.push('updated_at=?'); vals.push(now());
      db.prepare(`UPDATE ads SET ${sets.join(',')} WHERE id=?`).run(...vals, ad.id);
      if (actor.role === 'admin') {
        addHistory(ad.id, 'Details edited by administrator', { status: ad.status, actor });
        if (actor.id !== ad.user_id)
          notify(ad.user_id, ad.id, 'edited', 'Advertisement updated',
            `An administrator updated the details of your advertisement "${v.title}" (${ad.ad_code}).`);
      } else {
        addHistory(ad.id, 'Details edited by advertiser', { status: ad.status, actor });
      }
    });
  } catch (e) { if (newFile) removeImage(newFile); throw e; }
  if (img) removeImage(ad.image_file);
  return findById(ad.id);
}

export function deleteAd(ad) {
  db.prepare('DELETE FROM ads WHERE id=?').run(ad.id);
  removeImage(ad.image_file);
}

const MESSAGES = {
  approved: (a) => ['Advertisement approved', `Good news! Your advertisement "${a.title}" (${a.ad_code}) has been approved.`],
  rejected: (a, reason) => ['Advertisement rejected', `Your advertisement "${a.title}" (${a.ad_code}) was rejected. Reason: ${reason}`],
  published: (a) => ['Advertisement published', `Your advertisement "${a.title}" (${a.ad_code}) is now published and live.`],
  expired: (a) => ['Advertisement expired', `Your advertisement "${a.title}" (${a.ad_code}) has expired.`],
  pending: (a) => ['Advertisement moved to pending', `Your advertisement "${a.title}" (${a.ad_code}) was moved back to pending review.`]
};

export function changeStatus(ad, status, actor, reason) {
  return tx(() => {
    const t = now();
    const sets = ['status=?', 'updated_at=?'];
    const vals = [status, t];
    if (status === 'rejected') { sets.push('rejection_reason=?'); vals.push(reason); }
    else { sets.push('rejection_reason=NULL'); }
    if (status === 'published') {
      sets.push('published_at=?', 'expires_at=?');
      vals.push(t, new Date(Date.now() + ad.duration_days * 86400000).toISOString());
    } else if (status === 'pending' || status === 'rejected' || status === 'approved') {
      sets.push('published_at=NULL', 'expires_at=NULL');
    }
    if (actor.role === 'admin') { sets.push('reviewed_at=?', 'reviewed_by=?'); vals.push(t, actor.id); }
    db.prepare(`UPDATE ads SET ${sets.join(',')} WHERE id=?`).run(...vals, ad.id);
    addHistory(ad.id, `Status changed to ${status}`, { status, actor, note: status === 'rejected' ? reason : null });
    const [title, message] = MESSAGES[status](ad, reason);
    notify(ad.user_id, ad.id, status, title, message);
    return findById(ad.id);
  });
}

/** Automatically moves published ads past their end date to "expired". */
export function expireDue() {
  const due = db.prepare("SELECT id FROM ads WHERE status='published' AND expires_at IS NOT NULL AND expires_at < ?").all(now());
  for (const { id } of due) {
    const ad = findById(id);
    if (ad && ad.status === 'published') changeStatus(ad, 'expired', { id: null, role: 'system' }, null);
  }
  return due.length;
}

export { SELECT };
