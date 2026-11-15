import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './src/db.js';
import { seedAdmin } from './src/db.js';
import { loadUser, purgeExpiredSessions } from './src/auth.js';
import { expireDue } from './src/ads.js';
import { router, admin } from './src/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
seedAdmin();

export const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  hsts: process.env.NODE_ENV === 'production'
}));
app.use(cookieParser());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// CSRF defence: cookie is SameSite=Lax; additionally reject cross-origin state-changing requests.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.get('host'); } catch { /* invalid */ }
    if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
});
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', loadUser);
app.use('/api/admin', admin);
app.use('/api', router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- admin pages: only served to authenticated administrators ----
const sendPrivate = (file) => (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.redirect('/admin-login.html');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'private', file));
};
app.use(loadUser);
app.get(['/admin', '/admin/'], sendPrivate('admin.html'));
app.get('/admin/admin.js', sendPrivate('admin.js'));
app.get('/admin/admin.css', sendPrivate('admin.css'));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

setInterval(() => { try { expireDue(); purgeExpiredSessions(); } catch (e) { console.error(e); } }, 60 * 1000).unref();
try { expireDue(); } catch (e) { console.error(e); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, '0.0.0.0', () => console.log(`[SEVI TRACK] listening on http://0.0.0.0:${PORT}`));
}
