# ZOOMDRIVE: MASTER BLUEPRINT

> Single source of truth for Windsurf, Claude and Romeo. Lives at the repo root as `BLUEPRINT.md`.
> Last revised: 25 Oct 2026. Blueprint version: 1.0

---

## 0. RESUME HERE (update this block at the end of every session)

```
CURRENT PHASE ........ 5  (Driver sign-up and profile)
LAST COMPLETED PHASE . 4
LAST TASK DONE ....... P5.5
NEXT ACTION .......... Romeo manual tests for Phase 3, 4 and 5, then Phase 6 task P6.1
BLOCKERS ............. none
OPEN QUESTIONS ....... see section 15
LAST UPDATED ......... 1 Nov 2026 by Devin
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
- Signup and profile creation flow like Uber/Bolt: phone number, 4-digit code (OTP), then profile details.
- Fair price for both sides: admin-controlled price bands, fixed price shown before confirming, never changes afterwards. Platform commission default 12% taken from the provider side.
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
}
```
Rules: white background, black primary buttons, amber for highlights and brand, blue only for "Go Online" and links, green for success/verified, red for destructive. Cards: 1px `--line` border, soft shadow, radius 16 to 22. Bottom navigation with minimum 44px tap targets. Respect safe areas (`env(safe-area-inset-*)`). Layout is mobile-first (works at 360px wide); on desktop the app column is centred (max-width 480px) with no device frame. Use `textContent` for user-supplied text, never `innerHTML`.

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
- **Auth:** phone number + 4-digit OTP, then a JWT (30 days). OTP delivery goes through an adapter: `console` (dev, logs the code) and `bulksms` (production, added in Phase 13/14).
- **Dispatch:** automatic nearest-provider offers with a manual admin-assign fallback.
- **Payments:** Phase 11. Ledger-first design (platform records what each provider earned and is owed; admin pays out), then Paystack card payments.
- **Admin:** separate operator panel at `/admin/` with its own `admin_users` table, email + password login, no public signup.

