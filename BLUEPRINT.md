# ZOOMDRIVE: MASTER BLUEPRINT

> Single source of truth for Windsurf, Claude and Romeo. Lives at the repo root as `BLUEPRINT.md`.
> Last revised: 3 Nov 2026. Blueprint version: 1.1

---

## 0. RESUME HERE (update this block at the end of every session)

```
CURRENT PHASE ........ 13B (Email login, responsive layout, full audit and revenue)
LAST COMPLETED PHASE . 13B
LAST TASK DONE ....... P13B.7
NEXT ACTION .......... Romeo manual tests for Phases 12, 13 and 13B, then Phase 14 task P14.1
BLOCKERS ............. none
OPEN QUESTIONS ....... see section 15
LAST UPDATED ......... 3 Nov 2026
```

**To catch up (Claude or Windsurf):** read this file only. Read section 0, then 1 (rules), then the section for the CURRENT PHASE in section 13, then the Build Log (section 14). Do not ask Romeo to re-upload anything. Everything needed is in here.

**Task status markers:** `[ ]` not started, `[~]` in progress, `[x]` done and verified, `[!]` blocked (add reason in Build Log).

---

## 1. WINDSURF OPERATING RULES (read before every session)

1. **One phase at a time.** Work only on the CURRENT PHASE. Never start the next phase. When all tasks and verification checks pass, tick the boxes, update section 0 and section 14, print `PHASE <n> COMPLETE. Waiting for Romeo's manual test.` and **stop**.
2. **No browser, no web preview, no screenshots.** Never open a browser or preview panel. Verification is static only: `node --check <file>`, `grep`/search, `npm run check`, and (optionally) `curl` against the local backend. Romeo runs all manual tests himself (the "Manual test" list in each phase).
3. **Self-verify, then report only failures.** After each batch of work, run the phase's verification block. Report back only on: a failed check, an ambiguity, or a missing credential. Do not narrate successes at length.
4. **Audit before you write.** Before any database code, run `npm run schema:audit` (backend) to compare migration files with the live database. Fix drift first.
5. **Never duplicate.** Before creating any function, route, middleware or page, search the repo for an existing one (`grep -rn "<name>" backend/src frontend/public`). If one exists, extend it. Never create a second implementation of the same thing.
6. **No empty files marked as done.** A migration, page or module with 0 bytes or only a TODO is NOT complete. `npm run check` fails on empty source files.
7. **Exact strings.** When editing existing code, use exact find-and-replace with landmark strings. State the file, the exact old string and the exact new string.
8. **API contract is fixed** (section 8.1). `apiFetch()` on the frontend returns the parsed `data` object or throws `ApiError`. Never check `.ok` or call `.json()` on its result.
9. **No hardcoded IDs, URLs or secrets.** No `localhost` in `frontend/public` except inside `shared/config.js` dev branch. No literal user/request IDs. No keys in code.
10. **Secrets.** Real secrets live only in Render's environment dashboard (and a local `.env` that is git-ignored). Never print, log or paste secret values. If a secret is exposed, tell Romeo to revoke and rotate it.
11. **Money is integer cents (ZAR).** Never floats. Display formatting happens only in the UI via `formatZAR(cents)`.
12. **Role rule.** There are exactly two user roles: `driver` and `provider`. Admin is an internal operator panel, not a user role. Do not add other roles.
13. **Failure report format.** If blocked, stop and print:
    `BLOCKED | phase | task id | file:line | command run | exact output | best hypothesis`
14. **Port safety.** Always start the backend through `npm run dev` / `npm start` (uses `scripts/start-safe.js`) so a busy port gives a named error instead of a silent failure.
15. **Update the Build Log** (section 14) at the end of every session, even a partial one.

---

## 2. PRODUCT SUMMARY AND CONTEXT DIGEST

**ZoomDrive** is a roadside-help platform for South Africa. Drivers (starting with e-hailing drivers) request help when stranded. Verified providers nearby accept the job and come to them. Think Uber/Bolt mechanics applied to flat tyres, jump-starts, fuel top-ups, essentials and towing, with a fixed price shown upfront.

**One platform, two apps (two installable PWAs sharing one backend and one database):**

| App | Store name | Who uses it | Path |
|---|---|---|---|
| Driver app | **ZoomDrive** | Drivers who need help | `/driver/` |
| Provider app | **ZoomDrive Partner** | Service providers (individuals or companies) | `/provider/` |

(The "ZoomDrive Partner" name is a proposal; change it in `shared/config.js` and the manifests if Romeo picks another.)

**Core decisions already made**
- Name: ZoomDrive (replaces earlier working names RoadAid, Request A Service). Icon: a spanner (wrench) with the name **ZOOMDRIVE** in the centre of the shaft between the two ends.
- The app decides the role. The driver app only signs up and logs in drivers. The provider app only signs up and logs in providers. Using the wrong app shows a clear message and a pointer to the right app. No role-switch button anywhere.
- Only two user roles: `driver`, `provider`.
- Drivers are regular individuals. Profile photo optional.
- Providers register as an **individual** or under a **company/organisation**. Profile photo is **compulsory** for providers. Documents are compulsory. Providers are `pending` until an admin approves them. Only `approved` providers can go online and receive jobs.
- To make a request, a driver must have signed up and have a profile. A driver can browse the whole driver app as a guest first; any request action sends them to sign-up.
- Signup and login use email and a 6-digit code emailed through Brevo, then profile details including phone.
- Phone is a required contact detail and is not verified.
- Fair price for both sides: admin-controlled price bands, fixed price shown before confirming, never changes afterwards. Platform commission default 15% taken from the provider side; sensitive pricing changes require an emailed admin challenge.
- Theme: white, modern, amber accent (`#FFB400`), black buttons. Mobile-first PWA that also works on desktop.
- The marketplace starts narrow: one pilot city, vetted providers, manual dispatch fallback. Later: partners/corporate/fleet, wider accessories, WhatsApp requests, staff accounts under companies.
- Validation first: Romeo is running driver/provider interviews and a manual pilot. The app is built so the pilot can run with admin-assisted dispatch from day one.
- Romeo builds with Claude (architecture, review, prompts) and Windsurf (implementation). Romeo runs manual tests in his own browser.

**Partnership note (not a build task):** the idea comes from a third party who offered Romeo a partnership if it succeeds. Equity, roles and vesting should be agreed in writing and reviewed by a lawyer before significant build time is invested.

---

## 3. BRAND AND DESIGN SYSTEM

### 3.1 Logo (spanner with name in the centre)
Save as `frontend/public/brand/logo.svg`. Verified to render correctly: open jaw on the left, hex socket on the right, text centred on the shaft.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200" width="640" height="200" role="img" aria-label="ZoomDrive">
  <g fill="#111">
    <path d="M32.83 76H92V124H32.83A62 62 0 1 0 32.83 76Z"/>
    <path fill-rule="evenodd" d="M488 100a62 62 0 1 0 124 0a62 62 0 1 0-124 0ZM550 66L577.7 83V117L550 134L522.3 117V83Z"/>
    <rect x="92" y="58" width="408" height="84"/>
  </g>
  <text x="320" y="116" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="38" letter-spacing="3" fill="#FFB400">ZOOMDRIVE</text>
</svg>
```

### 3.2 App icons (two icons, same spanner, different colours)
- **Driver icon** (`brand/icon-driver.svg`): amber `#FFB400` rounded square, black spanner, amber text.
- **Partner icon** (`brand/icon-provider.svg`): black `#111` rounded square, amber spanner, black text, small "PARTNER" caption under the spanner.

```svg
<!-- icon-driver.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#FFB400"/>
  <g transform="translate(16 155) scale(.75)">
    <g fill="#111">
      <path d="M32.83 76H92V124H32.83A62 62 0 1 0 32.83 76Z"/>
      <path fill-rule="evenodd" d="M488 100a62 62 0 1 0 124 0a62 62 0 1 0-124 0ZM550 66L577.7 83V117L550 134L522.3 117V83Z"/>
      <rect x="92" y="58" width="408" height="84"/>
    </g>
    <text x="320" y="116" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="38" letter-spacing="3" fill="#FFB400">ZOOMDRIVE</text>
  </g>
</svg>
```
```svg
<!-- icon-provider.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#111"/>
  <g transform="translate(16 140) scale(.75)">
    <g fill="#FFB400">
      <path d="M32.83 76H92V124H32.83A62 62 0 1 0 32.83 76Z"/>
      <path fill-rule="evenodd" d="M488 100a62 62 0 1 0 124 0a62 62 0 1 0-124 0ZM550 66L577.7 83V117L550 134L522.3 117V83Z"/>
      <rect x="92" y="58" width="408" height="84"/>
    </g>
    <text x="320" y="116" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="38" letter-spacing="3" fill="#111">ZOOMDRIVE</text>
  </g>
  <text x="256" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="30" letter-spacing="8" fill="#FFB400">PARTNER</text>
</svg>
```
`frontend/scripts/build-icons.js` converts these to PNG: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (artwork inside the central 80% safe zone), `apple-touch-icon-180.png`, per app folder. Use `sharp` as a devDependency. Note: at very small sizes the centre text is not readable; the spanner shape and colour carry the brand there.

### 3.3 Design tokens (`frontend/public/shared/styles/tokens.css`)
```css
:root{
  --bg:#ffffff; --soft:#f4f5f7; --line:#e8e9ec; --tx:#111111; --mu:#6b6f76;
  --am:#ffb400; --amd:#b87a00; --blue:#1a6bff; --ok:#12a150; --bad:#e5483d;
  --r-sm:12px; --r-md:16px; --r-lg:22px; --shadow:0 6px 20px rgba(0,0,0,.05);
  --font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --tap:44px; /* minimum tap target */
  --pad:16px; --nav-w:232px; --content-max:1200px; --form-max:560px; --rail-bg:#ffffff;
}
```
Rules: white background, black primary buttons, amber for highlights and brand, blue only for "Go Online" and links, green for success/verified, red for destructive. Cards: 1px `--line` border, soft shadow, radius 16 to 22. Navigation has minimum 44px tap targets. Respect safe areas (`env(safe-area-inset-*)`). Layout is mobile-first and fills the screen on every device; bottom navigation below 900px and a left side rail from 900px; content max width 1200px, forms 560px. Use `textContent` for user-supplied text, never `innerHTML`.

### 3.4 Visual reference
A clickable mockup (white theme, Uber/Bolt-style driver and provider screens) exists as a separate HTML file made earlier under the working name RoadAid. This blueprint is the spec; the mockup is only a visual aid. Screen contents are fully described in section 11, so no upload is needed.

---

## 4. ARCHITECTURE

- **Monorepo** `zoomdrive/` with `backend/` and `frontend/`, one `BLUEPRINT.md` at the root.
- **Backend:** Node.js + Express, PostgreSQL on Neon, JWT auth, Cloudinary for images/documents, `zod` validation, `helmet`, `cors`, `express-rate-limit`, `multer`. Hosted on Render (root directory `backend`).
- **Frontend:** vanilla HTML/CSS/JS (no framework), hash router, three static sites in one deployment: `driver/`, `provider/`, `admin/`, plus `shared/`. Hosted on Vercel, Root Directory `frontend`, Framework Preset `Other`, no Build Command, Output Directory `public`.
- **PWAs:** each app has its own `manifest.webmanifest` (own `id`, `scope`, `start_url`, icons, name) and its own service worker located inside its folder so its scope is `/driver/` or `/provider/`. Both install separately from the same domain and show as two icons.
- **Maps:** Leaflet + OpenStreetMap tiles (free, no key). Geocoding: browser geolocation first, Nominatim search as optional (respect its usage policy, debounce, cache). Distance: Haversine formula times a road factor (default 1.3). Routing/ETA: estimate from distance and average speed (setting). Upgrade path to Google/Mapbox later.
- **Live updates:** polling, not WebSockets (Render free tier sleeps; simpler). Driver tracking screen polls every 5s. Provider offers poll every 5s while online. Provider location heartbeat every 15s while online.
- **Auth:** email + 6-digit code emailed through Brevo, then a JWT (30 days); phone is a required, unverified profile contact detail.
- **OTP adapter:** `console` (development only, logs the code outside production), `email` (default via Brevo), and `bulksms` (dormant).
- **Dispatch:** automatic nearest-provider offers with a manual admin-assign fallback.
- **Payments:** Phase 11. Ledger-first design (platform records what each provider earned and is owed; admin pays out), then Paystack card payments.
- **Admin:** separate operator panel at `/admin/` with its own `admin_users` table, email + password login, no public signup.

```
Driver PWA (/driver/) ─┐
Provider PWA (/provider/) ─┼─► Express API (Render) ─► Neon Postgres
Admin panel (/admin/) ─┘          └─► Cloudinary (photos/docs)
                                   └─► Email provider (OTP via Brevo)
```

---

## 5. FULL FILE STRUCTURE

Create exactly this structure. Files marked `(phase n)` are created in that phase; empty placeholder files are not allowed (rule 6), so create each file in the phase that fills it.

