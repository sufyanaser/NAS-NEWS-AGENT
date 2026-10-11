# NAS Newsroom — Release A Production Readiness Report (`https://nr.nasfm.info`)

**Document Owner**: Agent 1 (`agent-1-ui-prod-readiness`)  
**Date**: 2026-10-11  
**Branch Verified**: `develop` (Commit `be0cfd8`)  
**Staging Environment (Live)**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`  
**Approved Production Target**: `https://nr.nasfm.info` (Not yet deployed — awaiting final user authorization per `CLAUDE.md` Rules 5 & 8)

---

## 1. Executive Summary

This report certifies that **Release A (Manual Editorial Newsroom Workstation)** has passed all 15 UI/UX reorganization requirements across all 5 screens and 5 target viewports (`1920x1080`, `1440x900`, `1366x768`, `390x844`, `360x800`), is live on the isolated Cloudflare Staging environment (`nas-newsroom-staging`), and is architecturally ready for production provisioning on `https://nr.nasfm.info`.

Per governance rules (`CLAUDE.md` Rules 5 & 8 and `docs/01-foundation/NAS_Newsroom_Deployment_Decision_v1.0.md`), **zero mutations** have been made to production DNS, production D1, or the `main` branch during this verification phase. Section 5 provides the exact, copy-pasteable Production Deployment Runbook ready for immediate execution upon explicit user authorization.

---

## 2. Verification of the 15 UI/UX Workstation Tasks

All 15 tasks from the Workstation Reorganization & Responsive Polish phase were verified in source code, automated Playwright E2E assertions (`e2e/slice.spec.ts`), and the live Staging deployment:

| # | UI/UX Requirement | Verification Status | Implementation & Evidence Reference |
|---|---|---|---|
| **1** | **Screen 1 — Login (`/login`)**: RTL layout, NAS FM brand identity, clear Arabic error states (`401`/`429`/network), zero horizontal overflow. | **PASS (100%)** | `src/client/main.ts` (`renderLogin`, lines 55–140); `src/client/styles.css` (`.login-wrap`, `.login-box`, lines 1079–1095). |
| **2** | **Screen 2 — New Story (`/stories/new`)**: Single-card fit-to-viewport workspace (`editor-fit-card`), URL import bar, 4-column metadata grid, 4-format selector cards, flexible source textarea, and bottom save bar. | **PASS (100%)** | `src/client/editor.ts` (`mountEditor`, lines 250–275); `src/client/styles.css` (`.editor-fit-card`, `.editor-fit-textarea`, lines 435–489). |
| **3** | **Screen 3 — Review & Edit (`/stories/:id/review`)**: Split-screen RTL comparison workstation (`38%` sticky source card on right, `1fr` 3-card editorial stack on left: Facts & Blockers, Multi-Format Editor, Human Verification & Approval). | **PASS (100%)** | `src/client/review.ts` (`mountReview`, lines 217–506); `src/client/styles.css` (`.review-split-grid`, `.editorial-stack`, lines 693–945). |
| **4** | **Screen 4 — Archive (`/archive`)**: 5 format section cards (`جميع الأخبار`, `قسم الراديو`, `قسم الموقع الإلكتروني`, `قسم فيسبوك والتواصل`, `قسم العاجل`) with live D1 counts, single-row search + category filter bar, status pills, and internal list scrolling (`#archive-list-host`). | **PASS (100%)** | `src/client/archive.ts` (`mountArchive`, lines 24–362); `src/client/styles.css` (`.archive-fit-stack`, `#archive-list-host`, lines 949–1072). |
| **5** | **Screen 5 — Settings (`/settings`)**: Station identity, editorial style, target radio duration, AI provider/model preferences backed by D1, and explicit server-side secret notice with zero password/API key inputs in DOM. | **PASS (100%)** | `src/client/settings.ts` (`mountSettings`, lines 30–277); verified by E2E `input[type="password"]` count = `0`. |
| **6** | **Fixed Desktop Workstation Shell (`>= 1025px`)**: Locked `100dvh` height (`overflow: hidden` on `html, body, #app, .shell, .main-wrap, .main, .page`) with `.boot` class removed on mount so the shell fills the viewport edge-to-edge. | **PASS (100%)** | `src/client/main.ts` (`root.classList.remove('boot')`, lines 58, 177); `src/client/styles.css` (lines 199–240). |
| **7** | **Fixed Sidebar & Always-Visible Footer (`#btn-logout`)**: Sticky/locked `100dvh` dark RTL sidebar (`228px`) with `.sidebar-top` and `.sidebar-footer` (`margin-top: auto`), ensuring `#btn-logout` is never clipped or scrolled off-screen. | **PASS (100%)** | `src/client/main.ts` (lines 240–323); `src/client/styles.css` (`.sidebar`, `.sidebar-footer`, lines 79–107). |
| **8** | **Zero Desktop Page Scroll (`1920x1080`, `1440x900`, `1366x768`)**: `documentElement.scrollHeight <= window.innerHeight` and `sidebar.scrollHeight <= sidebar.clientHeight` across all screens on all 3 desktop viewports. | **PASS (100%)** | Verified in `e2e/slice.spec.ts` (lines 489–553) across `1920x1080`, `1440x900`, and `1366x768`. |
| **9** | **Review Card Spacing & Non-Wrapping Footer at `1366x768`**: Compact padding on `.review-facts-card`, `.review-draft-card`, and `.review-approval-card`, plus single-row `.compact-save-bar` (`flex-wrap: nowrap`) so `#editor-format-textarea` never overlaps the hint/save footer and `#card-approval` stays 100% inside the `768px` height. | **PASS (100%)** | `src/client/styles.css` (lines 751–945); commits `7c3fb02` and `be0cfd8`; verified by bounding-box checks in `e2e/slice.spec.ts` (lines 549–550). |
| **10** | **Mobile & Tablet Responsive Switcher (`390x844`, `360x800`)**: Zero horizontal overflow (`scrollWidth <= clientWidth`), mobile pane switcher (`#btn-mobile-editor` / `#btn-mobile-source`) on Review screen, and stacked full-width controls on narrow viewports. | **PASS (100%)** | `src/client/review.ts` (lines 176–180, 509–518); `src/client/styles.css` (`@media (max-width: 1024px)` & `@media (max-width: 760px)`, lines 1100–1158). |
| **11** | **Contextual Copy/Paste Floating Micro-Toolbar**: `wrapWithCopyPaste` & `wrapReadOnlyWithCopy` provide floating `نسخ` / `لصق` controls on hover, keyboard `:focus-within`, and touch (`touch-active`), positioned on the left for RTL fields and on the right for LTR fields (`.field-clip-wrap:has(.ltr)`). | **PASS (100%)** | `src/client/clipboard.ts` (lines 29–266); `src/client/styles.css` (`.field-clip-wrap`, `.ctx-clip-bar`, lines 358–430). |
| **12** | **Contextual Clipboard Rules & Permission Safety**: Excludes `<select>` and `<input type="date">`; hides `نسخ الرابط` when URL is empty (`copyOnlyWhenNonEmpty: true`); hides `لصق` on read-only source reading box (`#review-source-body`) and locked stories; confirms `تم النسخ ✓` / `تم اللصق ✓` only after Clipboard API promise resolves. | **PASS (100%)** | `src/client/clipboard.ts` (lines 102–163, 230–255); verified in `e2e/slice.spec.ts` (lines 447–487). |
| **13** | **Smart Local Date Input (`#f-publish-date`)**: Defaults to user's local timezone date (`getLocalTodayIsoDate()` in `YYYY-MM-DD`, never raw UTC `toISOString().slice(0,10)`) on new stories while preserving saved `publishDate` when loading existing stories. | **PASS (100%)** | `src/client/editor.ts` (`getLocalTodayIsoDate`, lines 19–24, 88, 118–123); verified in `e2e/slice.spec.ts` (lines 425–445). |
| **14** | **Premium Custom-Styled RTL Dropdowns (`.select`)**: Unified `36px` height (`.select-sm` `32px`), custom embedded SVG chevron positioned on the left (`background-position: left 10px center; padding-left: 32px`), hover/focus states matching `.input`. | **PASS (100%)** | `src/client/styles.css` (`.select`, lines 322–339). |
| **15** | **Icon & Visual Asset Integrity**: All navigation, brand, format, and section icons in `src/client/assets/icons/` and root favicons copy cleanly to `dist/client/` and render with `img.complete && img.naturalWidth > 0` (`brokenImgs = []`). | **PASS (100%)** | `scripts/build-client.mjs`; verified across all routes in `e2e/slice.spec.ts` (lines 510–530, 551). |