```
Driver PWA (/driver/) ─┐
Provider PWA (/provider/) ─┼─► Express API (Render) ─► Neon Postgres
Admin panel (/admin/) ─┘          └─► Cloudinary (photos/docs)
                                   └─► SMS provider (OTP, later)
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
│  │  │  └─ 008_admin_audit.sql               (phase 1)
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
│        ├─ auth/          auth.routes.js, auth.controller.js, auth.service.js, otp.service.js, otp.drivers/console.js, otp.drivers/bulksms.js   (phase 2)
│        ├─ users/         users.routes.js, users.controller.js           (phase 3)
│        ├─ drivers/       drivers.routes.js, drivers.controller.js, savedPlaces.controller.js   (phase 3)
│        ├─ providers/     providers.routes.js, providers.controller.js, documents.controller.js, organisations.controller.js   (phase 3)
│        ├─ uploads/       cloudinary.service.js                          (phase 3)
│        ├─ services/      services.routes.js, services.controller.js     (phase 7)
│        ├─ requests/      requests.routes.js, requests.controller.js, requests.service.js, stateMachine.js   (phase 8)
│        ├─ dispatch/      dispatch.service.js, expiry.job.js             (phase 8)
│        ├─ payments/      payments.routes.js, payments.controller.js, ledger.service.js, paystack.service.js   (phase 11)
│        ├─ ratings/       ratings.routes.js, ratings.controller.js       (phase 12)
│        ├─ notifications/ notifications.routes.js, notifications.service.js   (phase 12)
│        └─ admin/         admin.routes.js, adminAuth.controller.js, providersReview.controller.js, adminUsers.controller.js, adminRequests.controller.js, adminServices.controller.js, adminSettings.controller.js, adminPayouts.controller.js, adminAudit.controller.js   (phase 7, extended 11-12)
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
│     │  ├─ components/ topbar.js, bottom-nav.js, field.js, photo-upload.js, doc-upload.js, status-badge.js   (phase 4-6)
│     │  └─ styles/ tokens.css, base.css, components.css                     (phase 4)
│     ├─ driver/
│     │  ├─ index.html, app.js, manifest.webmanifest, sw.js                  (phase 4)
│     │  ├─ icons/ icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png   (phase 4)
│     │  └─ pages/ welcome.js, phone.js, otp.js, profileSetup.js            (phase 5)
│     │          home.js, request.js, searching.js, track.js, rate.js, activity.js, account.js, savedPlaces.js, paymentMethods.js, safety.js, support.js, settings.js   (phase 9)
│     ├─ provider/
│     │  ├─ index.html, app.js, manifest.webmanifest, sw.js                  (phase 4)
│     │  ├─ icons/ (same four PNGs, partner artwork)                         (phase 4)
│     │  └─ pages/ welcome.js, phone.js, otp.js, providerType.js, profileSetup.js, documents.js, pending.js   (phase 6)
│     │          home.js, job.js, earnings.js, inbox.js, menu.js, services.js, vehicle.js, payouts.js   (phase 10)
│     └─ admin/
│        ├─ index.html, app.js, login.js                                      (phase 7)
│        └─ pages/ overview.js, providers.js, providerDetail.js, users.js, requests.js, services.js, settings.js   (phase 7)
│                  payouts.js, audit.js                                       (phase 11-12)
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
| `OTP_DRIVER` | yes | `console` (dev) or `bulksms` (prod) |
| `OTP_DEV_ECHO` | no | `true` returns the code in the API response (development only; boot refuses `true` in production) |
| `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER_ID` | when `OTP_DRIVER=bulksms` | SMS provider |
| `SIGNUP_ENABLED` | no | `true`/`false` kill-switch for new signups |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | from phase 11 | card payments |
| `APP_VERSION` | no | shown in `/health` and error details |

Frontend has no secrets. `shared/config.js` holds `API_BASE` (production URL, with a development branch for localhost).

---

## 7. DATABASE SCHEMA

Conventions: `bigint generated always as identity` primary keys; `timestamptz` for all times (stored UTC, displayed in SAST); money as integer cents; `text` plus `CHECK` constraints for enums; indexes on every foreign key and every column used in a `WHERE`. Each migration is idempotent-safe, non-empty, and recorded in `schema_migrations` only after it succeeds.

**users** `id, role CHECK(driver|provider), phone UNIQUE NOT NULL (E.164), email, first_name, last_name, photo_url, status CHECK(active|suspended) default active, created_at, updated_at, last_login_at`

**otp_codes** `id, phone, code_hash, purpose CHECK(login|signup), expires_at, attempts int default 0, consumed_at, created_at`

**driver_profiles** `user_id PK→users, vehicle_make, vehicle_model, vehicle_colour, plate, hail_platform (uber|bolt|indrive|other|null), consent_at, created_at`

**organisations** `id, name, reg_number, status CHECK(pending|approved|rejected|suspended), owner_user_id→users, created_at`

**provider_profiles** `user_id PK→users, provider_type CHECK(individual|company), organisation_id→organisations null, vehicle_description, plate, base_lat, base_lng, service_radius_km default 25, verification_status CHECK(pending|approved|rejected) default pending, rejection_reason, is_online bool default false, last_lat, last_lng, last_seen_at, rating_avg numeric(3,2) default 0, rating_count int default 0, jobs_completed int default 0, submitted_at, approved_at, approved_by→admin_users, consent_at, created_at`

**provider_documents** `id, provider_user_id→users, doc_type CHECK(id_document|drivers_licence|vehicle_insurance|company_registration), file_url, cloudinary_public_id, status CHECK(pending|approved|rejected) default pending, note, uploaded_at, reviewed_at, reviewed_by`

**services** `id, code UNIQUE (flat_tyre|jump_start|fuel|essentials|towing), name, icon, base_price_cents, per_km_cents, min_distance_fee_cents, active bool, sort_order`

**provider_services** `provider_user_id→users, service_id→services, PRIMARY KEY(both)`

**saved_places** `id, user_id→users, label, address, lat, lng, created_at`

**requests** `id, driver_id→users, service_id→services, status CHECK(searching|accepted|arrived|completed|cancelled|expired) default searching, lat, lng, address_text, notes, distance_km numeric(6,2), service_price_cents, distance_fee_cents, total_cents, commission_pct numeric(5,2), commission_cents, provider_earning_cents, provider_id→users null, assigned_by_admin bool default false, created_at, expires_at, accepted_at, arrived_at, completed_at, cancelled_at, cancelled_by CHECK(driver|provider|admin|system), cancel_reason`

**request_offers** `id, request_id→requests, provider_id→users, status CHECK(offered|accepted|declined|expired) default offered, offered_at, responded_at, UNIQUE(request_id, provider_id)`

**payments** `id, request_id→requests UNIQUE, method CHECK(card|cash|eft|unpaid) default unpaid, status CHECK(pending|paid|failed|refunded) default pending, amount_cents, paystack_ref, paid_at, created_at`

**provider_ledger** `id, provider_user_id→users, request_id→requests null, entry_type CHECK(earning|commission|payout|adjustment), amount_cents (signed), note, created_at`

**payouts** `id, provider_user_id→users, amount_cents, reference, method, paid_at, paid_by→admin_users, note`

**ratings** `id, request_id→requests, rater_id→users, ratee_id→users, rater_role CHECK(driver|provider), stars int CHECK 1..5, comment, created_at, UNIQUE(request_id, rater_id)`

**notifications** `id, user_id→users, title, body, kind, data jsonb, read_at, created_at`

**admin_users** `id, email UNIQUE, password_hash, name, created_at, last_login_at`

**app_settings** `key PK, value, updated_at, updated_by` seeded with: `commission_pct=12`, `road_factor=1.3`, `avg_speed_kmh=40`, `offer_radius_km=25`, `max_offers_per_request=5`, `request_expiry_seconds=180`, `provider_stale_seconds=120`, `cancel_fee_cents=0`

**audit_log** `id, actor_type CHECK(user|admin|system), actor_id, action, entity, entity_id, meta jsonb, request_id, ip, created_at`

**schema_migrations** `filename PK, checksum, applied_at`

**Seed services** (placeholder prices, admin-editable, validate in the pilot): flat_tyre base R180, jump_start R150, essentials R60, towing R450, **fuel R120 seeded with `active=false`** until the legal/safety review on carrying fuel is done. `per_km_cents` default 700 (R7/km), `min_distance_fee_cents` 2000 (R20).

---

## 8. API SPECIFICATION

Base URL: `${API_BASE}/api/v1`. JSON in/out. JWT in `Authorization: Bearer <token>`.

### 8.1 Response contract (fixed, never change without a blueprint update)
Success: `{ "ok": true, "data": { ... }, "requestId": "<id>" }`
Failure: `{ "ok": false, "error": { "code": "ZD-AUTH-001", "message": "Human readable message", "field": "phone" | null, "details": null }, "requestId": "<id>" }`
HTTP status codes: 200/201 success, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate limit, 500 unexpected.
Frontend `apiFetch(path, {method, body, auth})` returns `data` or throws `ApiError {code, message, field, status, requestId}`.

### 8.2 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | status, version, db up/down, missing env names |
| POST | `/auth/otp/request` | none | `{phone, app}` sends code (rate limited) |
| POST | `/auth/otp/verify` | none | `{phone, code, app}` returns `{token, user, isNewUser, profileComplete}` |
| GET | `/auth/me` | any | current user + profile + completeness flags |
| POST | `/auth/logout` | any | audit only (JWT is stateless) |
| PUT | `/drivers/me` | driver | create/update driver profile (name, vehicle, consent) |
| POST | `/users/me/photo` | any | upload profile photo (multipart, field `photo`) |
| GET/POST/DELETE | `/drivers/me/saved-places` | driver | saved places |
| PUT | `/providers/me` | provider | profile (name, type, vehicle, base location, radius) |
| PUT | `/providers/me/organisation` | provider | company name + reg number (company type only) |
| PUT | `/providers/me/services` | provider | `{serviceIds:[]}` |
| POST | `/providers/me/documents` | provider | upload one document (`doc_type`, file) |
| GET | `/providers/me/documents` | provider | list own documents + status |
| POST | `/providers/me/submit` | provider | submit for review; fails if photo/docs/services missing |
| POST | `/providers/me/online` | provider (approved) | `{online:boolean, lat, lng}` |
| POST | `/providers/me/heartbeat` | provider (approved) | `{lat, lng}` |
| GET | `/providers/me/offers` | provider (approved) | open offers |
| GET | `/providers/me/jobs` | provider | active + past jobs |
| GET | `/providers/me/earnings` | provider | totals, ledger entries |
| GET | `/services` | none | active services with prices |
| POST | `/requests/quote` | driver | `{serviceId, lat, lng}` returns price breakdown |
| POST | `/requests` | driver (profile complete) | create request and dispatch offers |
| GET | `/requests/:id` | driver/provider involved | status, provider info, ETA, provider location |
| POST | `/requests/:id/cancel` | driver/provider involved | `{reason}` |
| POST | `/requests/:id/accept` | provider | accept an offer (atomic, 409 if taken) |
| POST | `/requests/:id/decline` | provider | decline an offer |
| POST | `/requests/:id/arrived` | provider | mark arrived |
| POST | `/requests/:id/complete` | provider | mark completed |
| GET | `/requests` | driver | own history |
| POST | `/requests/:id/rate` | driver/provider | `{stars, comment}` |
| POST | `/payments/:requestId/pay` | driver | start card payment (phase 11) |
| POST | `/payments/paystack/webhook` | Paystack signature | confirm payment |
| GET | `/notifications` | any | inbox |
| POST | `/notifications/:id/read` | any | mark read |
| POST | `/admin/auth/login` | none | `{email, password}` |
| GET | `/admin/providers?status=pending` | admin | review queue |
| GET | `/admin/providers/:userId` | admin | profile + documents (signed URLs) |
| POST | `/admin/providers/:userId/approve` | admin | approve |
| POST | `/admin/providers/:userId/reject` | admin | `{reason}` |
| POST | `/admin/documents/:id/review` | admin | `{status, note}` |
| GET | `/admin/users`, `/admin/requests` | admin | lists with filters |
| POST | `/admin/requests/:id/assign` | admin | manual dispatch `{providerId}` |
| PUT | `/admin/services/:id` | admin | price/active edits |
| GET/PUT | `/admin/settings` | admin | commission, radius, expiry etc. |
| GET/POST | `/admin/payouts` | admin | provider balances, record payout |
| GET | `/admin/audit` | admin | audit log with filters |

---

## 9. BUSINESS RULES

### 9.1 Auth and roles
- `app` (`driver`|`provider`) is sent with every OTP request and verify. The backend creates a new user with that role on first verify. If the phone belongs to the other role, return `ZD-AUTH-004 ROLE_MISMATCH` (403) with message "This number is registered as a <role>. Open the ZoomDrive<' Partner'> app instead."
- OTP: 4 digits, hashed, expires in 5 minutes, 5 attempts max, rate limit 3 requests per phone per 10 minutes and 10 per IP per hour.
- `profileComplete`: driver = first and last name set and consent recorded; provider = status `submitted` only after photo + documents + services + consent.
- `SIGNUP_ENABLED=false` blocks new accounts with `ZD-AUTH-009`.
- Phone normalisation: `082 123 4567`, `0821234567`, `+27 82 123 4567` all become `+27821234567`.

### 9.2 Provider verification
- Compulsory before submit: profile photo, first/last name, at least one service, documents `id_document`, `drivers_licence`, `vehicle_insurance`, plus `company_registration` and company name/registration number for `company` type, consent.
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

### 9.5 Completion, payment, ledger
- On `completed`: create `payments` row (`unpaid` or `paid` depending on method), write ledger `earning` (+provider_earning) and `commission` (informational, 0 net) entries, increment `jobs_completed`.
- Phase 11 modes: (a) **ledger-manual** (default): driver pays by card via Paystack to the platform, provider balance accrues, admin records payouts; (b) **cash/eft** recorded by provider with commission owed back (shows as negative adjustment). Keep the choice behind a setting so the pilot can start before card payments are live.
- Provider balance = sum of ledger amounts minus payouts.

### 9.6 Ratings
Driver rates provider after completion (1 to 5 + comment). Provider rates driver optionally. Provider `rating_avg` updates transactionally. Ratings cannot be edited after 24 hours.

### 9.7 Guest browsing (driver app)
Guests can open Home, service tiles, prices, Activity (empty), Account (sign-in prompt) and Safety/Support pages. Any action that creates data (request, saved place, payment method) redirects to `#/phone?next=<route>` with a banner "Create a profile to request help". After signup the user returns to `next`.