```
zoomdrive/
├─ BLUEPRINT.md                         (phase 0)
├─ README.md                            (phase 0)  how to run, deploy, env, scripts
├─ .gitignore                           (phase 0)  node_modules, .env, *.log, .DS_Store
├─ backend/
│  ├─ package.json                      (phase 0)
│  ├─ .env.example                      (phase 0)  names only, no values
│  ├─ render.yaml                       (phase 14) optional
│  ├─ scripts/
│  │  ├─ start-safe.js                  (phase 0)  port check, named error
│  │  ├─ check.js                       (phase 0)  static checks (section 10.5)
│  │  ├─ migrate.js                     (phase 1)  runs migrations with guards
│  │  ├─ schema-audit.js                (phase 1)  migrations vs live DB
│  │  ├─ seed.js                        (phase 1)  services + settings
│  │  └─ create-admin.js                (phase 7)  interactive, password never echoed
│  ├─ db/
│  │  ├─ migrations/
│  │  │  ├─ 001_extensions_users.sql          (phase 1)
│  │  │  ├─ 002_auth_otp.sql                  (phase 1)
│  │  │  ├─ 003_profiles_orgs_documents.sql   (phase 1)
│  │  │  ├─ 004_services_settings.sql         (phase 1)
│  │  │  ├─ 005_requests_offers.sql           (phase 1)
│  │  │  ├─ 006_payments_ledger_payouts.sql   (phase 1)
│  │  │  ├─ 007_ratings_notifications.sql     (phase 1)
│  │  │  ├─ 008_admin_audit.sql               (phase 1)
│  │  │  ├─ 009_provider_active_job.sql       (phase 8)
│  │  │  ├─ 010_pricing_governance_charges.sql (phase 10; read-only once present)
│  │  │  ├─ 011_ledger_payouts_bank.sql        (phase 11; applied)
│  │  │  ├─ 012_ratings_moderation.sql     (phase 12; applied)
│  │  │  └─ 013_email_login.sql             (phase 13B; applied)
│  │  │  └─ 014_audit_revenue_immutability.sql (phase 13B; applied)
│  │  └─ seed/
│  │     ├─ services.sql                      (phase 1)
│  │     └─ settings.sql                      (phase 1)
│  └─ src/
│     ├─ server.js                      (phase 0)  boot, self-check, listen
│     ├─ app.js                         (phase 0)  express app, middleware, routes mount
│     ├─ config/env.js                  (phase 0)  validates env, fails fast with names
│     ├─ db/pool.js                     (phase 1)
│     ├─ lib/
│     │  ├─ ApiError.js                 (phase 0)
│     │  ├─ errors.js                   (phase 0)  error code registry
│     │  ├─ logger.js                   (phase 0)
│     │  ├─ mailer.js                   (phase 10/13B) console / SMTP / Brevo email
│     │  ├─ crypto.js                   (phase 11) AES-256-GCM bank detail encryption
│     │  ├─ money.js                    (phase 8)
│     │  ├─ geo.js                      (phase 8)  haversine, bounding box
│     │  ├─ pricing.js                  (phase 8)
│     │  ├─ phone.js                    (phase 2)  normalise to E.164
│     │  └─ audit.js                    (phase 1)  writeAudit()
│     ├─ middleware/
│     │  ├─ requestId.js                (phase 0)
│     │  ├─ errorHandler.js             (phase 0)
│     │  ├─ notFound.js                 (phase 0)
│     │  ├─ auth.js                     (phase 2)  verify JWT, attach req.user
│     │  ├─ requireRole.js              (phase 2)
│     │  ├─ requireApproved.js          (phase 3)  provider must be approved
│     │  ├─ adminAuth.js                (phase 7)
│     │  ├─ rateLimit.js                (phase 2)
│     │  ├─ validate.js                 (phase 2)  zod wrapper
│     │  └─ upload.js                   (phase 3)  multer, type + size limits
│     └─ modules/
│        ├─ health/        health.routes.js                               (phase 0)
│        ├─ auth/          auth.routes.js, auth.controller.js, auth.service.js, otp.service.js, otp.drivers/console.js, otp.drivers/email.js, otp.drivers/bulksms.js   (phase 2/13B)
│        ├─ users/         users.routes.js, users.controller.js           (phase 3)
│        ├─ drivers/       drivers.routes.js, drivers.controller.js, savedPlaces.controller.js   (phase 3)
│        ├─ providers/     providers.routes.js, providers.controller.js, documents.controller.js, organisations.controller.js, registrationFee.controller.js, earnings.controller.js, bankDetails.controller.js   (phase 3, extended 10-11)
│        ├─ uploads/       cloudinary.service.js                          (phase 3)
│        ├─ services/      services.routes.js, services.controller.js     (phase 7)
│        ├─ requests/      requests.routes.js, requests.controller.js, requests.service.js, stateMachine.js   (phase 8)
│        ├─ dispatch/      dispatch.service.js, expiry.job.js             (phase 8)
│        ├─ payments/      payments.routes.js, payments.controller.js, charges.service.js, ridePayments.service.js, ledger.service.js, paystack.service.js   (phase 10-11)
│        ├─ plus/          plus.service.js, plus.controller.js                            (phase 10)
│        ├─ ratings/       ratings.routes.js, ratings.controller.js, ratings.service.js   (phase 12)
│        ├─ notifications/ notifications.routes.js, notifications.controller.js, notifications.service.js   (phase 12)
│        └─ admin/         admin.routes.js, adminAuth.controller.js, providersReview.controller.js, adminUsers.controller.js, accountDeletion.service.js, adminRequests.controller.js, requestTimeline.service.js, adminServices.controller.js, adminSettings.controller.js, pricingPolicy.js, adminPricing.controller.js, adminPayouts.controller.js, adminAudit.controller.js   (phase 7, extended 10-12)
├─ frontend/
│  ├─ package.json                      (phase 4)  devDependencies: sharp
│  ├─ vercel.json                       (phase 4)  headers (sw no-cache), no rewrites needed
│  ├─ scripts/
│  │  ├─ check.js                       (phase 4)  static checks
│  │  └─ build-icons.js                 (phase 4)
│  └─ public/
│     ├─ index.html                     (phase 4)  landing: two big buttons, install hints
│     ├─ brand/  logo.svg, icon-driver.svg, icon-provider.svg                (phase 4)
│     ├─ shared/
│     │  ├─ config.js                   (phase 4)  API_BASE per environment, app names, version
│     │  ├─ api.js                      (phase 4)  apiFetch, ApiError
│     │  ├─ auth.js                     (phase 4)  token store, getUser, requireAuth, logout
│     │  ├─ authFlow.js                 (phase 5)  phone/OTP validation, screens, role mismatch
│     │  ├─ errors.js                   (phase 4)  global handlers, error banner, copy details
│     │  ├─ ui.js                       (phase 4)  toast, modal, spinner, formatZAR, formatDate
│     │  ├─ router.js                   (phase 4)  hash router with guards
│     │  ├─ map.js                      (phase 9)  Leaflet wrapper
│     │  ├─ geo.js                      (phase 9)  geolocation helper
│     │  ├─ pwa.js                      (phase 4)  install prompt (works on mobile), sw register
│     │  ├─ components/ topbar.js, bottom-nav.js, field.js, photo-upload.js, doc-upload.js, status-badge.js, rating-stars.js   (phase 4-12)
│     │  └─ styles/ tokens.css, base.css, components.css                     (phase 4)
│     ├─ driver/
│     │  ├─ index.html, app.js, manifest.webmanifest, sw.js                  (phase 4)
│     │  ├─ icons/ icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png   (phase 4)
│     │  └─ pages/ welcome.js, phone.js, otp.js, profileSetup.js            (phase 5)
│     │          home.js, request.js, searching.js, track.js, pay.js, rate.js, activity.js, account.js, inbox.js, savedPlaces.js, paymentMethods.js, safety.js, support.js, settings.js   (phase 9-12)
│     │          plus.js   (phase 10)
│     ├─ provider/
│     │  ├─ index.html, app.js, heartbeat.js, manifest.webmanifest, sw.js    (phase 4, extended 10)
│     │  ├─ icons/ (same four PNGs, partner artwork)                         (phase 4)
│     │  └─ pages/ welcome.js, phone.js, otp.js, providerType.js, profileSetup.js, documents.js, pending.js   (phase 6)
│     │          home.js, job.js, earnings.js, inbox.js, menu.js, services.js, vehicle.js, payouts.js, registrationFee.js   (phase 10)
│     └─ admin/
│        ├─ index.html, app.js, login.js                                      (phase 7)
│        └─ pages/ overview.js, providers.js, providerDetail.js, users.js, services.js, settings.js, pricing.js   (phase 7, extended 10)
│                  requests.js, payouts.js, audit.js                           (phase 11-12)
└─ docs/
   └─ manual-tests.md                   (phase 0)  Romeo's checklists, appended each phase
```

---

## 6. ENVIRONMENT VARIABLES

Real values only in Render's dashboard and a local git-ignored `backend/.env`. `.env.example` lists names only.

| Name | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | yes | default 4000 locally |
| `DATABASE_URL` | yes | Neon connection string |
| `JWT_SECRET` | yes | long random string (32+ chars); boot fails if shorter |
| `JWT_EXPIRES_IN` | no | default `30d` |
| `FRONTEND_ORIGINS` | yes | comma-separated allowed origins for CORS |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from phase 3 | uploads |
| `OTP_DRIVER` | yes | `console`, `email`, or dormant `bulksms` |
| `OTP_DAILY_EMAIL_CAP` | no | integer 10–100000; global daily email OTP cap, default 250 |
| `OTP_DEV_ECHO` | no | `true` returns the code in the API response (development only; boot refuses `true` in production) |
| `OTP_ALLOW_CONSOLE_IN_PRODUCTION` | no | default `false`; explicitly permits console OTP only for private production testing, with a loud boot warning |
| `SMS_API_KEY`, `SMS_API_SECRET` | when `OTP_DRIVER=bulksms` | BulkSMS credentials |
| `SMS_SENDER_ID` | no | optional SMS sender ID, maximum 11 characters |
| `SIGNUP_ENABLED` | no | `true`/`false` kill-switch for new signups |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | from phase 10 | platform charges and card payments |
| `PAYSTACK_FALLBACK_EMAIL_DOMAIN` | when Paystack is configured | valid domain used for accounts without an email |
| `DATA_ENCRYPTION_KEY` | required from phase 11 | base64 encoding of exactly 32 random bytes; boot fails if missing or wrong length |
| `EMAIL_DRIVER` | yes | `console` in development only, `smtp`, or `brevo` |
| `EMAIL_FROM` | when `EMAIL_DRIVER=smtp` or `brevo` | verified sender address |
| `EMAIL_FROM_NAME` | no | sender display name, default `ZoomDrive` |
| `BREVO_API_KEY` | when `EMAIL_DRIVER=brevo` | Brevo API key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | when `EMAIL_DRIVER=smtp` | SMTP connection |
| `EMAIL_FALLBACK_DOMAIN` | no | domain used only when an admin email has no domain |
| `PRICING_CHANGE_COOLDOWN_HOURS` | no | default 720 (30 days); integer 1–720 hours between applied pricing changes |
| `APP_VERSION` | no | shown in `/health` and error details |
| `TRUST_PROXY_HOPS` | no | integer, default 1; trusted proxy hops for rate limiting and client IP |

Frontend has no secrets. `shared/config.js` holds `API_BASE` (production URL, with a development branch for localhost).

---

## 7. DATABASE SCHEMA

Conventions: `bigint generated always as identity` primary keys; `timestamptz` for all times (stored UTC, displayed in SAST); money as integer cents; `text` plus `CHECK` constraints for enums; indexes on every foreign key and every column used in a `WHERE`. Each migration is idempotent-safe, non-empty, and recorded in `schema_migrations` only after it succeeds.

**users** `id, role CHECK(driver|provider), phone nullable and not unique (E.164 when present), email nullable with a unique partial index on lower(email), email_verified_at, first_name, last_name, photo_url, status CHECK(active|suspended|deleted) default active, suspended_reason, suspended_at, deleted_at, created_at, updated_at, last_login_at`

**otp_codes** `id, email, phone nullable, code_hash, purpose CHECK(login|signup), expires_at, attempts int default 0, consumed_at, created_at`; index `idx_otp_email`

**driver_profiles** `user_id PK→users, vehicle_make, vehicle_model, vehicle_colour, plate, hail_platform (uber|bolt|indrive|other|null), consent_at, consent_version, created_at`

**organisations** `id, name, reg_number, status CHECK(pending|approved|rejected|suspended), owner_user_id→users, created_at`

**provider_profiles** `user_id PK→users, provider_type CHECK(individual|company), organisation_id→organisations null, vehicle_description, plate, base_lat, base_lng, service_radius_km default 25, verification_status CHECK(pending|approved|rejected) default pending, rejection_reason, is_online bool default false, last_lat, last_lng, last_seen_at, rating_avg numeric(3,2) default 0, rating_count int default 0, jobs_completed int default 0, submitted_at, approved_at, approved_by→admin_users, consent_at, consent_version, registration_paid_at, registration_waived bool default false, registration_charge_id→platform_charges null, created_at`

**provider_documents** `id, provider_user_id→users, doc_type CHECK(id_document|drivers_licence|vehicle_insurance|company_registration), file_url, cloudinary_public_id, status CHECK(pending|approved|rejected) default pending, note, uploaded_at, reviewed_at, reviewed_by`

**services** `id, code UNIQUE (flat_tyre|jump_start|fuel|essentials|towing), name, icon, base_price_cents, per_km_cents, min_distance_fee_cents, active bool, sort_order`

**provider_services** `provider_user_id→users, service_id→services, PRIMARY KEY(both)`

**saved_places** `id, user_id→users, label, address, lat, lng, created_at`

**requests** `id, driver_id→users, service_id→services, status CHECK(searching|accepted|arrived|completed|cancelled|expired) default searching, lat, lng, address_text, notes, distance_km numeric(6,2), service_price_cents, distance_fee_cents, total_cents, commission_pct numeric(5,2), commission_cents, provider_earning_cents, provider_id→users null, assigned_by_admin bool default false, created_at, expires_at, accepted_at, arrived_at, completed_at, cancelled_at, cancelled_by CHECK(driver|provider|admin|system), cancel_reason`

**request_offers** `id, request_id→requests, provider_id→users, status CHECK(offered|accepted|declined|expired) default offered, offered_at, responded_at, UNIQUE(request_id, provider_id)`

**payments** `id, request_id→requests UNIQUE, method CHECK(card|cash|eft|unpaid) default unpaid, status CHECK(pending|paid|failed|refunded) default pending, amount_cents, gateway_fee_cents nullable, paystack_ref, paid_at, created_at`

**provider_ledger** `id, provider_user_id→users, request_id→requests null, payout_id→payouts null, entry_type CHECK(earning|commission|payout|adjustment), amount_cents (signed), note, created_at`; unique partial index `uq_provider_ledger_request_entry` allows one earning or commission row per request; provider/created index `idx_provider_ledger_provider`

**payouts** `id, provider_user_id→users, amount_cents, reference UNIQUE when present, method, paid_at, paid_by→admin_users, note`; provider/paid index `idx_payouts_provider`

