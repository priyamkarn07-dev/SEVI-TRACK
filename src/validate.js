export const AD_TYPES = ['Banner Ad', 'Featured Listing', 'Social Media Promotion', 'Sponsored Post', 'Video Ad'];
export const DURATIONS = [7, 14, 30, 60, 90];
export const STATUSES = ['pending', 'approved', 'rejected', 'published', 'expired'];

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '');

export function isEmail(v) { return v.length <= 254 && EMAIL_RE.test(v); }

export function normUrl(v) {
  if (!v) return { ok: true, value: null };
  let s = v;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return { ok: false };
    if (s.length > 500) return { ok: false };
    return { ok: true, value: u.toString(), host: u.hostname.toLowerCase() };
  } catch { return { ok: false }; }
}

export function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters.';
  if (p.length > 100) return 'Password is too long.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Password must include letters and numbers.';
  return null;
}

/** Validates advertisement fields. Returns { errors, values } */
export function validateAd(body, { categoryExists }) {
  const errors = {};
  const b = body || {};
  const v = {};
  v.full_name = clean(b.full_name);
  if (v.full_name.length < 2 || v.full_name.length > 100) errors.full_name = 'Enter your full name (2-100 characters).';

  v.email = clean(b.email).toLowerCase();
  if (!isEmail(v.email)) errors.email = 'Enter a valid email address.';

  v.whatsapp = clean(b.whatsapp);
  const digits = v.whatsapp.replace(/\D/g, '');
  if (!/^\+?[\d\s\-()]+$/.test(v.whatsapp) || digits.length < 8 || digits.length > 15)
    errors.whatsapp = 'Enter a valid WhatsApp number with country code (8-15 digits).';

  v.company = clean(b.company);
  if (v.company.length < 2 || v.company.length > 120) errors.company = 'Enter your business / company name.';

  v.title = clean(b.title);
  if (v.title.length < 3 || v.title.length > 120) errors.title = 'Advertisement title must be 3-120 characters.';

  v.category_id = parseInt(b.category_id, 10);
  if (!Number.isInteger(v.category_id) || !categoryExists(v.category_id)) errors.category_id = 'Select a valid category.';

  v.description = clean(b.description);
  if (v.description.length < 20 || v.description.length > 2000) errors.description = 'Description must be 20-2000 characters.';

  const web = normUrl(clean(b.website_url));
  if (!web.ok) errors.website_url = 'Enter a valid website URL.';
  v.website_url = web.ok ? web.value : null;

  const soc = normUrl(clean(b.social_url));
  if (!soc.ok || (soc.value && !/(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|instagr\.am)$/.test(soc.host)))
    errors.social_url = 'Enter a valid Instagram or Facebook link.';
  v.social_url = soc.ok ? soc.value : null;

  v.ad_type = clean(b.ad_type);
  if (!AD_TYPES.includes(v.ad_type)) errors.ad_type = 'Select an advertisement type.';

  v.duration_days = parseInt(b.duration_days, 10);
  if (!DURATIONS.includes(v.duration_days)) errors.duration_days = 'Select an advertisement duration.';

  v.instructions = clean(b.instructions) || null;
  if (v.instructions && v.instructions.length > 1000) errors.instructions = 'Additional instructions must be under 1000 characters.';

  return { errors, values: v };
}

// ---- image magic-byte detection (never trust client mimetype) ----
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  const head = buf.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
export { clean };