### 9.8 Privacy (POPIA)
Consent checkbox at profile creation (privacy policy + terms, timestamped). Collect only what is needed. Provide account deletion on request (admin tool in phase 12). Store ID documents privately. This is not legal advice; get the policy reviewed before launch.

---

## 10. ERROR SYSTEM (so problems are found fast)

### 10.1 Error codes
Format `ZD-<AREA>-<NNN>`. Registry in `backend/src/lib/errors.js` (code, httpStatus, default message). Every thrown `ApiError` uses a registered code. Never throw a bare `Error` for expected failures.

| Code | HTTP | Meaning |
|---|---|---|
| ZD-SYS-001 | 500 | Unexpected server error |
| ZD-SYS-002 | 503 | Database unavailable |
| ZD-SYS-003 | 404 | Route not found |
| ZD-VAL-001 | 400 | Validation failed (field named in `error.field`) |
| ZD-AUTH-001 | 401 | Missing or invalid token |
| ZD-AUTH-002 | 400 | OTP invalid or expired |
| ZD-AUTH-003 | 429 | Too many OTP attempts/requests |
| ZD-AUTH-004 | 403 | Role mismatch (wrong app for this account) |
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
| ZD-REQ-001 | 404 | Request not found |
| ZD-REQ-002 | 400 | Service inactive or unknown |
| ZD-REQ-003 | 409 | Driver already has an active request |
| ZD-REQ-004 | 400 | Location invalid or outside service area |
| ZD-REQ-005 | 409 | Invalid status transition |
| ZD-REQ-006 | 409 | Offer already taken |
| ZD-REQ-007 | 403 | Not a party to this request |
| ZD-PAY-001 | 502 | Paystack error |
| ZD-PAY-002 | 400 | Webhook signature invalid |
| ZD-ADM-001 | 401 | Admin login failed |