**provider_bank_details** `provider_user_id PK→users, account_holder, bank_name, account_type CHECK(cheque|savings|transmission), branch_code, account_number_enc, account_last4, updated_at`; account numbers use AES-256-GCM encryption and are masked to providers.

**payments** additionally has a unique partial index on non-null `paystack_ref` (`uq_payments_paystack_ref`).

**ratings** `id, request_id→requests, rater_id→users, ratee_id→users, rater_role CHECK(driver|provider), stars int CHECK 1..5, comment, created_at, updated_at, UNIQUE(request_id, rater_id)`

**notifications** `id, user_id→users, title, body, kind, data jsonb, read_at, created_at`

**admin_users** `id, email UNIQUE, password_hash, name, created_at, last_login_at`

**app_settings** `key PK, value, updated_at, updated_by` seeded with: `commission_pct=15`, `road_factor=1.3`, `avg_speed_kmh=40`, `offer_radius_km=25`, `max_offers_per_request=5`, `request_expiry_seconds=180`, `provider_stale_seconds=120`, `cancel_fee_cents=0`, `provider_registration_fee_cents=15000`, `provider_registration_fee_enabled=false`, `provider_registration_waiver_enabled=true`, `driver_plus_monthly_cents=2900`, `driver_plus_trial_days=90`, `driver_plus_enabled=false`, `driver_plus_extra_offers=0`, `cash_payments_enabled=true`, `block_new_requests_when_unpaid=true`. Pricing settings are changed only through the verified pricing workflow, not generic settings writes.

**admin_change_challenges** `id uuid, admin_id→admin_users, code_hash, expires_at, attempts, verified_at, consumed_at, created_at`; codes are stored only as keyed hashes and can be verified/applied once.

**pricing_change_log** `id, admin_id→admin_users, challenge_id→admin_change_challenges, changes jsonb, created_at`; append-only record of each applied change and its before/after values.

**platform_charges** `id, user_id→users, purpose CHECK(provider_registration|driver_plus), amount_cents, gateway_fee_cents nullable, status CHECK(pending|paid|failed|abandoned), paystack_ref UNIQUE, paid_at, meta jsonb, created_at`.

**driver_memberships** `user_id PK→users, plan CHECK(plus), started_at, trial_ends_at, paid_until, created_at`. Provider registration payment/waiver timestamps and charge link are stored on `provider_profiles`.

**audit_log** `id, actor_type CHECK(user|admin|system|anonymous), actor_id, action, entity, entity_id, meta jsonb, request_id, ip, created_at`

Migration 014 makes `audit_log`, `pricing_change_log`, `provider_ledger` and `payouts` append-only, blocks deletes on `payments`, `platform_charges` and `requests`, and freezes a paid payment except paid to refunded.

**schema_migrations** `filename PK, checksum, applied_at`

**Seed services** (placeholder prices, admin-editable, validate in the pilot): flat_tyre base R180, jump_start R150, essentials R60, towing R450, **fuel R120 seeded with `active=false`** until the legal/safety review on carrying fuel is done. `per_km_cents` default 700 (R7/km), `min_distance_fee_cents` 2000 (R20).

---

## 8. API SPECIFICATION

Base URL: `${API_BASE}/api/v1`. JSON in/out. JWT in `Authorization: Bearer <token>`.

### 8.1 Response contract (fixed, never change without a blueprint update)
Success: `{ "ok": true, "data": { ... }, "requestId": "<id>" }`
Failure: `{ "ok": false, "error": { "code": "ZD-AUTH-001", "message": "Human readable message", "field": "email" | "phone" | null, "details": null }, "requestId": "<id>" }`
HTTP status codes: 200/201 success, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate limit, 500 unexpected.
Frontend `apiFetch(path, {method, body, auth})` returns `data` or throws `ApiError {code, message, field, status, requestId}`.

### 8.2 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | status, version, db up/down, missing env names |
| POST | `/auth/otp/request` | none | `{email, app}` sends code (rate limited) |
| POST | `/auth/otp/verify` | none | `{email, code, app}` returns `{token, user, isNewUser, profileComplete}` |
| GET | `/auth/me` | any | current user + profile + completeness flags |
| POST | `/auth/logout` | any | audit only (JWT is stateless) |
| PUT | `/drivers/me` | driver | create/update driver profile (name, phone, vehicle, consent) |
| POST | `/users/me/photo` | any | upload profile photo (multipart, field `photo`) |
| GET/POST/DELETE | `/drivers/me/saved-places` | driver | saved places |
| GET | `/drivers/me/plus` | driver | Driver Plus status |
| POST | `/drivers/me/plus/join` | driver | join Plus and start any configured trial |
| POST | `/drivers/me/plus/pay` | driver | initialize a Plus membership payment |
| PUT | `/providers/me` | provider | profile (name, phone, type, vehicle, base location, radius) |
| PUT | `/providers/me/organisation` | provider | company name + reg number (company type only) |
| PUT | `/providers/me/services` | provider | `{serviceIds:[]}` |
| POST | `/providers/me/documents` | provider | upload one document (`doc_type`, file) |
| GET | `/providers/me/documents` | provider | list own documents + status |
| POST | `/providers/me/submit` | provider | submit for review; fails if photo/docs/services missing |
| GET | `/providers/me/registration-fee` | provider | one-time registration-fee state |
| POST | `/providers/me/registration-fee/pay` | provider | initialize registration-fee payment |
| POST | `/providers/me/registration-fee/verify` | provider | verify and settle own registration-fee charge |
| POST | `/providers/me/online` | provider (approved) | `{online:boolean, lat, lng}` |
| POST | `/providers/me/heartbeat` | provider (approved) | `{lat, lng}` |
| GET | `/providers/me/offers` | provider (approved) | open offers |
| GET | `/providers/me/jobs` | provider | active + past jobs |
| GET | `/providers/me/earnings` | provider | totals, ledger entries |
| GET | `/services` | none | active services with prices |
| POST | `/requests/quote` | driver | `{serviceId, lat, lng}` returns price breakdown |
| POST | `/requests` | driver (profile complete) | create request and dispatch offers |
| GET | `/requests/:id` | driver/provider involved | status, provider info, ETA, provider location, myRating |
| POST | `/requests/:id/cancel` | driver/provider involved | `{reason}` |
| POST | `/requests/:id/accept` | provider | accept an offer (atomic, 409 if taken) |
| POST | `/requests/:id/decline` | provider | decline an offer |
| POST | `/requests/:id/arrived` | provider | mark arrived |
| POST | `/requests/:id/complete` | provider | mark completed |
| POST | `/requests/:id/record-payment` | provider | `{method: cash|eft, note?}` record offline payment |
| GET | `/requests` | driver | own history |
| POST | `/requests/:id/rate` | driver/provider | `{stars, comment}` |
| POST | `/payments/:requestId/pay` | driver | start card payment |
| POST | `/payments/:requestId/verify` | driver | verify and settle own ride payment |
| POST | `/payments/paystack/webhook` | Paystack signature | confirm payment |
| GET/PUT | `/providers/me/bank-details` | provider | read masked details or securely save bank details |
| GET | `/notifications?page&unreadOnly` | any | inbox with unreadCount |
| POST | `/notifications/read-all` | any | |
| POST | `/notifications/:id/read` | any | mark read |
| POST | `/admin/auth/login` | none | `{email, password}` |
| GET | `/admin/providers?status=pending` | admin | review queue |
| GET | `/admin/providers/:userId` | admin | profile + documents (signed URLs) |
| POST | `/admin/providers/:userId/approve` | admin | approve |
| POST | `/admin/providers/:userId/reject` | admin | `{reason}` |
| POST | `/admin/providers/:userId/waive-registration` | admin | waive provider registration fee |
| POST | `/admin/documents/:id/review` | admin | `{status, note}` |
| GET | `/admin/users`, `/admin/requests` | admin | lists with filters |
| POST | `/admin/requests/:id/assign` | admin | manual dispatch `{providerId}` |
| PUT | `/admin/services/:id` | admin | price/active edits |
| GET/PUT | `/admin/settings` | admin | commission, radius, expiry etc. |
| GET | `/admin/pricing` | admin | protected pricing values, last change and next eligible change |
| POST | `/admin/pricing/challenge` | admin | `{password}`; emails a one-time verification code |
| POST | `/admin/pricing/verify` | admin | `{challengeId, code}`; verifies the email challenge |
| POST | `/admin/pricing/apply` | admin | `{challengeId, changes}`; atomically applies allowed changes |
| POST | `/admin/requests/:id/mark-paid` | admin | `{method, receivedBy, note}` record payment |
| GET | `/admin/payouts?filter&q&page` | admin | provider balances and payout list |
| GET | `/admin/payouts/export?from&to` | admin | export payout CSV |
| GET | `/admin/payouts/:providerId` | admin | provider ledger and payout detail |
| GET | `/admin/payouts/:providerId/bank-details` | admin | reveal bank details (audited) |
| POST | `/admin/payouts/:providerId` | admin | record provider payout |
| POST | `/admin/payouts/:providerId/adjustment` | admin | record signed ledger adjustment |
| GET | `/admin/audit` | admin | audit log with filters |
| GET | `/admin/audit/export` | admin | filtered audit log CSV |
| GET | `/admin/revenue/summary` | admin | revenue, volume, gateway fees, and provider balance snapshot |
| GET | `/admin/revenue/daily` | admin | daily financial totals including zero-activity days |
| GET | `/admin/revenue/transactions` | admin | paginated ride, charge, payout and adjustment rows |
| GET | `/admin/revenue/export` | admin | export revenue transactions as CSV |
| GET | `/admin/revenue/reconcile` | admin | check payment, ledger and payout consistency |
| GET | `/admin/requests/:id/timeline` | admin | request timeline |
| POST | `/admin/users/:id/suspend` | admin | suspend user account |
| POST | `/admin/users/:id/unsuspend` | admin | unsuspend user account |
| POST | `/admin/users/:id/delete` | admin | delete user account |

---

## 9. BUSINESS RULES

### 9.1 Auth and roles
- `app` (`driver`|`provider`) is sent with every OTP request and verify. The backend creates a new user with that role on first verify. If the email belongs to the other role, return `ZD-AUTH-004` (403) with message "This email is registered as a <role>. Open the ZoomDrive<' Partner'> app instead."
- OTP: 6 digits, emailed, hashed, expires in 5 minutes, 5 attempts. Limits per email: 3 per 10 minutes, 10 per day, 30 seconds between codes; per IP 10 per hour; global daily cap `OTP_DAILY_EMAIL_CAP`. Delivery failure returns `ZD-EML-001` and invalidates the code. Phone is a required contact detail normalised to E.164 (082 123 4567, 0821234567 and +27 82 123 4567 all become +27821234567) and is NOT verified.
- `profileComplete`: driver = first and last name, phone and consent recorded; provider = status `submitted` only after photo + documents + services + consent.
- `SIGNUP_ENABLED=false` blocks new accounts with `ZD-AUTH-009`.

### 9.2 Provider verification
- Compulsory before submit: profile photo, first/last name, phone, at least one service, documents `id_document`, `drivers_licence`, `vehicle_insurance`, plus `company_registration` and company name/registration number for `company` type, consent.
- Server enforces the photo requirement (`ZD-PROV-001 PHOTO_REQUIRED`), not just the UI. Submit returns `ZD-PROV-002 DOCUMENTS_MISSING` with `details.missing`.
- Status flow: `pending` (after submit) → `approved` | `rejected` (with reason; provider can fix and resubmit). Only `approved` can go online (`ZD-PROV-005 NOT_APPROVED`).
- Documents are stored as private/authenticated Cloudinary assets; admin views via signed, expiring URLs. Profile photos are public.
- Company providers: one company owner account in the MVP (the person who registers). Staff accounts under a company are a later feature; do not build them now.

