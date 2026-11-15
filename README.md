# SEVI TRACK — Advertisement Submission & Management Platform

Premium dark navy + purple, mobile-first platform where advertisers submit ads and administrators review,
approve, reject, edit, publish and manage them. Real backend, real database, no demo data.

## Stack
- **Backend:** Node.js 22 + Express, built-in SQLite (`node:sqlite`, WAL mode) — data persists on disk
- **Auth:** bcrypt password hashing, random server-side sessions (hashed in DB), HttpOnly + SameSite cookies, role-based access (`user` / `admin`)
- **Frontend:** vanilla HTML/CSS/JS (no build step), responsive for Android, iPhone, tablet and desktop

## Run
```bash
npm install
cp .env.example .env     # optional
npm start                # http://localhost:3000
npm test                 # 29 backend integration tests
```
On first start an admin account is created. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, or a random password is
printed once and saved to `data/initial-admin-credentials.txt`. Change it under **Admin → Account**.

- Advertisers: `/login.html` (register / sign in), `/submit.html`, `/dashboard.html`
- Admin: `/admin-login.html` → `/admin`

## Features
- 13-field submission form with client + server validation, image preview, unique ID (`STA-YYYYMMDD-XXXXXX`), success screen
- Statuses: Pending, Approved, Rejected, Published, Expired (published ads auto-expire after their duration)
- Admin: view all ads & advertiser details, banner preview, approve / reject (reason required) / publish / expire,
  edit, delete, search, filter by status & category, submission dates, manage categories (add / rename / deactivate / delete)
- User: submit, track status, view ID, edit **pending** ads, see rejection reasons, history timeline, profile & password
- Notifications (submitted / approved / rejected / published / expired / edited) shown in the user dashboard with unread badge
- All admin actions update the real records and write history + notifications in one DB transaction

## Security
- Admin page and its JS/CSS are only served to authenticated admins; every `/api/admin/*` route enforces the admin role server-side
- Uploads: JPG/PNG/WEBP/GIF only, verified by magic bytes (client MIME ignored), 5 MB cap, random filenames, stored outside the web root,
  served only to the owner/admin with `nosniff` (SVG/HTML rejected)
- Parameterised SQL everywhere, escaped LIKE search, strict input validation, CSP (no inline scripts), helmet headers
- Login/register/submit rate limiting, constant-time login (no user enumeration), cross-origin write blocking (CSRF), password change revokes other sessions

## Deploy notes
Needs a Node 22.13+ host with a **persistent disk** for `DATA_DIR` (SQLite + uploads). Set `TRUST_PROXY=true` and
`NODE_ENV=production` behind HTTPS. It is not suited to serverless/edge runtimes without persistent storage.
Notifications are in-app (no email/SMS provider is configured).