Add new codes to this table in the same commit that uses them.

### 10.2 Backend logging
One line per event: `[2026-10-25T10:15:00.123Z] [LEVEL] [reqId] [module] CODE message {json meta}`. Levels: `INFO`, `WARN`, `ERROR`. Every request logs method, path, status, ms. Errors log the code and stack (stack only in development responses; production responses never include stacks). Secrets, tokens, OTP codes (except `OTP_DRIVER=console`), phone numbers beyond the last 4 digits and document URLs are never logged.

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

---

## 11. FRONTEND SPECIFICATION (screens)

All routes are hash routes inside each app. Layout: top bar (logo or title), scroll area, bottom nav (where listed), safe-area aware.

### 11.1 Landing `/` (`index.html`)
Logo, one line pitch, two large buttons: "I need help" (opens `/driver/`) and "I provide help" (opens `/provider/`), plus install tips for each app and a note about adding to Home Screen.

### 11.2 Driver app (`/driver/`) bottom nav: Home, Activity, Account
- `#/welcome` (shown when no token): logo, headline, **Sign up**, **Log in**, **Just looking?** (guest browse).
- `#/phone`: mobile number field (+27 prefix), Continue, terms line. Shows the "Create a profile to request help" banner when `next` is present.
- `#/otp`: 4 boxes, auto-advance, resend after 30s. In dev, shows the echoed code.
- `#/profile-setup`: optional profile photo, first name, surname, optional email, optional vehicle (make, model, colour, plate, e-hailing platform), consent checkbox, Create profile.
- `#/home`: headline "Stuck? We'll come to you.", service tiles (from `/services`), "Where are you?" bar with Use GPS, current/saved/recent places list, Fleet-profile teaser (static, non-functional placeholder).
- `#/request`: step bar, map with pin (drag to adjust), service picker, price card (service + distance fee + fixed total), payment method row, promo row (placeholder), **Request help**.
- `#/searching/:id`: animated "Finding help nearby", countdown to expiry, Cancel.
- `#/track/:id`: map with driver pin and provider pin, ETA, provider card (photo, name, rating, jobs, verified badge, company name if any, vehicle and plate), Call (`tel:` link), Share trip (Web Share API), Safety, Cancel.
- `#/rate/:id`: stars + comment after completion.
- `#/activity`: upcoming (empty state), past requests with status and total; tap for detail.
- `#/account`: name + photo, optional "Verify identity" banner (placeholder), Profile, Payment, Support, Safety, Saved places, Settings, Promotions (placeholder), Log out. No role-switch item.