### Viewport Verification Matrix

| Viewport | Class | Outer Vertical Scroll (`docScrollH <= winH`) | Horizontal Overflow (`docScrollW <= winW`) | Sidebar Scroll (`sidebarScrollH <= clientH`) | `#btn-logout` & `#card-approval` Inside Viewport | Broken Images |
|---|---|---|---|---|---|---|
| **`1920x1080`** | Desktop Full HD | `1080 <= 1080` (0px scroll) | `1920 <= 1920` (0px) | `1080 <= 1080` (0px) | Yes (`<= 1080px`) | `0` |
| **`1440x900`** | Desktop WXGA+ | `900 <= 900` (0px scroll) | `1440 <= 1440` (0px) | `900 <= 900` (0px) | Yes (`<= 900px`) | `0` |
| **`1366x768`** | Laptop Standard | `768 <= 768` (0px scroll) | `1366 <= 1366` (0px) | `768 <= 768` (0px) | Yes (`<= 768px`) | `0` |
| **`390x844`** | Mobile (iPhone 14) | Responsive vertical flow | `390 <= 390` (0px) | Responsive top bar | Accessible | `0` |
| **`360x800`** | Mobile (Android Compact) | Responsive vertical flow | `360 <= 360` (0px) | Responsive top bar | Accessible | `0` |

---

## 3. Current Staging Deployment Details

The Staging environment is live and isolated from both the public station website (`nasfm.info`) and the planned production newsroom (`nr.nasfm.info`):

- **Staging URL**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`
- **Worker Name**: `nas-newsroom-staging` (`env.staging` in `wrangler.jsonc`)
- **Active Version ID**: `42647d22-6a7b-4042-8e5a-63f847dc9ff8` (Deployed `2026-10-11T16:38:31.390Z`)
- **Staging D1 Database**: `nas-newsroom-staging-db`
  - **UUID**: `16f339cc-4038-44a5-a522-a933dc2ba07b`
  - **Migrations Applied**: `0001_init.sql`, `0002_selected_formats.sql`
- **Staging `ALLOWED_ORIGIN`**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`
- **Live HTTP Security Headers Verified (`HEAD https://nas-newsroom-staging.nasfm98-7.workers.dev`)**:
  - `HTTP/1.1 200 OK`
  - `Strict-Transport-Security: max-age=31536000` (No `includeSubDomains`)
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 4. Read-Only Cloudflare & Domain Inspection for `https://nr.nasfm.info`

### 4.1 Cloudflare Account & Token Readiness (`npx wrangler whoami`)
- **Account Name**: `Nasfm98.7@gmail.com's Account`
- **Account ID**: `319042c4d3205823b79bcce277d353b4`
- **Authenticated User**: `nasfm98.7@gmail.com`
- **Active OAuth Scopes**: `account (read)`, `zone (read)`, `workers (write)`, `workers_routes (write)`, `workers_scripts (write)`, `d1 (write)`, `ssl_certs (write)`, `secrets_store (write)`.
- **Readiness Verdict**: The authenticated Wrangler session holds all required permissions to provision the production D1 database, upload secrets, deploy the production Worker, and attach the Custom Domain `nr.nasfm.info`.