### 9.3 Pricing
`distance_km = haversine(provider_or_base, request) * road_factor` (at quote time with no provider yet, use the nearest approved online provider's distance, else a flat default of 5 km).
`distance_fee = max(min_distance_fee, round(distance_km * per_km_cents))`
`total = service_price + distance_fee` (the driver sees this and it is **fixed** once the request is created).
`commission = round(total * commission_pct / 100)`; `provider_earning = total - commission`.
All three are stored on the request at creation. Later admin changes never alter existing requests.

### 9.4 Dispatch and status machine
1. Driver creates a request: validate profile complete, service active, one open request per driver (`ZD-REQ-003 ACTIVE_REQUEST_EXISTS`).
2. Find providers: approved, online, offering the service, `last_seen_at` within `provider_stale_seconds`, within `offer_radius_km` of the request. Offer to the nearest `max_offers_per_request` (insert `request_offers`).
3. First provider to call accept wins using one atomic statement: `UPDATE requests SET status='accepted', provider_id=$1 ... WHERE id=$2 AND status='searching' AND provider_id IS NULL RETURNING *`. No row means `ZD-REQ-006 ALREADY_TAKEN` (409). Other offers become `expired`.
4. States: `searching → accepted → arrived → completed`; `cancelled` from `searching|accepted|arrived`; `expired` if no one accepts within `request_expiry_seconds` (background job runs every 30s).
5. Illegal transitions return `ZD-REQ-005 INVALID_TRANSITION`. All transitions live in `stateMachine.js` only.
6. If nobody is online, the driver sees "No providers nearby right now" and admin sees it in the requests list so it can be dispatched manually (pilot mode).
7. Every transition writes an audit row.

### 9.5 Completion, payment, ledger (rewritten in phase 11)
- On completed, a payments row exists (method unpaid, status pending, amount = total_cents). Provider earnings are NOT credited at completion.
- A payment is settled in exactly one of three ways, each idempotent: (a) card: the driver pays through Paystack (POST /payments/:requestId/pay, confirmed by verify or the signed webhook); (b) cash or EFT recorded by the assigned provider (only when cash_payments_enabled is true); (c) recorded by an admin (support or dispute case, with receivedBy provider or platform). A settled payment can never be settled a second way (ZD-PAY-008).
- Ledger (provider_ledger, signed cents; a provider's balance is the SUM of their ledger amounts; positive means the platform owes the provider, negative means the provider owes the platform): card or platform-received payment -> one 'earning' entry of +provider_earning_cents; cash or EFT received by the provider -> one 'commission' entry of -commission_cents (the provider already holds the money); payout recorded by an admin -> one 'payout' entry of -amount (linked by payout_id); admin correction -> 'adjustment' (signed, note required). A unique index allows one earning or commission entry per request. There is no separate informational commission entry.
- New requests are blocked for a driver who has a completed, unpaid job (ZD-PAY-006) when setting block_new_requests_when_unpaid is true AND Paystack is configured.
- Pilot payouts are manual EFT recorded by an admin (weekly batches recommended). Paystack transfers cost R3 each, so automatic payouts wait. Refunds are manual (Paystack dashboard plus an admin adjustment). Bank details are stored AES-256-GCM encrypted (DATA_ENCRYPTION_KEY), shown masked to the provider, and revealed to an admin only through the reveal endpoint, which writes an audit row.

### 9.6 Ratings
- Only the two parties of a completed request can rate it. A driver rates the provider; a provider may rate the driver. Rating never depends on payment status. Stars are 1 to 5, comment is optional (max 300 characters) and visible to admins only; the other party sees averages only.
- One rating per rater per request. Submitting again within 24 hours of the first rating updates it; after 24 hours it is locked (ZD-RAT-002).
- A provider's rating_avg and rating_count (provider_profiles) are recalculated in the same transaction from ratings where ratee_id is the provider and rater_role is 'driver'. A driver's average is calculated on demand from ratings where ratee_id is the driver and rater_role is 'provider'; there is no stored driver average.

### 9.7 Guest browsing (driver app)
Guests can open Home, service tiles, prices, Activity (empty), Account (sign-in prompt) and Safety/Support pages. Any action that creates data (request, saved place, payment method) redirects to `#/email?next=<route>` with a banner "Create a profile to request help". After signup the user returns to `next`.

### 9.8 Privacy (POPIA)
Consent checkbox at profile creation (privacy policy + terms, timestamped). Collect only what is needed. Provide account deletion on request (admin tool in phase 12). Store ID documents privately. Disclose audit logging, IP addresses and email in the privacy policy. This is not legal advice; get the policy reviewed before launch.

### 9.9 Pricing governance
- The commission default is 15%; migration 010 changes a still-default value of 12 to 15 without overwriting an admin-edited value.
- Sensitive pricing values are excluded from generic `PUT /admin/settings`. A pricing change requires the authenticated admin's password and a one-time code emailed to that admin account.
- Challenge codes are keyed-hashed, expire after 10 minutes, allow at most 5 verification attempts, and are one-use. Limit challenge requests to 3 per admin per 10 minutes and verification attempts to 5 per admin per 15 minutes.
- Validate all supplied values and ranges before applying. Apply changes, consume the challenge, append `pricing_change_log`, and write the audit event in one transaction protected by an advisory lock. Enforce the configured change cooldown before emailing a challenge and again while applying.
- A challenge or email failure must not report success. The development console mailer is allowed only outside production; SMTP credentials and message bodies are never logged.

### 9.10 Platform charges and memberships
- Provider registration charges and optional Driver Plus memberships use the `platform_charges` table; paid membership state is held in `driver_memberships`. Migration 010 provides the schema and registration-fee fields.
- Paystack credentials are optional; platform-charge endpoints are implemented in Phase 10. Never enable a payment flow without the required keys and verified webhook handling.

### 9.11 Audit policy
- Every data-changing API call is recorded by the API audit trail (who, route, result, IP and time; no request bodies) plus semantic audit rows describing what changed.
- Failed and denied write attempts and admin login failures are recorded. Page views and provider heartbeats are not recorded by the API audit trail.
- Audit rows are append-only. Personal data is never stored in audit metadata; emails appear only as keyed hashes.

### 9.12 Revenue and financial records
- Revenue summary ranges use inclusive Africa/Johannesburg calendar dates. Gross bookings, card/offline volume, commission and provider share are based on paid ride payments; commission is recognised when a payment settles. Registration fees and Driver Plus revenue are recognised when paid. Net revenue is commission + registration fees + Plus revenue - gateway fees.
- Daily rows include zero-activity dates. Transactions include paid rides and platform charges, payouts, and ledger adjustments. Owed-to/owed-by values are current provider ledger balance snapshots.
- Reconciliation checks paid-payment ledger entries, earning and commission amounts, payment versus request totals, paid requests that are not completed, payout totals against payout ledger lines, and completed requests unpaid for over seven days (informational).
- Financial rows are never deleted or edited; corrections are made with ledger adjustments. Retention period to be confirmed with an accountant.

---

## 10. ERROR SYSTEM (so problems are found fast)

### 10.1 Error codes
Format `ZD-<AREA>-<NNN>`. Registry in `backend/src/lib/errors.js` (code, httpStatus, default message). Every thrown `ApiError` uses a registered code. Never throw a bare `Error` for expected failures.

| Code | HTTP | Meaning |
|---|---|---|
| ZD-SYS-001 | 500 | Unexpected server error |
| ZD-SYS-002 | 503 | Database unavailable |
| ZD-SYS-003 | 404 | Route not found |
| ZD-SYS-004 | 429 | Too many requests. Please slow down. |
| ZD-SMS-001 | 502 | SMS delivery failed |
| ZD-VAL-001 | 400 | Validation failed (field named in `error.field`) |
| ZD-AUTH-001 | 401 | Missing or invalid token |
| ZD-AUTH-002 | 400 | OTP invalid or expired |
| ZD-AUTH-003 | 429 | Too many OTP attempts/requests |
| ZD-AUTH-004 | 403 | Email belongs to the other app (wrong app for this account) |
| ZD-AUTH-005 | 403 | Account suspended |
| ZD-AUTH-009 | 403 | Signups disabled |
| ZD-USR-001 | 400 | Profile incomplete |
| ZD-UPL-001 | 400 | File type not allowed |
| ZD-UPL-002 | 413 | File too large (limit 5 MB) |
| ZD-UPL-003 | 502 | Cloudinary upload failed |
| ZD-PROV-001 | 400 | Provider profile photo required |
| ZD-PROV-002 | 400 | Provider documents missing (`details.missing`) |
| ZD-PROV-003 | 400 | No services selected |
| ZD-PROV-004 | 400 | Company details missing |
| ZD-PROV-005 | 403 | Provider not approved |
| ZD-PROV-006 | 403 | Provider registration fee required to go online |
| ZD-REQ-001 | 404 | Request not found |
| ZD-REQ-002 | 400 | Service inactive or unknown |
| ZD-REQ-003 | 409 | Driver already has an active request |
| ZD-REQ-004 | 400 | Location invalid or outside service area |
| ZD-REQ-005 | 409 | Invalid status transition |
| ZD-REQ-006 | 409 | Offer already taken |
| ZD-REQ-007 | 403 | Not a party to this request |
| ZD-REQ-008 | 409 | Price changed since the quote (details.newTotalCents) |
| ZD-REQ-009 | 409 | Provider already has an active job |
| ZD-RAT-001 | 409 | Request is not completed, so it cannot be rated |
| ZD-RAT-002 | 409 | Rating can no longer be changed after 24 hours |
| ZD-PAY-001 | 502 | Paystack error |
| ZD-PAY-002 | 400 | Webhook signature invalid |
| ZD-PAY-003 | 503 | Paystack is not configured |
| ZD-PAY-004 | 404 | Payment charge not found or does not belong to user |
| ZD-PAY-005 | 400 | Payment amount must be greater than zero |
| ZD-PAY-006 | 409 | Previous job unpaid (details.requestId, details.totalCents) |
| ZD-PAY-007 | 409 | Payout exceeds the provider balance |
| ZD-PAY-008 | 409 | Payment is not payable now or is already settled |
| ZD-PAY-009 | 403 | Cash and EFT recording is switched off |
| ZD-PLUS-001 | 403 | ZoomDrive Plus is not enabled |
| ZD-ADM-001 | 401 | Admin login failed |
| ZD-ADM-002 | 409 | Provider is not waiting for review |
| ZD-ADM-003 | 404 | Admin target not found |
| ZD-ADM-004 | 409 | Required documents are not approved yet |
| ZD-ADM-005 | 403 | Pricing settings cannot be changed through generic settings |
| ZD-ADM-006 | 400 | Pricing challenge is invalid, expired or exhausted |
| ZD-ADM-007 | 409 | Pricing changes are in cooldown |
| ZD-ADM-008 | 429 | Too many pricing challenge attempts |
| ZD-ADM-009 | 409 | User has an active request or job |
| ZD-ADM-010 | 409 | User status or provider balance does not allow this action |
| ZD-EML-001 | 502 | Email delivery failed |

Add new codes to this table in the same commit that uses them.

### 10.2 Backend logging
One line per event: `[2026-10-25T10:15:00.123Z] [LEVEL] [reqId] [module] CODE message {json meta}`. Levels: `INFO`, `WARN`, `ERROR`. Every request logs method, path, status, ms. Errors log the code and stack (stack only in development responses; production responses never include stacks). Secrets, tokens, OTP codes (except through a development-only console driver), message bodies, full email addresses (mask as `j***@domain.com`), phone numbers beyond the last 4 digits and document URLs are never logged.

### 10.3 Boot self-check
`server.js` prints a table before listening, for example:
```
[ZD][BOOT] env ........ OK
[ZD][BOOT] database ... OK (latency 34ms)
[ZD][BOOT] migrations . OK (8 applied, 0 pending)
[ZD][BOOT] cloudinary . OK
[ZD][BOOT] listening on :4000
```
A failure prints `[ZD][BOOT][FAIL] <check> <named reason>` (for example `env: missing JWT_SECRET`) and exits with code 1. Port busy prints `[ZD][BOOT][PORT_IN_USE] 4000 busy. Run: npx kill-port 4000`.

### 10.4 Frontend error surface
- `shared/errors.js` registers `window.onerror` and `unhandledrejection`, logs `console.error('[ZD-ERR]', {...})`.
- Every failed API call shows a visible banner: message plus a small `Code ZD-REQ-003 · ref a1b2c3`. A **Copy details** button copies JSON `{app, version, route, code, status, requestId, time}` so Romeo can paste it straight to Claude.
- Field errors (`error.field`) highlight the matching input.
- Each page module wraps its render in try/catch and shows a "This page failed to load" card with the same Copy details button instead of a blank screen.
- `config.js` sets `ZD_DEBUG` (true on localhost) which adds route and API timing logs.

### 10.5 Static checks (`npm run check` in backend and frontend)
Fails the phase if any rule trips, printing `file:line rule`:
1. Every `.js` file passes `node --check`.
2. No source file is empty or contains only comments/TODO.
3. Every migration file is non-empty and contains at least one `CREATE` or `ALTER`.
4. No `localhost`/`127.0.0.1` in `frontend/public` outside `shared/config.js`.
5. No `.env` committed; no strings matching key patterns (`sk_live`, `sk_test`, `postgres://`, `Bearer ey`).
6. Frontend: no use of `.ok` or `.json()` on an `apiFetch` result (pattern check).
7. Frontend: no `innerHTML =` with a variable that is not wrapped in `escapeHtml()`.
8. Backend: every `throw new Error(` outside `lib/` and `scripts/` is flagged; use `ApiError`.
9. Every error code used in code exists in `errors.js`, and every code in `errors.js` appears in section 10.1 (checked by regex on this file).
10. Frontend: every `<button>` tap target class has min-height 44px in `components.css` (spot check).
11. Frontend: no empty catch blocks; comment-only bodies are allowed.
12. Frontend: no inline `onclick`, `onchange` or `onsubmit` handler attributes in HTML or `innerHTML` templates.
13. Frontend: `vercel.json` contains a Content-Security-Policy with `frame-ancestors 'none'`.
14. Frontend: no `#/phone` references except the documented legacy alias in `shared/router.js`.
15. Backend: every `z.string()` must have `.max()`, `.length()`, `.regex()`, `.email()` or `.uuid()` on the same or next 2 lines.
16. Backend: no `origin: true`, no `origin: '*'`, no argument-less `cors()` in `src/`.
17. Backend: no empty catch blocks in `src/` or `scripts/` (comment-only bodies allowed).

---

## 11. FRONTEND SPECIFICATION (screens)

All routes are hash routes inside each app. Layout is mobile-first and fills the screen on every device; bottom navigation below 900px and a left side rail from 900px; content max width 1200px, forms 560px. Keep the top bar and scroll area safe-area aware.

### 11.1 Landing `/` (`index.html`)
Logo, one line pitch, two large buttons: "I need help" (opens `/driver/`) and "I provide help" (opens `/provider/`), plus install tips for each app and a note about adding to Home Screen.

### 11.2 Driver app (`/driver/`) bottom nav: Home, Activity, Account
- `#/welcome` (shown when no token): logo, headline, **Sign up**, **Log in**, **Just looking?** (guest browse).
- `#/email`: email field, Continue, terms line. Shows the "Create a profile to request help" banner when `next` is present.
- `#/otp`: 6 boxes, auto-advance, resend after 30s. In dev, shows the echoed code.
- `#/profile-setup`: optional profile photo, first name, surname, required phone, signed-in email, optional vehicle (make, model, colour, plate, e-hailing platform), consent checkbox, Create profile.
- `#/home`: headline "Stuck? We'll come to you.", service tiles (from `/services`), "Where are you?" bar with Use GPS, current/saved/recent places list, Fleet-profile teaser (static, non-functional placeholder).
- `#/request`: step bar, map with pin (drag to adjust), service picker, price card (service + distance fee + fixed total), payment method row, promo row (placeholder), **Request help**.
- `#/searching/:id`: animated "Finding help nearby", countdown to expiry, Cancel.
- `#/track/:id`: map with driver pin and provider pin, ETA, provider card (photo, name, rating, jobs, verified badge, company name if any, vehicle and plate), Call (`tel:` link), Share trip (Web Share API), Safety, Cancel; completed jobs continue to payment.
- `#/pay/:id`: fixed-total card payment after completion, Paystack return verification, and Pay later to rating; payment must be settled before a new request when configured.
- `#/rate/:id`: stars + optional comment after completion; ratings can be edited for 24 hours.
- `#/plus` (sign-in required, Account tab): Plus benefits, trial/active/lapsed membership state, trial join or Paystack pass purchase, and payment-return status refresh without a client verify endpoint. Show this Account row only while Plus is enabled.
- `#/activity`: upcoming (empty state), past requests with status and total; tap for detail.
- `#/inbox` (sign-in required): paginated notifications, read actions and request navigation.
- `#/account`: name + photo, email and phone, Notifications with unread count, optional "Verify identity" banner (placeholder), Edit profile, Payment, Support, Safety, Saved places, Settings, Promotions (placeholder), Log out. No role-switch item.

### 11.3 Provider app (`/provider/`) bottom nav: Home, Earnings, Inbox, Menu
- `#/welcome`, `#/email`, `#/otp`: as driver, provider branding.
- `#/type`: **Individual** or **Company or organisation**.
- `#/profile-setup`: **profile photo (required, red error if missing)**, first name, surname, required phone, signed-in email, company name and registration number (company only), vehicle description and plate, base location (map pick or GPS), service radius, services chips, consent.
- `#/documents`: upload rows: ID document, driver's licence, vehicle and insurance, company registration certificate (company only). Each shows Upload, Uploaded ✓ or Rejected with the admin's note. **Submit for review** is disabled until everything required is present.
- `#/pending`: "Profile under review" (shows rejected state with reason and a fix button).
- `#/home`: status ("You're offline/online"), map card, Opportunities card (static for now), big **Go Online** button (requests location permission, starts heartbeat). While online, a job offer card appears: service, distance, driver rating, "You earn R…", Accept/Decline.
- `#/job/:id`: driver details, **Navigate** (opens Google Maps/Waze link with coordinates), Call, Arrived, Complete, Cancel; wait for payment or record received cash/EFT; optionally rate the driver after completion.
- `#/earnings`: ledger-backed balance, today's and seven-day earnings, ledger activity and payout history; cash/EFT commission is shown as an amount owed to ZoomDrive.
- `#/inbox`: notifications with unread dot and read actions.
- `#/menu`: profile card (photo, name, rating, acceptance), Help, Safety, Settings, More ways to earn (Opportunities, Referrals placeholders), Manage (Vehicle, Services offered, Documents), Registration fee, Money (Tax info placeholder, Payout methods), Log out.
- `#/registration-fee`: one-time fee state and Paystack checkout/return.

### 11.4 Admin panel (`/admin/`)
Login; Overview (counts: pending providers, active requests, today's jobs, revenue); Providers (queue with filters, detail with photo, documents viewer, approve/reject with reason, waive registration fee); Users (status filter, email column, search by name/email/phone, suspend/unsuspend, account deletion, Activity shortcut to audit log); Requests (filters, detail with offers/candidates, manual assign, cancel, mark paid and dispute timeline); Services and prices; Settings; Pricing (three-step password/code/change flow); Payouts (provider balances, audited bank reveal, payouts, adjustments, CSV export); Audit log (actor, entity, date, type and request-id filters; API result badge; export CSV); Revenue (Summary: KPI cards and daily table; Transactions: type filter, search, table, export CSV; Reconcile: consistency check with issue list).

### 11.5 PWA requirements
- Each app: manifest with `id`, `name`, `short_name`, `start_url` (`/driver/` or `/provider/`), `scope`, `display: standalone`, `theme_color #FFB400`, `background_color #FFFFFF`, 192/512/maskable icons.
- Service worker per app: caches the app shell, never caches `/api` calls, versioned cache name, cleans old caches, shows an offline notice instead of a blank screen.
- `shared/pwa.js`: captures `beforeinstallprompt` (Android/desktop) and shows an **Install app** button; on iOS shows an "Add to Home Screen" instruction card. The install button must work on mobile, not only desktop.

---

## 12. SESSION PROTOCOL

**Start of session:** read section 0, then the current phase. Run `npm run check` (and `npm run schema:audit` from phase 1) to confirm the starting state is clean. Fix anything red before new work.
**During:** small batches of tasks, self-verify, tick boxes as tasks finish.
**End of session or phase:** run the phase verification block, update section 0 (CURRENT PHASE, LAST TASK DONE, NEXT ACTION, BLOCKERS), append a Build Log row, and append that phase's manual test checklist to `docs/manual-tests.md`. At a phase boundary print the completion line and stop.
**Claude's role:** architecture, review, bug diagnosis from pasted error details, and writing the exact Windsurf prompts. When Romeo pastes "Copy details" JSON or a `BLOCKED` report, Claude diagnoses from the error code and request id first.

---

## 13. PHASES

Each phase ends with a **Gate**: all tasks `[x]`, verification passes, section 0 and 14 updated, then stop.

### PHASE 0: Repo scaffold and tooling
Goal: empty-but-runnable monorepo with checks, logging and health.
- [x] P0.1 Create folders per section 5 (only for files in phase 0; no empty placeholders), `.gitignore`, `README.md`, `docs/manual-tests.md`.
- [x] P0.2 `backend/package.json` (scripts: `dev`, `start`, `check`, `migrate`, `schema:audit`, `seed`; dependencies: express, pg, dotenv, helmet, cors, express-rate-limit, jsonwebtoken, zod, multer, cloudinary, bcryptjs, uuid) and `.env.example` per section 6.
- [x] P0.3 `config/env.js`: validates env, fails fast naming the missing variable; refuses `OTP_DEV_ECHO=true` in production; requires `JWT_SECRET` length 32+.
- [x] P0.4 `lib/ApiError.js`, `lib/errors.js` (registry from section 10.1), `lib/logger.js` (format from 10.2).
- [x] P0.5 `middleware/requestId.js`, `notFound.js`, `errorHandler.js` implementing the contract in 8.1.
- [x] P0.6 `app.js` (helmet, CORS from `FRONTEND_ORIGINS`, JSON limit 1mb, routes mount) and `server.js` (boot self-check from 10.3), `scripts/start-safe.js`.
- [x] P0.7 `modules/health/health.routes.js`: `GET /api/v1/health`.
- [x] P0.8 `scripts/check.js` implementing the backend-applicable rules in 10.5.
Verification: `npm run check` passes; `node --check` on all files; `npm run dev` boots and prints the self-check table; `curl localhost:4000/api/v1/health` returns `{ok:true,...}`; unknown route returns `ZD-SYS-003` with `requestId`.
Manual test (Romeo): run `npm run dev`; open `http://localhost:4000/api/v1/health` and confirm JSON; open a wrong path and confirm a JSON error with a code.

### PHASE 1: Database and migrations
- [x] P1.1 `db/pool.js` (Neon SSL, max connections 5, error logging with `ZD-SYS-002` mapping).
- [x] P1.2 Migrations 001 to 008 per section 7 (real SQL, no empty files).
- [x] P1.3 `scripts/migrate.js`: runs pending files in order inside a transaction each, stores checksum, **refuses to run an empty file**, verifies each table named in the file exists after applying, prints per-file result.
- [x] P1.4 `scripts/schema-audit.js`: lists expected tables/columns from migrations vs live DB and prints missing/extra; exit code 1 on drift.
- [x] P1.5 `db/seed/*.sql` and `scripts/seed.js` (services and settings, idempotent upsert).
- [x] P1.6 `lib/audit.js` `writeAudit({actorType, actorId, action, entity, entityId, meta, requestId, ip})`.
- [x] P1.7 `health` reports `db: up|down` and migration count.
Verification: `npm run check`; `npm run migrate` twice (second run applies nothing); `npm run schema:audit` shows zero drift; `npm run seed` twice leaves 5 services and the settings keys of section 7.
Manual test: open Neon dashboard and confirm tables exist; open `/health` and confirm `db: up`.

### PHASE 2: Authentication (phone + OTP) and role-per-app
- [x] P2.1 `lib/phone.js` normalise + validate (SA numbers; reject others with `ZD-VAL-001` field `phone`).
- [x] P2.2 `middleware/validate.js` (zod), `middleware/rateLimit.js` (OTP limits from 9.1).
- [x] P2.3 `otp.service.js` + drivers `console` and `bulksms` (stub that throws `ZD-SYS-001` with message "bulksms not configured" until phase 14).
- [x] P2.4 `auth.service.js`: request OTP, verify OTP (create user with role from `app`, enforce `ROLE_MISMATCH`, honour `SIGNUP_ENABLED`, suspended check), issue JWT.
- [x] P2.5 `middleware/auth.js`, `requireRole.js`; routes `/auth/otp/request`, `/auth/otp/verify`, `/auth/me`, `/auth/logout` with audit rows.
- [x] P2.6 `profileComplete` computation in `/auth/me`.
Verification: `npm run check`; `curl` scripted flow in `docs/manual-tests.md` (request OTP with `OTP_DEV_ECHO=true`, verify, call `/auth/me`); wrong app returns `ZD-AUTH-004`; 4th OTP request in 10 minutes returns `ZD-AUTH-003`.
Manual test: run the curl sequence (or REST client) for a driver number and a provider number; confirm role mismatch message.

### PHASE 3: Profiles, uploads, organisations, documents
- [x] P3.1 `uploads/cloudinary.service.js` (public photos; private/authenticated documents; folders `zoomdrive/<env>/...`).
- [x] P3.2 `middleware/upload.js` (jpeg/png/webp for photos; plus pdf for documents; 5 MB; `ZD-UPL-001/002`).
- [x] P3.3 Driver endpoints: `PUT /drivers/me`, saved places CRUD, `POST /users/me/photo`.
- [x] P3.4 Provider endpoints: `PUT /providers/me`, `/organisation`, `/services`, documents upload/list, `POST /providers/me/submit` enforcing 9.2 (`ZD-PROV-001..004`).
- [x] P3.5 `requireApproved.js` and apply to online/heartbeat/offers routes (stubs return `ZD-PROV-005` until approved).
Verification: `npm run check`; submit with no photo returns `ZD-PROV-001`; with photo but missing documents returns `ZD-PROV-002` listing the missing types; company type without company name returns `ZD-PROV-004`.
Manual test: upload a photo and a document using a REST client or the phase 5/6 UI later; confirm they appear in Cloudinary.

### PHASE 4: Frontend foundation and PWA shells
- [x] P4.1 `frontend/package.json`, `vercel.json`, `scripts/check.js`, `scripts/build-icons.js`.
- [x] P4.2 `brand/` SVGs from section 3; generate icons for both apps.
- [x] P4.3 `shared/styles/tokens.css`, `base.css`, `components.css` (buttons, fields, cards, tiles, list rows, bottom nav, banner, toast, error banner, steps bar).
- [x] P4.4 `shared/config.js`, `api.js` (contract 8.1), `auth.js`, `errors.js` (10.4), `ui.js`, `router.js` (guards: public routes, auth-required routes, `next` support), `pwa.js`.
- [x] P4.5 Components: `topbar.js`, `bottom-nav.js`, `field.js`, `photo-upload.js`, `doc-upload.js`, `status-badge.js`.
- [x] P4.6 `index.html` landing; `driver/` and `provider/` shells (`index.html`, `app.js`, `manifest.webmanifest`, `sw.js`) each rendering a placeholder welcome route.
- [x] P4.7 Service workers: shell cache, never cache `/api`, versioned cache.
Verification: `npm run check` (frontend); manifest JSON validity via `node -e "JSON.parse(require('fs').readFileSync(...))"`; `grep` confirms two different `scope`/`id` values; no localhost outside `config.js`.
Manual test (Romeo): open `/`, `/driver/`, `/provider/` locally; install each to the phone Home Screen; confirm two different icons and names; confirm the install button appears on mobile.

### PHASE 5: Driver sign-up and profile (guest browse + gate)
- [x] P5.1 Welcome, Phone, OTP, Profile-setup pages wired to the API with field errors and the error banner.
- [x] P5.2 Guest mode: Home/Activity/Account render for guests; gate redirects to `#/phone?next=...` with banner (9.7).
- [x] P5.3 Role-mismatch UX: friendly screen with a button to the other app.
- [x] P5.4 Optional photo upload on profile setup; consent checkbox required.
- [x] P5.5 Account page shows name/photo, Log out clears token and returns to welcome.
Verification: `npm run check`; grep confirms every API call goes through `apiFetch`.
Manual test: sign up as a driver with and without a photo; log out and in; browse as a guest and tap Request to confirm the sign-up gate; try the provider number in the driver app and confirm the mismatch message.

### PHASE 6: Provider sign-up, profile, documents
- [x] P6.1 Welcome/Phone/OTP (provider branding), Type chooser (individual / company).
- [x] P6.2 Profile-setup with **required photo**, company fields, vehicle, base location, radius, services, consent.
- [x] P6.3 Documents page with per-document upload states and Submit for review (disabled until complete).
- [x] P6.4 Pending page (pending/rejected states); route guard sends unapproved providers only to onboarding/pending routes.
Verification: `npm run check`; attempt submit without photo shows `ZD-PROV-001` message in the UI.
Manual test: register as an individual provider and as a company provider; try to submit without a photo (must be blocked); upload documents; confirm Pending screen.

### PHASE 7: Admin panel (review and configuration)
- [x] P7.1 `adminAuth` middleware, `scripts/create-admin.js` (prompts for email and password; never echoes the password).
- [x] P7.2 Admin APIs: login, providers queue/detail (signed document URLs), approve/reject (reason), document review, users list, services CRUD, settings.
- [x] P7.3 Admin frontend: login, overview, providers list, provider detail (photo, documents, approve/reject), users, services and prices, settings.
- [x] P7.4 Approve/reject writes audit rows and a notification to the provider.
Verification: `npm run check`; approving a non-submitted provider returns a clear coded error.
Manual test: log in as admin; approve the provider from phase 6; log in as that provider and confirm the app unlocks; reject another with a reason and confirm it shows in the provider app.

### PHASE 8: Requests, pricing, dispatch (backend)
- [x] P8.1 `lib/money.js`, `lib/geo.js`, `lib/pricing.js` (9.3).
- [x] P8.2 `stateMachine.js` and `requests.service.js` (create, accept, decline, arrived, complete, cancel).
- [x] P8.3 `dispatch.service.js` (offers to nearest providers; manual assign for admin) and `expiry.job.js` (30s interval).
- [x] P8.4 Provider online/heartbeat/offers/jobs endpoints; `GET /services`; `POST /requests/quote`.
- [x] P8.5 Atomic accept (9.4 step 3) and audit rows for every transition.
Verification: `npm run check`; scripted curl scenario in `docs/manual-tests.md`: quote → create → offer visible to provider → accept (second accept returns `ZD-REQ-006`) → arrived → complete; cancel from each state; expiry job expires an unaccepted request.
Manual test: run the scripted scenario with one driver and one approved provider.

### PHASE 9: Driver request flow (frontend)
- [x] P9.1 `shared/map.js`, `shared/geo.js` (Leaflet via CDN, geolocation helper, permission denied fallback to manual pin).
- [x] P9.2 Home, Request (quote refresh on pin move), Searching, Track (5s polling, ETA, provider card), Rate, Activity list/detail.
- [x] P9.3 Saved places, Payment methods (placeholder), Safety, Support, Settings pages.
- [x] P9.4 Cancel flow and expired/no-providers state.
Verification: `npm run check`; no API calls bypass `apiFetch`; polling timers cleared on route change (grep for `setInterval` paired with cleanup).
Manual test: with the provider app open on another device/browser tab, request help end to end; test cancel and no-provider cases.

### PHASE 10: Pricing governance, provider charges, and Plus
- [x] P10.1 Backend pricing governance, emailed admin challenge, protected settings, mailer/env configuration, and migration 010 pricing defaults.
- [x] P10.2 Paystack transaction initialization, verification, webhook signature validation, and raw webhook-body routing.
- [x] P10.3 Provider registration-fee payment, enforcement, verification, admin waiver, and notifications.
- [x] P10.4 Driver Plus join/trial/payment state and membership extra-offer cap.
- [x] P10.5 Admin pricing page with challenge, verification, change review/apply, provider fee status/waiver, and protected Settings values.
- [x] P10.6 Provider Home with Go Online (location permission, heartbeat every 15s, offer polling every 5s), offer card with Accept/Decline.
- [x] P10.7 Job page (Navigate link, Call, Arrived, Complete, Cancel).
- [x] P10.8 Earnings, Inbox, Menu, Services offered, Vehicle, Payout methods (display + placeholders).
- [x] P10.9 Heartbeat singleton stops when offline or when the page is hidden for more than 5 minutes; logout clears online state.
- [x] P10.10 Registration-fee payment return and verification, provider routes/guards, and global fee-required navigation.
- [x] P10.11 Driver Plus screen, conditional Account row, and Paystack return status refresh.
- [x] P10.12 Phase 10 manual-test checklist, Blueprint updates, and frontend/backend checks.
Verification: `npm run check`; timers cleaned up on logout.
Manual test: go online, receive and accept a driver's request, complete the job, check earnings.

### PHASE 11: Payments, ledger, payouts
- [x] P11.1 Migration 011 and idempotent ledger service.
- [x] P11.2 Ride payments (card pay/verify/webhook, cash/EFT recording, admin mark-paid, unpaid block).
- [x] P11.3 Provider earnings API and encrypted bank details.
- [x] P11.4 Admin payouts backend (balances, payout, adjustment, CSV).
- [x] P11.5 Driver pay screen and payment status in Home/Activity.
- [x] P11.6 Provider app earnings, payout methods, cash/EFT recording.
- [x] P11.7 Admin Payouts and Requests pages.
- [x] P11.8 Manual tests and blueprint wrap-up.
Verification: `npm run check`; duplicate webhook or verify never double-credits; sum of earning entries equals the provider_earning_cents of card-paid jobs; a request can never be settled twice.
Manual test: pay a test request with Paystack test keys; record a payout in admin; confirm provider balance drops.
Note: confirm with Paystack whether split payments/subaccounts suit this marketplace before automating provider payouts. Decided: ledger-manual with manual EFT payouts for the pilot.

### PHASE 12: Ratings, notifications, audit and disputes
- [x] P12.1 Ratings endpoints and rating average updates.
- [x] P12.2 Notifications service (events: offer received, request accepted, provider arrived, job completed, provider approved/rejected) and inbox endpoints.
- [x] P12.3 Admin audit log page with filters (actor, entity, date, request id) and a request timeline view for disputes.
- [x] P12.4 Admin tools: suspend/unsuspend user, delete account on request (anonymise, keep ledger).
- [x] P12.5 Driver and provider frontend ratings, notifications inboxes and unread indicators.
- [x] P12.6 Admin audit log, request timeline and user moderation frontend.
- [x] P12.7 Phase 12 manual tests and Blueprint wrap-up.
Verification: `npm run check`; every status transition has an audit row (scripted check query in `docs/manual-tests.md`).
Manual test: complete a job, rate it, check inbox on both apps, open the request timeline in admin.

### PHASE 13: Hardening
- [x] P13.1 Security pass: `.env` never in git history (`git log --all -- backend/.env`), `JWT_SECRET` real in Render, CORS exact origins, helmet CSP for frontend, no secrets in repo (run check rule 5 across history).
- [x] P13.2 Rate limits on all write endpoints, upload limits, input length limits.
- [x] P13.3 SMS OTP via `bulksms` driver (or chosen provider), `OTP_DEV_ECHO=false` in production.
- [x] P13.4 360px width review of every screen, tap targets 44px, safe areas, desktop side rail.
- [x] P13.5 PWA polish: install button works on mobile, offline notice, icon audit, update-available toast.
- [x] P13.6 Error review: every API failure path shows a coded banner; remove any silent catch blocks (`catch(e){}`).
Verification: `npm run check` both sides; grep for empty catch blocks returns none.
Manual test: full regression using `docs/manual-tests.md`.

### PHASE 13B: Email login, responsive layout, full audit and revenue
- [x] P13B.1 Brevo mailer and email OTP backend.
- [x] P13B.2 Email login and phone-in-profile screens (driver and provider).
- [x] P13B.3 Responsive full-screen layout for phone, tablet and desktop.
- [x] P13B.4 Audit coverage, API audit trail and immutability.
- [x] P13B.5 Revenue backend: summary, daily, transactions, export, reconcile.
- [x] P13B.6 Admin Audit upgrades and Revenue page.
- [x] P13B.7 Manual tests and blueprint wrap-up.
Verification: `npm run check` both sides.
Manual test: see `docs/manual-tests.md` Phase 13B.

### PHASE 14: Deployment and pilot launch
- [ ] P14.1 Render service (root `backend`, env vars set in dashboard), Neon production database, run migrations and seed.
- [ ] P14.2 Vercel project, Root Directory `frontend`, Framework Preset `Other`, no Build Command, Output Directory `public`, set `API_BASE` production URL in `config.js`.
- [ ] P14.3 Domain and subdomain plan (for example `zoomdrive.co.za` for the apps and `api.zoomdrive.co.za` for the API), HTTPS verified.
- [ ] P14.4 Create the admin account in production; seed services; set real prices from pilot findings.
- [ ] P14.5 Pilot runbook in `docs/`: how to onboard and approve providers, how to dispatch manually, how to record payouts, support contacts.
- [ ] P14.6 Backups: Neon point-in-time recovery confirmed; weekly export reminder.
- [ ] P14.7 Hosting note: Render free tier sleeps and delays the first request; move to a paid instance before the pilot goes live.
Verification: `/health` on the production API shows `db: up` and the correct version; fresh sign-up works on the live domain.
Manual test: one real driver and one real provider complete a live job.

---

## 14. BUILD LOG (append a row at the end of every session)

| Date | Phase | Tasks done | Verified by | Notes / issues | Next |
|---|---|---|---|---|---|
| 25 Oct 2026 | none | Blueprint v1.0 written | n/a | Name changed to ZoomDrive; two-app architecture agreed | Phase 0 |
| 28 Oct 2026 | 0 | P0.3-P0.5 (env, errors, ApiError, logger, middleware) | node --check, throwaway scripts | All verification checks passed | P0.6 |
| 28 Oct 2026 | 0 | P0.6-P0.7 (app.js, server.js, start-safe.js, health.routes) | node --check, fetch test | Health endpoint and 404 handling verified | P0.8 |
| 28 Oct 2026 | 0 | P0.8 (check.js, README.md, manual-tests.md) | npm run check, self-test | All static checks implemented and passing | Manual test |
| 28 Oct 2026 | 1 | P1.1+P1.6 (pool.js, audit.js, DATABASE_URL required) | node --check, checkDb test | Pool connects, audit validates actorType | P1.2 |
| 29 Oct 2026 | 1 | P1.2-P1.5 (migrate.js, schema-audit.js, seed.js) | npm run migrate, schema:audit, seed | 8 migrations applied, 19 tables, 5 services (4 active), 8 settings | P1.7 |
| 29 Oct 2026 | 1 | P1.7 (server.js boot self-check, health routes db status) | node --check, npm run check | Boot checks db latency and migrations, health endpoint reports db up/down | Manual test |
| 29 Oct 2026 | 3 | P3.4-P3.5 (providers, organisations, documents, app mount) | npm run check | Implemented provider flows, upload/delete lifecycle, submit order, added /api/v1/providers mount | Manual test |
| 1 Nov 2026 | 4 | P4.1-P4.7 (frontend shell, shared modules, components, PWA, router, static checks) | npm run check | Full frontend foundation: config, API, auth, errors, UI, router, PWA, components, driver/provider app shells with welcome route, check.js with 7 frontend rules | Manual test |
| 1 Nov 2026 | 5 | P5.1-P5.5 (driver auth flow, profile setup, guest mode, account, router edits, check rule 12) | npm run check | Driver sign-up and profile: phone/OTP validation, photo upload, consent, guest browsing, account page, logout modal, needsProfile guard, NOFETCH check rule | Manual test |
| 2 Nov 2026 | 7 | P7.1 (adminAuth, create-admin.js), P7.2 backend (login, overview, users, services, settings), P7.4 (notifications, signed URLs, provider review) | npm run check | Admin auth middleware with timing-safe bcrypt, login rate limiter, error codes ZD-ADM-002/003/004, admin APIs with audit rows, notifications service, signed Cloudinary document URLs, provider review with approve/reject/document review workflows | P7.3 (admin frontend) |
| 2 Nov 2026 | 7 | P7.3 (admin frontend: login, overview, providers list, provider detail with documents, users, services, settings) | npm run check | Admin app with login screen, overview dashboard, providers queue with filters and search, provider detail page with profile info, document cards with previews, approve/reject workflows, users list, services price editor, settings form, CSS additions for banners and link buttons | Manual test |
| 2 Nov 2026 | 7 | P7.3 (provider review interaction fixes and final frontend check) | npm run check | Preserved document/provider rejection reasons, refreshed details after API errors, and used API page size for provider pagination | Romeo manual tests for Phases 3 to 7, then P8.1 |
| 2 Nov 2026 | 8 | P8.1, P8.2, P8.3, P8.5 (request pricing, lifecycle, dispatch and expiry) | npm run check | Added request pricing/lifecycle services, candidate dispatch, admin assignment, expiry job, atomic provider acceptance and audit events; added ZD-REQ-008/009 | P8.4 |
| 2 Nov 2026 | 8 | P8.4 (request/provider/admin controllers and routes) | npm run check | Mounted request routes, added provider online/heartbeat/offers/jobs and admin request list/detail/assign/cancel; documented the Phase 8 end-to-end manual test | Romeo manual tests for Phases 3 to 8 (and Phase 7 admin UI), then P9.1 |
| 2 Nov 2026 | 9 | P9.1 and Home/Request portion of P9.2 (U1) | npm run check (only expected empty page modules reported) | Added geolocation and Leaflet map helpers, map styles, services/GPS/saved-place Home flow, request map and live quote submission | P9.2 Searching, Track, Rate and Activity |
| 2 Nov 2026 | 9 | Searching, Track, Rate, Activity and P9.4 states (U2) | npm run check (only expected empty P9.3 page modules reported) | Added chained 5-second polling, visibility pause/resume, provider tracking, cancellation and terminal states, rating placeholder, paginated activity details | P9.3, guest-gating review and documentation |
| 2 Nov 2026 | 9 | P9.3, guest-gating review and P9 wrap-up (U3) | npm run check (expected empty P9.3 modules only) | Added saved places CRUD (address required by the backend schema) and account pages; wired account links and Account-tab navigation. Gated Request through its guest redirect and added auth guards to Searching, Track and Rate so guests cannot load request data. Render failures use the router's standard "This page failed to load" card with Copy details. | Romeo manual tests for Phase 9, then P10.1 |

| 2 Nov 2026 | 10 | P10.1 Pricing governance backend (V1) | `npm run check` | Added protected pricing settings, password + emailed-code challenge, hard bounds, cooldown, audit/change log, console/SMTP mailer and migration defaults. | P10.2-P10.4 (V2) |
| 2 Nov 2026 | 10 | P10.2-P10.4 Paystack charge gateway, provider registration-fee gating, Driver Plus (V2) | `npm run check` passed | Added Paystack transactions and signed webhook settlement for platform charges; provider fee status/pay/verify, admin waiver, approved-provider online/accept gate, Plus trial/join/pay state and extra-offer cap. Migration 010 remains unchanged. | P10.5 (V3) |
| 2 Nov 2026 | 10 | P10.5 Admin pricing frontend (V3) | `npm run check` | Added Pricing navigation and challenge/review/apply UI, provider registration-fee display/waiver, and read-only pricing fields in Settings. Frontend maps the pricing controls to the current backend's pricing API field names and derives the challenge countdown from its expiry response. | P10.6-P10.10 (V4) |
| 2 Nov 2026 | 10 | P10.6-P10.10 Provider frontend (V4) | `npm run check` (blocked only by then-empty `driver/pages/plus.js`) | Added app-wide provider heartbeat with logout/background-offline handling; provider Home offers and active-job resume; job lifecycle, earnings, inbox/menu, service and vehicle editing, payout placeholder, registration-fee payment return/verification, route guards and fee-required global redirect. | P10.11-P10.12 (V5) |
| 2 Nov 2026 | 10 | P10.11-P10.12 Driver Plus, Phase 10 manual tests and Blueprint (V5) | `npm run check` (frontend and backend) | Added Plus route/page, conditional Account entry, Paystack-return status refresh without a verify API; appended governance, registration-fee, provider and Plus manual tests and Neon queries. | Romeo manual tests for Phase 9 and Phase 10, then P11.1 |
| 2 Nov 2026 | 11 | P11.1-P11.2 (ledger and ride payments) | `npm run check` (backend) | Added idempotent ledger postings and card, cash/EFT, admin-recorded payment settlement; surfaced payment status and blocked new requests when configured. Migration 011 was already applied and left unchanged. | P11.3-P11.4 |
| 2 Nov 2026 | 11 | P11.3-P11.4 (provider earnings/bank details, admin payouts) | `npm run check` (backend) | Added AES-256-GCM bank-detail storage and masked provider/admin views, provider earnings summaries, payout/adjustment workflows, bank-detail reveal auditing, and formula-safe ledger CSV export. | P11.5-P11.6 |
| 2 Nov 2026 | 11 | P11.5-P11.6 (driver payments and provider earnings frontend) | `npm run check` (frontend; only the then-empty P11.7 pages failed) | Added driver card-payment return/verification, unpaid-payment entry points, provider payment polling and cash/EFT recording, ledger-backed earnings, and masked bank-detail editing. | P11.7-P11.8 |
| 2 Nov 2026 | 11 | P11.7-P11.8 (admin Payouts and Requests, manual tests, Blueprint) | `npm run check` (frontend and backend) | Added searchable/paginated payout and request admin workflows, audited temporary bank-number reveal, payout/adjustment/export controls, request assignment/cancellation/payment actions and active-request refresh; appended Phase 11 manual tests and reconciliation queries. | Romeo manual tests for Phases 9 to 11, then P12.1 |
| 3 Nov 2026 | 12 | W3 (P12.5 driver/provider ratings, notification inboxes and unread indicators) | `npm run check` (only expected empty `admin/pages/audit.js`) | Wired request ratings, paginated inboxes, read actions, notification routing and unread badges without backend changes. | W4 |
| 3 Nov 2026 | 12 | W1 (P12.1 ratings backend status) | `npm run check` (backend; blocked) | The rating controller, routes and service remain empty; not changed in this frontend/docs-only task. | W2 |
| 3 Nov 2026 | 12 | W2 (P12.2-P12.4 backend status) | `npm run check` (backend; blocked) | Notification controller and routes remain empty; audit, timeline and moderation backend files are present. | W3 |
| 3 Nov 2026 | 12 | W4 (P12.6-P12.7 admin frontend, manual tests and Blueprint) | `npm run check` (frontend passed; backend blocked) | Added the admin audit log, timeline and moderation UI, Phase 12 manual checklist, and Blueprint updates; backend check still finds five empty Phase 12 modules. | Romeo manual tests for Phase 12, then P13.1 |
| 3 Nov 2026 | 12 | Phase 12 W1 recovery | `npm run check` (backend) | Implemented ratings and notification inbox endpoints, completed post-commit best-effort events, and standardized payment/security notification kinds. | Romeo manual tests for Phase 12, then P13.1 |
| 3 Nov 2026 | 13 | W1 (P13.1-P13.2 security and limits) | Git history check (blocked) | Matching secret-pattern commits were found; no code changes made. Romeo must rotate potentially exposed secrets and consult Claude about history cleanup. | W2 |
| 3 Nov 2026 | 13 | W2 (P13.3 BulkSMS OTP driver) | `npm run check` (backend) | Added timed BulkSMS delivery, consumed OTPs on delivery failure, production console-OTP guard, and ZD-SMS-001. | W3 |
| 3 Nov 2026 | 13 | W3 (P13.4-P13.5 responsive and PWA polish) | `npm run check` (frontend) | Added mobile input/tap sizing, safe-area and dynamic viewport handling, install/offline/update UI, and hardened deployment headers. Driver/provider icons are all present; HTML has no inline scripts or event handlers. Admin remains intentionally non-installable. | W4 |
| 3 Nov 2026 | 13B | P13B.1 Brevo mailer and email OTP backend | `npm run check` (backend; expected empty later-phase files only) | Added Brevo delivery, database-backed email OTP limits and audits, email login, normalized profile phone capture, and admin user email search; updated the Blueprint. | Prompt W2 (P13B.2) |
| 3 Nov 2026 | 13B | P13B.2 Email login and phone-in-profile screens | `npm run check` (frontend; expected empty admin revenue page only) | Replaced phone sign-in with email OTP screens, added phone profile fields and contact details, maintained the legacy route alias, and added a static route check. | Prompt W3 (P13B.3) |
| 3 Nov 2026 | 13B | P13B.3 Responsive full-screen layout | `npm run check` (frontend; expected empty admin revenue page only) | Replaced the narrow desktop column with responsive full-screen layouts, a desktop side rail, narrow form widths, responsive tables and map sizing; updated layout checks and manual-test guidance. | Prompt W4 (P13B.4, P13B.5) |
| 3 Nov 2026 | 13B | P13B.4-P13B.5 Audit trail and revenue backend | `npm run check` (backend) | Added non-blocking API audit events, semantic audit coverage, filtered audit CSV export, shared CSV escaping, gateway fee persistence, revenue summaries/transactions/export and reconciliation checks; updated the privacy and financial-record policy. | Romeo applies migration 014, then Prompt W5 (P13B.6, P13B.7) |
| 3 Nov 2026 | 13B | P13B.6-P13B.7 Admin audit upgrades, revenue page, manual tests and blueprint wrap-up (W5) | `npm run check` (frontend and backend) | audit.js: Type filter, API result badge, Export CSV; users.js: Email column, search by name/email/phone, Activity shortcut; revenue.js: Summary KPIs/daily, Transactions with search/export, Reconcile; Phase 13B manual checklist in docs/manual-tests.md; Blueprint section 0/11.4/13B/14/decisions/open questions updated. | Romeo manual tests for Phases 12, 13 and 13B, then Phase 14 task P14.1 |
| 3 Nov 2026 | 13 | W4 (P13.6 error review, manual tests and Blueprint) | `npm run check` (backend and frontend) | Appended the Phase 13 manual checklist, documented hardening decisions and the P14.3 CSP follow-up, and completed the frontend static error-review rules. | Romeo manual tests for Phases 12 and 13, then Phase 14 task P14.1 |
| 3 Nov 2026 | 13 | Phase 13 H1 | `npm run check` (backend) | Production env validation (FRONTEND_ORIGINS, JWT_SECRET placeholders), TRUST_PROXY_HOPS, exact CORS, health response trimmed in prod, audit 0 vulnerabilities. | Phase 13 continued |
| 3 Nov 2026 | 13 | Phase 13 H2 | `npm run check` (backend) | Added ZD-SYS-004 and global/per-user/upload/create-request/admin write limiters; mount order updated. | Phase 13 continued |
| 3 Nov 2026 | 13 | Phase 13 H3 | `npm run check` (backend) | Zod bounds, CORS/static checks, empty-catch review. | Phase 13 continued |
### Decision log
| Date | Decision | Reason |
|---|---|---|
| 25 Oct 2026 | Two PWAs (driver, provider) on one backend, role decided by app | Matches "two app icons, each directs to its role"; removes role-switch UI |
| 25 Oct 2026 | Admin is an operator panel, not a third user role | Keeps exactly two user roles while allowing provider vetting and disputes |
| 25 Oct 2026 | Monorepo with root `BLUEPRINT.md` | One blueprint, one repo for Windsurf to read |
| 25 Oct 2026 | Polling instead of WebSockets | Simpler, works with sleeping free-tier hosting |
| 25 Oct 2026 | Phone OTP auth with console driver in dev | Uber/Bolt-style flow without SMS cost during build |
| 25 Oct 2026 | Ledger-first payments | Avoids dependence on payout APIs before the pilot proves demand |
| 25 Oct 2026 | Fuel service seeded inactive | Safety/legal review needed before carrying fuel |
| 28 Oct 2026 | Backend uses CommonJS | Specified in blueprint for backend; frontend may use ES modules |
| 28 Oct 2026 | DATABASE_URL optional until Phase 1 | Allows boot and health endpoint to work before database setup |
| 28 Oct 2026 | res.ok(data, status) helper added in requestId.js | Enforces the 8.1 success shape contract automatically |
| 28 Oct 2026 | DATABASE_URL now required in Phase 1 | Database pool needs it; boot fails fast if missing |
| 29 Oct 2026 | FKs to admin_users added in migration 008 via ALTER | admin_users is created last, so FKs added after table creation |
| 29 Oct 2026 | Seeds use ON CONFLICT DO NOTHING so admin edits survive re-seeding | Idempotent upsert pattern for config data |
| 29 Oct 2026 | Boot fails when migrations are pending | Prevents running with out-of-date schema |
| 29 Oct 2026 | Uploads use multer memory storage and magic-byte sniffing, not only the declared MIME type | Enforces file type safety as implemented in upload middleware |
| 29 Oct 2026 | Profile, photo, organisation, services and submit endpoints all return the full getMe payload | Matches required response pattern for profile-changing endpoints |
| 29 Oct 2026 | One current provider_documents row per doc_type; re-upload replaces the row and deletes the old Cloudinary asset | Implemented to satisfy "one current provider_documents row per doc_type" |
| 29 Oct 2026 | Submit check order: ZD-PROV-001 photo, ZD-USR-001 profile, ZD-PROV-004 company, ZD-PROV-003 services, ZD-PROV-002 documents | Matches required order exactly |
| 29 Oct 2026 | Providers cannot select inactive services (ZD-REQ-002) | Enforced in setServices |
| 29 Oct 2026 | Boot cloudinary check is WARN, not fatal (deviation from 10.3) | As implemented/needed in current setup |
| 1 Nov 2026 | Driver and provider apps keep separate token keys (zd_token_driver / zd_token_provider) because they share one origin | Prevents token conflicts between apps on same domain |
| 1 Nov 2026 | Frontend uses ES modules ("type": "module" in frontend/package.json) | Modern JS, clean imports/exports, no build step needed |
| 1 Nov 2026 | Service workers are network-first with the cache as offline fallback, and never intercept API or cross-origin requests | Ensures API calls always go to server, PWA shell works offline |
| 1 Nov 2026 | Vercel: Root Directory frontend, Output Directory public (vercel.json lives in frontend/, so it cannot be inside the output directory) | Matches Vercel requirements for static deployments |
| 1 Nov 2026 | Phone install is tested after the first HTTPS deployment (service workers and install need a secure context) | PWA install features require HTTPS |
| 1 Nov 2026 | Page modules export a default render(ctx) function; ctx.onLeave and ctx.signal handle cleanup of timers and requests on route change | Clean pattern for route lifecycle management |
| 1 Nov 2026 | Frontend-only error codes ZD-NET-001..004 and ZD-UI-001 are client-side and do not belong in the backend registry | Separates client and server error namespaces |
| 1 Nov 2026 | shared/authFlow.js holds the phone, OTP and role-mismatch logic and screens for both apps; Phase 6 reuses it (the blueprint file list gains this file) | Centralizes authentication UI logic shared by driver and provider apps |
| 1 Nov 2026 | Phase 5 creates minimal driver home.js, activity.js and account.js because P5.2 and P5.5 need them; Phase 9 extends them; Home uses a static service list until GET /services exists (P8.4) | Implements guest mode placeholders now, extends with real functionality later |
| 1 Nov 2026 | The pending phone number is kept in sessionStorage during the OTP step, never in the URL | Avoids exposing sensitive data in URLs or URL history |
| 1 Nov 2026 | '/request' is a placeholder route until Phase 9; route flag needsProfile sends signed-in drivers without a complete profile to /profile-setup | Provides a clear path for incomplete profiles to complete setup before using core features |
| 1 Nov 2026 | The driver profile page doubles as the edit page (edit mode when profileComplete is true) | Reuses the same component for create and edit flows with conditional UI |
| 1 Nov 2026 | The profile is saved before the photo upload, and a photo failure does not undo the profile | Prevents data loss if photo upload fails; profile is always saved |
| 2 Nov 2026 | Admin login uses bcrypt.compare against a DUMMY_HASH for unknown emails to prevent timing attacks | Security best practice: timing-safe password comparison prevents email enumeration |
| 2 Nov 2026 | Provider review auto-rejects the provider when a required document is rejected while the provider is pending | Improves UX: providers immediately see rejection reason instead of staying in pending limbo |
| 2 Nov 2026 | Pricing, geo, money and the status table are pure modules (`lib/money.js`, `geo.js`, `pricing.js`, `requests/stateMachine.js`) written and unit-tested outside Kilo; services only call them | Keeps core calculations deterministic and independently testable |
| 2 Nov 2026 | A request is created even when no provider is available (`offersSent` 0), so an admin can assign it manually (pilot mode); it expires after `request_expiry_seconds` | Allows requests to remain dispatchable in a sparse pilot area |
| 2 Nov 2026 | POST `/requests` accepts `expectedTotalCents`; a changed price returns ZD-REQ-008 so the driver always confirms the price they pay | Prevents a changed quote from silently changing the driver's price |
| 2 Nov 2026 | One active job per provider is enforced by an application check and partial unique index (migration 009); conflicts return ZD-REQ-009 | Prevents simultaneous accepts from assigning multiple active jobs |
| 2 Nov 2026 | Contact details are revealed only after acceptance; offers show area, distance and earning; GET `/requests/:id` is limited to the driver and assigned provider | Protects personal contact information before a match |
| 2 Nov 2026 | Candidates exclude busy providers and use two radius checks: offer radius from the provider's live position, provider service radius from their base | Combines availability location with the provider's service coverage |
| 2 Nov 2026 | Completing a job inserts the payments row and increments `jobs_completed`; ledger entries come in Phase 11 | Records completion now while reserving accounting entries for the ledger phase |
| 2 Nov 2026 | The expiry job is started in `server.js` (not `app.js`), overlap-guarded and unref'd | Keeps background work out of app imports and avoids overlapping expiry runs |
| 2 Nov 2026 | New files: `modules/providers/jobs.controller.js`, migration 009; admin request endpoints (list, detail with candidates, assign, cancel) are in place; the admin Requests page is built later | Delivers backend dispatch tooling while deferring the admin UI |
| 2 Nov 2026 | New codes ZD-REQ-008 and ZD-REQ-009 | Makes stale-quote and provider-capacity failures explicit |
| 2 Nov 2026 | Admin tokens use a separate signing key derived from JWT_SECRET (HMAC) and expire after 12 hours, so user tokens can never act as admin tokens | Separates admin credentials from user sessions |
| 2 Nov 2026 | Extra endpoints GET /admin/overview and GET /admin/auth/me and file adminOverview.controller.js were added; the admin session is separate from shared/auth.js refreshMe | Keeps admin identity and session refresh isolated |
| 2 Nov 2026 | Approving a provider requires every required document to be approved (ZD-ADM-004); approving or rejecting a provider that is not pending returns ZD-ADM-002 | Enforces the provider review state machine |
| 2 Nov 2026 | Rejecting a document on a pending provider automatically rejects the provider with the document label and note as the reason | Gives the provider actionable rejection feedback |
| 2 Nov 2026 | New codes ZD-ADM-002, ZD-ADM-003 and ZD-ADM-004 added to the registry and section 10.1 | Keeps admin API failures consistently coded |
| 2 Nov 2026 | Provider registration fees and Driver Plus use verified, idempotent platform-charge settlement; Plus offers use the protected extra-offers setting | Applies benefits only after server-side payment verification |
| 2 Nov 2026 | Platform commission default raised from 12% to 15%; commission, registration fee and Plus settings are protected and change only through password + emailed code + once-per-30-days flow | Protects high-impact pricing changes and prevents frequent edits |
| 2 Nov 2026 | Hard limits on protected pricing values live in code (`pricingPolicy.js`) | A compromised admin account cannot set extreme values |
| 2 Nov 2026 | Providers pay a one-time registration fee (default R150, OFF in the pilot) after approval; there is no provider subscription; providers approved before enablement are founding providers and never pay | Keeps provider costs limited to a one-time onboarding charge |
| 2 Nov 2026 | Drivers pay no platform fee; the Paystack gateway fee is carried by the platform | Keeps driver request prices separate from payment processing fees |
| 2 Nov 2026 | ZoomDrive Plus is optional and OFF by default: 90-day free trial, then a 30-day pass at R29 bought with Paystack (no auto-renew); its only built benefit is priority dispatch; a price discount remains deferred until pilot data exists | Validates priority dispatch before adding other benefits |
| 2 Nov 2026 | Paystack is initialized server-side and users are redirected to Paystack and back; provider verification and the signed webhook settle charges idempotently through `settleByReference` | Prevents client-side payment claims and duplicate settlement |
| 2 Nov 2026 | Pricing confirmation codes are HMAC-hashed, expire in 10 minutes, allow 5 attempts, and are emailed to the acting admin; `EMAIL_DRIVER=console` is refused in production | Limits replay and brute-force risk while keeping development convenient |
| 2 Nov 2026 | Provider heartbeat is a module-level singleton in `provider/heartbeat.js`; it survives navigation and stops after 5 minutes hidden, when offline, and on logout | Keeps availability state independent from page lifetime |
| 2 Nov 2026 | Provider earnings are computed client-side from the last 50 jobs until the ledger exists in Phase 11; Inbox stays empty until Phase 12 | Clearly labels interim screens without implying unavailable accounting or messaging |
| 2 Nov 2026 | Provider earnings are credited to the ledger only when payment is confirmed (card paid, provider-recorded or admin-recorded), never at completion | Prevents unpaid jobs from appearing as earned balance |
| 2 Nov 2026 | A provider's balance is the sum of their ledger; a payout writes a negative ledger line (supersedes 'ledger minus payouts') | Keeps all balance changes in one auditable source |
| 2 Nov 2026 | Cash or EFT recorded by the provider writes a negative commission line; it nets against card earnings automatically | The provider already holds offline payment and owes only the platform commission |
| 2 Nov 2026 | A request settles exactly once through unique ledger/payment references, payment-row locks and ZD-PAY-008 on repeats | Prevents webhook, verify and offline paths from double-settling a request |
| 2 Nov 2026 | Drivers pay after the job; when Paystack is configured, an unpaid completed job blocks another request with ZD-PAY-006 | Ensures unpaid card balances are settled before another request |
| 2 Nov 2026 | Pilot payouts are manual EFT recorded by an admin; Paystack transfers and automatic payouts are deferred, and refunds are manual | Avoids transfer fees and automating unresolved pilot operations |
| 2 Nov 2026 | Provider bank details use AES-256-GCM and remain masked except for audited admin reveal; a seven-day recent-change warning appears at payout time | Protects payout data and supports phone confirmation before payment |
| 2 Nov 2026 | The ledger CSV is returned in the JSON contract and downloaded client-side with formula-injection escaping | Preserves the existing API contract while preventing spreadsheet formulas |
| 2 Nov 2026 | The admin Requests page (list, detail, candidates, assign, cancel, mark paid) is the manual-dispatch tool for the pilot | Supports dispatch and payment support without automation |
| 2 Nov 2026 | Document previews use 5-minute signed Cloudinary download URLs; file URLs and public ids are never returned or logged | Limits access to private provider documents |
| 2 Nov 2026 | notifications.service.js created in Phase 7 (createNotification); Phase 12 extends it with the inbox endpoints | Reuses the notification foundation for the future inbox |
| 2 Nov 2026 | Admin accounts are created only with scripts/create-admin.js (interactive, hidden password, --reset to change a password); there is no public admin signup | Prevents public registration of privileged accounts |
| 2 Nov 2026 | The driver pages poll GET /requests/:id every 5 s with chained timeouts, pause while the tab is hidden and stop on terminal states or route change | Avoids overlapping polls and unnecessary hidden-tab network traffic |
| 2 Nov 2026 | The Request screen uses POST /requests/quote for every price shown (no hardcoded numbers) and sends expectedTotalCents so a changed price returns ZD-REQ-008 | Keeps displayed and confirmed prices aligned |
| 2 Nov 2026 | The Rate page is built now but does not call an API until Phase 12 (P12.1) | The ratings API is not implemented yet |
| 2 Nov 2026 | Home shows only services returned by GET /services (fuel stays hidden while inactive) plus a placeholder Schedule tile | Keeps the catalog and active-service policy authoritative |
| 2 Nov 2026 | Payment methods, Promotions, Fleet Profile and Verify identity are visibly marked placeholders | Avoids implying unsupported functionality exists |
| 2 Nov 2026 | Leaflet and OpenStreetMap tiles are loaded from CDN on demand by shared/map.js; a failed map load shows a fallback card instead of crashing the page | Keeps location entry usable when map assets are unavailable |
| 2 Nov 2026 | Provider online heartbeat is a module-level singleton; page polling is route-scoped, while logout and five minutes in the background stop the server presence | Keeps online presence consistent across provider sub-pages and bounds stale availability |
| 3 Nov 2026 | Pricing changes use an emailed, one-use admin challenge and transactional cooldown/locking; generic settings writes cannot change protected pricing | Adds an auditable second confirmation for high-impact price changes |
| 3 Nov 2026 | Email delivery uses a development-only console driver or configured SMTP; production boot rejects console email mode | Prevents production verification codes from being written to application logs |
| 3 Nov 2026 | Migration 010 is read-only and moves the commission default from 12% to 15% only when it remains unchanged | Preserves prior operator edits while adopting the new default |
| 3 Nov 2026 | Ratings never depend on payment; they are editable for 24 hours then locked | Feedback remains tied to completed work rather than payment timing |
| 3 Nov 2026 | Rating comments are visible to admins only; other users see averages | Keeps private feedback out of user-facing screens |
| 3 Nov 2026 | A driver's average rating is calculated on demand from ratings; only providers have a stored average | Avoids duplicating driver aggregates |
| 3 Nov 2026 | Notifications are best-effort and sent after commit, so a failure never blocks a request or payment; the inbox is in-app only until SMS arrives in Phase 13 | Keeps operational workflows independent of notification delivery |
| 3 Nov 2026 | The auth middleware checks account status on every request, so suspension takes effect immediately despite 30-day tokens | Makes account moderation effective without waiting for token expiry |
| 3 Nov 2026 | Suspension and deletion are refused while the user has an active request; deletion also needs a zero provider balance | Prevents moderation from stranding active work or balances |
| 3 Nov 2026 | Account deletion anonymises the user and keeps requests, payments, ledger and payouts; documents, bank details, saved places and notifications are deleted | Preserves financial records while removing personal account data |
| 3 Nov 2026 | The request timeline merges audit, offers, ratings and ledger rows for dispute handling | Gives admins a chronological dispute record |
| 3 Nov 2026 | The audit log page filters by the HTTP request id so an error ref from a banner finds its audit rows | Connects user-visible error references to audit events |

| 3 Nov 2026 | Production boot refuses unsafe CORS origins, placeholder secrets, console OTP and console email; console OTP needs an explicit override flag for private testing | Keeps insecure development defaults from silently reaching production |
| 3 Nov 2026 | Writes are rate-limited per IP (loose, for shared mobile networks) and per user; polling and the webhook are exempt; counters are in memory for now | Limits abuse without interrupting routine polling or signed payment webhooks |
| 3 Nov 2026 | trust proxy is set so rate limits and logs use the real client IP behind Render | Preserves correct request attribution behind the deployment proxy |
| 3 Nov 2026 | Every zod string has a maximum length and every list endpoint clamps page size | Bounds request sizes and pagination work |
| 3 Nov 2026 | The SMS driver is an adapter around BulkSMS REST v1 and can be swapped by editing one file; the provider choice is deferred until after Phase 14 | Keeps SMS integration replaceable until the provider decision |
| 3 Nov 2026 | The frontend CSP is set in vercel.json and the custom API domain is added in P14.3 | Restricts browser resource origins while preserving the planned API domain change |
| 3 Nov 2026 | The service worker only skips waiting when the user taps Reload on the update toast | Gives users control over applying an app update |
| 3 Nov 2026 | Empty catch blocks are banned by static checks; intentional ignores need a comment | Makes swallowed failures explicit during review |
| 3 Nov 2026 | The admin audit log Kind filter maps 'events' to change events, 'api' to API request traces and 'denied' to denied or failed requests; 'all' returns everything | Lets operators scan by audit purpose without knowing internal action names |
| 3 Nov 2026 | API audit rows include a coloured result badge (ok green, denied/rejected amber, error red) so operators quickly spot failures without opening the detail panel | Reduces time-to-diagnose for security or reliability incidents |
| 3 Nov 2026 | Audit CSV export accepts the same filters as the list endpoint; the BOM (\uFEFF) prefix makes Excel open the file correctly without an import wizard | Consistent export pattern across all admin CSV downloads |
| 3 Nov 2026 | The admin Users page masks displayed email to first-char + *** + @domain and searches by full email server-side; raw email is never rendered in the DOM | Balances findability with PII minimisation in the operator view |
| 3 Nov 2026 | The Revenue page keeps date-range and tab state in the URL hash query so the operator can bookmark or share a specific view | Consistent with the Audit and Payouts pages; no server session needed |
| 3 Nov 2026 | Revenue KPI cards show integer cents formatted via formatZAR; daily bars scale to the maximum absolute net for the period; zero-activity days appear as a flat 2 px bar | Avoids division-by-zero and gives visual context for quiet days |
| 3 Nov 2026 | The Reconcile endpoint is on-demand (no scheduled run); UNPAID_OLD issues are amber informational, other codes are red blocking; checkedAt is always shown | Lets operators decide when to run and clearly separates expected aging from real inconsistencies |
| 3 Nov 2026 | Revenue transactions redact emails and phone numbers via safeText (same pattern as audit sanitizeMeta) to avoid exposing PII in the operator table | Consistent PII handling across all admin data tables |
| 3 Nov 2026 | Money in admin pages is always integer cents; formatZAR formats for display; no floating-point arithmetic in the frontend | Matches the backend money rule and prevents rounding drift |

### Known issues
P14.3 adds the custom API domain to connect-src.
Rate limit counters are in memory (reset on restart; single instance only). Move to a shared store before running more than one backend instance.

---

## 15. OPEN QUESTIONS (resolve and move to the decision log)

1. RESOLVED: login codes are emailed through Brevo; phone verification (SMS or WhatsApp) is deferred until there is budget.
2. **Fuel top-up**: legal and insurance position before activating the service.
3. **Pilot city** and radius defaults.
4. **Payments**: confirm Paystack split-payment support and whether the pilot starts with cash/EFT plus ledger.
5. **Commission** percentage after pilot interviews (default 15%).
6. **Final app names** ("ZoomDrive" and "ZoomDrive Partner") and domain availability (CIPC, domain, social handles).
7. **Partnership agreement** (equity, roles, vesting) reviewed by a lawyer.
8. **Company staff accounts** and fleet profiles (planned after the pilot, not in this build).
9. **WhatsApp request channel** for the pilot (optional addition after Phase 10).
10. **Privacy policy and terms** text (POPIA) before public launch; must mention the collection and use of email addresses, IP addresses (stored in audit_log), audit logging and retention periods.
11. Sender domain and email authentication (SPF, DKIM, DMARC) before the pilot so codes do not land in spam.
12. Retention period for financial and audit records (confirm with an accountant; commonly five years or more).
13. **Provider terms and a dispute policy** (needed before the pilot).
node_modules/
.env
.env.*
!.env.example
*.log
.DS_Store| 3 Nov 2026 | 13B | Landing layout fix | npm run check | Centred landing wrapper; buttons side-by-side at 600px; logo scales; audited driver/provider/admin shells | Romeo manual tests |