### 11.3 Provider app (`/provider/`) bottom nav: Home, Earnings, Inbox, Menu
- `#/welcome`, `#/phone`, `#/otp`: as driver, provider branding.
- `#/type`: **Individual** or **Company or organisation**.
- `#/profile-setup`: **profile photo (required, red error if missing)**, first name, surname, company name and registration number (company only), vehicle description and plate, base location (map pick or GPS), service radius, services chips, consent.
- `#/documents`: upload rows: ID document, driver's licence, vehicle and insurance, company registration certificate (company only). Each shows Upload, Uploaded ✓ or Rejected with the admin's note. **Submit for review** is disabled until everything required is present.
- `#/pending`: "Profile under review" (shows rejected state with reason and a fix button).
- `#/home`: status ("You're offline/online"), map card, Opportunities card (static for now), big **Go Online** button (requests location permission, starts heartbeat). While online, a job offer card appears: service, distance, driver rating, "You earn R…", Accept/Decline.
- `#/job/:id`: driver details, **Navigate** (opens Google Maps/Waze link with coordinates), Call, Arrived, Complete, Cancel.
- `#/earnings`: today total, week chart (simple CSS bars), job list, balance owed by platform.
- `#/inbox`: notifications.
- `#/menu`: profile card (photo, name, rating, acceptance), Help, Safety, Settings, More ways to earn (Opportunities, Referrals placeholders), Manage (Vehicle, Services offered, Documents), Money (Tax info placeholder, Payout methods), Log out.