### 4.2 D1 Database Separation (`npx wrangler d1 list`)
| Database Name | UUID | Environment / Role | Isolation Status |
|---|---|---|---|
| `nas-fm-db` | `a571d21d-e2c5-49bd-890f-2c05f573c450` | Public NAS FM Website (`nasfm.info`) | **Untouched & Isolated** |
| `nas-newsroom-staging-db` | `16f339cc-4038-44a5-a522-a933dc2ba07b` | Newsroom Staging (`nas-newsroom-staging`) | **Active for Staging** |
| `nas-newsroom-db` | *(Placeholder `00000000-0000-0000-0000-000000000000`)* | Newsroom Production (`nas-newsroom`) | **Ready to create upon approval** |

### 4.3 DNS & Zone Inspection (`Resolve-DnsName`)
- **Root Domain (`nasfm.info`)**:
  - **Authoritative Nameservers (`NS`)**: `dolly.ns.cloudflare.com`, `jack.ns.cloudflare.com` (Cloudflare delegation is active and verified).
  - **Root `A` / `AAAA` Records**: `188.114.96.3`, `188.114.97.3`, `2a06:98c1:3120::3`, `2a06:98c1:3121::3` (Cloudflare proxied edge).
- **Production Subdomain (`nr.nasfm.info`)**:
  - **Current DNS Resolution**: `NXDOMAIN` (No `A`, `AAAA`, or `CNAME` record exists yet).
  - **Readiness Verdict**: Because `nasfm.info` is already an active Cloudflare Zone in this account, attaching `nr.nasfm.info` as a **Cloudflare Worker Custom Domain** will automatically create the proxied Worker DNS record and issue an edge TLS certificate for `nr.nasfm.info` without touching the root `nasfm.info` records.

### 4.4 Security, Cookie, HSTS, CSP & `ALLOWED_ORIGIN` Audit for `https://nr.nasfm.info`
1. **`ALLOWED_ORIGIN` & CSRF Protection (`wrangler.jsonc` & `src/worker.ts`)**:
   - Top-level production `vars.ALLOWED_ORIGIN` in `wrangler.jsonc` (line 24) is set to `"https://nr.nasfm.info"`.
   - `assertSameOriginIntent` in `src/worker.ts` (lines 26–30) enforces both `X-NAS-Client: 1` and `Origin === env.ALLOWED_ORIGIN` (`https://nr.nasfm.info`) on all non-`GET`/`HEAD` requests, returning `403 forbidden` on any mismatch.
   - Zero CORS headers (`Access-Control-Allow-Origin`) are emitted anywhere.
2. **Host-Only Session Cookie (`src/server/auth.ts`)**:
   - `buildSessionCookie` (lines 21–23) emits:
     `nas_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=...`
   - Deliberately omits the `Domain` attribute (never `Domain=.nasfm.info`), guaranteeing the session cookie is **host-only** to `nr.nasfm.info` and never sent to `nasfm.info` or any other subdomain (Specs §15.1).
3. **HSTS Without `includeSubDomains` (`src/client/_headers`)**:
   - `src/client/_headers` (lines 5, 12) sets `Strict-Transport-Security: max-age=31536000` without `includeSubDomains`, complying strictly with Technical Specs §12.1 and §15.1 so the root domain `nasfm.info` is unaffected.
4. **Content Security Policy & API Headers (`src/client/_headers` & `src/server/http.ts`)**:
   - Static assets serve `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
   - API JSON responses (`src/server/http.ts`, lines 13–17) enforce `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Cache-Control: no-store`.

---

## 5. Step-by-Step Production Deployment Runbook (Release A → `https://nr.nasfm.info`)

> [!IMPORTANT]
> **Authorization Gate (`CLAUDE.md` Rules 5 & 8)**: Do **NOT** execute the commands below until the user grants explicit final authorization to deploy to `https://nr.nasfm.info` and merge `develop` into `main`.