### 11.4 Admin panel (`/admin/`)
Login; Overview (counts: pending providers, active requests, today's jobs, revenue); Providers (queue with filters, detail with photo, documents viewer, approve/reject with reason); Users; Requests (filters, manual assign, cancel); Services and prices; Settings; Payouts; Audit log.

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
- [ ] P6.1 Welcome/Phone/OTP (provider branding), Type chooser (individual / company).
- [ ] P6.2 Profile-setup with **required photo**, company fields, vehicle, base location, radius, services, consent.
- [ ] P6.3 Documents page with per-document upload states and Submit for review (disabled until complete).
- [ ] P6.4 Pending page (pending/rejected states); route guard sends unapproved providers only to onboarding/pending routes.
Verification: `npm run check`; attempt submit without photo shows `ZD-PROV-001` message in the UI.
Manual test: register as an individual provider and as a company provider; try to submit without a photo (must be blocked); upload documents; confirm Pending screen.

### PHASE 7: Admin panel (review and configuration)
- [ ] P7.1 `adminAuth` middleware, `scripts/create-admin.js` (prompts for email and password; never echoes the password).
- [ ] P7.2 Admin APIs: login, providers queue/detail (signed document URLs), approve/reject (reason), document review, users list, services CRUD, settings.
- [ ] P7.3 Admin frontend: login, overview, providers list, provider detail (photo, documents, approve/reject), users, services and prices, settings.
- [ ] P7.4 Approve/reject writes audit rows and a notification to the provider.
Verification: `npm run check`; approving a non-submitted provider returns a clear coded error.
Manual test: log in as admin; approve the provider from phase 6; log in as that provider and confirm the app unlocks; reject another with a reason and confirm it shows in the provider app.

### PHASE 8: Requests, pricing, dispatch (backend)
- [ ] P8.1 `lib/money.js`, `lib/geo.js`, `lib/pricing.js` (9.3).
- [ ] P8.2 `stateMachine.js` and `requests.service.js` (create, accept, decline, arrived, complete, cancel).
- [ ] P8.3 `dispatch.service.js` (offers to nearest providers; manual assign for admin) and `expiry.job.js` (30s interval).
- [ ] P8.4 Provider online/heartbeat/offers/jobs endpoints; `GET /services`; `POST /requests/quote`.
- [ ] P8.5 Atomic accept (9.4 step 3) and audit rows for every transition.
Verification: `npm run check`; scripted curl scenario in `docs/manual-tests.md`: quote → create → offer visible to provider → accept (second accept returns `ZD-REQ-006`) → arrived → complete; cancel from each state; expiry job expires an unaccepted request.
Manual test: run the scripted scenario with one driver and one approved provider.

### PHASE 9: Driver request flow (frontend)
- [ ] P9.1 `shared/map.js`, `shared/geo.js` (Leaflet via CDN, geolocation helper, permission denied fallback to manual pin).
- [ ] P9.2 Home, Request (quote refresh on pin move), Searching, Track (5s polling, ETA, provider card), Rate, Activity list/detail.
- [ ] P9.3 Saved places, Payment methods (placeholder), Safety, Support, Settings pages.
- [ ] P9.4 Cancel flow and expired/no-providers state.
Verification: `npm run check`; no API calls bypass `apiFetch`; polling timers cleared on route change (grep for `setInterval` paired with cleanup).
Manual test: with the provider app open on another device/browser tab, request help end to end; test cancel and no-provider cases.

### PHASE 10: Provider job flow (frontend)
- [ ] P10.1 Home with Go Online (location permission, heartbeat every 15s, offer polling every 5s), offer card with Accept/Decline.
- [ ] P10.2 Job page (Navigate link, Call, Arrived, Complete, Cancel).
- [ ] P10.3 Earnings, Inbox, Menu, Services offered, Vehicle, Payout methods (display + placeholders).
- [ ] P10.4 Heartbeat stops when offline or when the page is hidden for more than 5 minutes.
Verification: `npm run check`; timers cleaned up on logout.
Manual test: go online, receive and accept a driver's request, complete the job, check earnings.

### PHASE 11: Payments, ledger, payouts
- [ ] P11.1 `ledger.service.js`, completion writes ledger entries (9.5).
- [ ] P11.2 `paystack.service.js` + `/payments/:requestId/pay` + webhook with signature verification (`ZD-PAY-002`). Idempotent on `paystack_ref`.
- [ ] P11.3 Driver pay screen (card via Paystack inline), payment status on job and activity detail.
- [ ] P11.4 Admin Payouts: provider balances, record payout, export CSV.
- [ ] P11.5 Provider Earnings shows balance and payout history.
- [ ] P11.6 Cash/EFT recording option behind a setting.
Verification: `npm run check`; duplicate webhook does not double-credit; amounts reconcile (sum of ledger equals sum of payments minus commission).
Manual test: pay a test request with Paystack test keys; record a payout in admin; confirm provider balance drops.
Note: confirm with Paystack whether split payments/subaccounts suit this marketplace before automating provider payouts.

### PHASE 12: Ratings, notifications, audit and disputes
- [ ] P12.1 Ratings endpoints and rating average updates.
- [ ] P12.2 Notifications service (events: offer received, request accepted, provider arrived, job completed, provider approved/rejected) and inbox endpoints.
- [ ] P12.3 Admin audit log page with filters (actor, entity, date, request id) and a request timeline view for disputes.
- [ ] P12.4 Admin tools: suspend/unsuspend user, delete account on request (anonymise, keep ledger).
Verification: `npm run check`; every status transition has an audit row (scripted check query in `docs/manual-tests.md`).
Manual test: complete a job, rate it, check inbox on both apps, open the request timeline in admin.

### PHASE 13: Hardening
- [ ] P13.1 Security pass: `.env` never in git history (`git log --all -- backend/.env`), `JWT_SECRET` real in Render, CORS exact origins, helmet CSP for frontend, no secrets in repo (run check rule 5 across history).
- [ ] P13.2 Rate limits on all write endpoints, upload limits, input length limits.
- [ ] P13.3 SMS OTP via `bulksms` driver (or chosen provider), `OTP_DEV_ECHO=false` in production.
- [ ] P13.4 360px width review of every screen, tap targets 44px, safe areas, desktop centred column.
- [ ] P13.5 PWA polish: install button works on mobile, offline notice, icon audit, update-available toast.
- [ ] P13.6 Error review: every API failure path shows a coded banner; remove any silent catch blocks (`catch(e){}`).
Verification: `npm run check` both sides; grep for empty catch blocks returns none.
Manual test: full regression using `docs/manual-tests.md`.

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

### Known issues
(none yet)

---

## 15. OPEN QUESTIONS (resolve and move to the decision log)

1. **SMS/OTP provider** for production (BulkSMS, Clickatell, other) and per-message budget.
2. **Fuel top-up**: legal and insurance position before activating the service.
3. **Pilot city** and radius defaults.
4. **Payments**: confirm Paystack split-payment support and whether the pilot starts with cash/EFT plus ledger.
5. **Commission** percentage after pilot interviews (default 12%).
6. **Final app names** ("ZoomDrive" and "ZoomDrive Partner") and domain availability (CIPC, domain, social handles).
7. **Partnership agreement** (equity, roles, vesting) reviewed by a lawyer.
8. **Company staff accounts** and fleet profiles (planned after the pilot, not in this build).
9. **WhatsApp request channel** for the pilot (optional addition after Phase 10).
10. **Privacy policy and terms** text (POPIA) before public launch.
node_modules/
.env
.env.*
!.env.example
*.log
.DS_Store