### Step 1 — Create the Isolated Production D1 Database (`nas-newsroom-db`)
Run from `H:\Projects\NAS-NEWS-AGENT`:
```powershell
npx wrangler d1 create nas-newsroom-db
```
Copy the returned `database_id` UUID and replace the placeholder `"00000000-0000-0000-0000-000000000000"` in `wrangler.jsonc` under top-level `d1_databases[0].database_id`.

### Step 2 — Apply Production D1 Schema Migrations
Apply both verified migrations (`0001_init.sql` and `0002_selected_formats.sql`) to the remote production database:
```powershell
npx wrangler d1 migrations apply nas-newsroom-db --remote
```

### Step 3 — Configure Production Worker Secrets & Custom Domain in `wrangler.jsonc`
1. Set a cryptographically random `SESSION_SIGNING_KEY` secret in the production Worker:
   ```powershell
   $bytes = New-Object Byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $secret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
   $secret | npx wrangler secret put SESSION_SIGNING_KEY
   ```
2. Add the Custom Domain route to the top-level production configuration in `wrangler.jsonc`:
   ```jsonc
   "routes": [
     {
       "pattern": "nr.nasfm.info",
       "custom_domain": true
     }
   ]
   ```

### Step 4 — Seed the Single Production Editor Account
Seed the initial editor account into `nas-newsroom-db` using PBKDF2-HMAC-SHA256 (`100,000` iterations, 16-byte random salt; plaintext password is never stored):
```powershell
$env:NAS_DB_NAME = "nas-newsroom-db"
$env:NAS_REMOTE = "true"
$env:NAS_EDITOR_EMAIL = "<production-editor-email>"
$env:NAS_EDITOR_PASSWORD = "<strong-production-password>"
npm run db:seed
Remove-Item Env:\NAS_EDITOR_PASSWORD
```

### Step 5 — Run Full Pre-Release Quality Gate & Build
```powershell
npm run check
```
Verify:
- `npm run lint` (`0` errors)
- `npm run typecheck` (`0` errors)
- `npm run build` & `npm run check:bundle` (`dist/client` contains zero secret identifiers)
- `npm test` (100% Vitest unit & integration tests passing)
- `npm run test:e2e` (100% Playwright E2E suite passing)

### Step 6 — Merge `develop` to `main` and Deploy to Production (`https://nr.nasfm.info`)
```powershell
git checkout main
git merge --no-ff develop -m "release: Release A production candidate for nr.nasfm.info"
git push origin main
npx wrangler deploy
```

### Step 7 — Post-Deployment Live Smoke Tests on `https://nr.nasfm.info`
1. **DNS & TLS Verification**:
   ```powershell
   Resolve-DnsName nr.nasfm.info
   Invoke-WebRequest -Uri "https://nr.nasfm.info/login" -Method Head -UseBasicParsing
   ```
   Confirm `200 OK`, valid HTTPS certificate, `Strict-Transport-Security: max-age=31536000` (without `includeSubDomains`), and `Content-Security-Policy: default-src 'self'...`.
2. **Root Domain Isolation Check**:
   ```powershell
   Invoke-WebRequest -Uri "https://nasfm.info" -Method Head -UseBasicParsing
   ```
   Confirm `https://nasfm.info` remains completely unaffected.
3. **Authentication & Host-Only Cookie Check**:
   - Log in at `https://nr.nasfm.info/login` and verify `Set-Cookie: nas_session=...; HttpOnly; Secure; SameSite=Strict; Path=/` (no `Domain` attribute).
4. **End-to-End Editorial Smoke Test**:
   - Create a draft on `/stories/new`, verify autosave (`محفوظ`), transition to `/stories/:id/review`, edit formats, complete human verification checks, approve (`معتمد`), verify multi-format filtering in `/archive`, and log out (`POST /api/auth/logout` revokes D1 session).
