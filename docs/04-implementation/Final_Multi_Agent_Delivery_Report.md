# NAS Newsroom — Final Multi-Agent Delivery & Verification Report

**Document Owner**: Agent 6 (`agent-6-integration-release` — Integration, Verification & Staging/Prod Release Manager)  
**Date**: 2026-10-11  
**Track A — Production (`main`)**: **LIVE** on `https://nr.nasfm.info` (Commit `e3573cd8cc22383da056c2bb47f8b9f27dfb2ab5`, Worker Version ID `1976b85a-6a4c-4c57-951e-0c1757dec41c`, Production D1 `nas-newsroom-db` `afb6589e-0630-44db-9dae-0a6d2015b28f`)  
**Track B — Staging (`develop`)**: **LIVE** on `https://nas-newsroom-staging.nasfm98-7.workers.dev` (Worker Version ID `f42293e2-2fb4-4b1c-8e8a-37f2c6e8d11f`, Staging D1 `nas-newsroom-staging-db` `16f339cc-4038-44a5-a522-a933dc2ba07b`)

---

## 1. Executive Summary & Multi-Agent Execution Roster

The NAS Newsroom engineering delivery is complete across two strictly isolated tracks:

1. **Track A — Release A (Manual Newsroom Workstation — LIVE on `https://nr.nasfm.info`)**:
   - Provisioned isolated Production D1 database `nas-newsroom-db` (`afb6589e-0630-44db-9dae-0a6d2015b28f`), applied migrations `0001_init.sql` and `0002_selected_formats.sql`, set `SESSION_SIGNING_KEY`, seeded the initial production editor account, merged to `main` (`e3573cd8cc22383da056c2bb47f8b9f27dfb2ab5`), and deployed to `https://nr.nasfm.info` (Worker Version `1976b85a-6a4c-4c57-951e-0c1757dec41c`) with all 15 live production smoke checks passing.
2. **Track B — Release B (Multi-Provider AI Layer, Arabic Editorial Pipeline & Red Team Suite — LIVE on `https://nas-newsroom-staging.nasfm98-7.workers.dev`)**:
   - Implemented multi-provider AI abstraction (`Google Gemini`, `OpenAI`, `Anthropic Claude`, `OpenRouter`), verified stable model catalog (`claude-haiku-4-5-20251001`, `google/gemma-3-27b-it:free`, zero `-exp` models, explicit non-guaranteed quota disclosures), Arabic editorial prompt/schema/blocker/number-guard pipeline, canonical `SC-01` / `SC-02` / `SC-03` + `AI-UNATTRIBUTED-CLAIM` + `AI-EN-TO-AR` test suites (`97/97` Vitest tests, `44/44` Playwright E2E tests), and deployed to Cloudflare Staging (`f42293e2-2fb4-4b1c-8e8a-37f2c6e8d11f`).

| Agent ID | Role | Delivered Scope & Owned Artifacts | Status |
|---|---|---|---|
| **Orchestrator** | Principal Engineering Orchestrator | Shared contracts ([`src/shared/contracts.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/shared/contracts.ts)), Worker bindings ([`src/server/env.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/env.ts)), API routing ([`src/worker.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/worker.ts)), settings & connection test endpoints ([`src/server/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/settings.ts)), story AI extraction endpoint ([`src/server/stories.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/stories.ts)), and Track A Production release on `https://nr.nasfm.info`. | **COMPLETE** |
| **Agent 1** (`agent-1-ui-prod-readiness`) | UI/UX Finalizer & Production Release Engineer | Verification of all 15 UI/UX workstation tasks across all 5 screens and 5 viewports (`1920x1080`, `1440x900`, `1366x768`, `390x844`, `360x800`), DNS/Zone/D1 verification for `nr.nasfm.info`, and Release A Production Runbook ([`docs/04-implementation/Release_A_Production_Readiness.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/Release_A_Production_Readiness.md)). | **COMPLETE** |
| **Agent 2** (`agent-2-ai-providers`) | AI Provider & Model Architecture Engineer | Multi-provider abstraction ([`src/server/ai/types.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/types.ts), [`src/server/ai/catalog.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/catalog.ts), [`src/server/ai/registry.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/registry.ts)), adapters for Gemini, OpenAI, Anthropic, and OpenRouter (`src/server/ai/providers/*.ts`), cost calculator, timeout/error classification, and unit suite ([`test/ai-providers.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-providers.test.ts)). | **COMPLETE** |
| **Agent 3** (`agent-3-editorial-pipeline`) | Arabic Editorial AI Pipeline Engineer | Prompt-injection-resistant Arabic editorial prompts ([`src/server/ai/prompts.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/prompts.ts)), strict JSON output validator ([`src/server/ai/schema.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/schema.ts)), server-side `Number Superset Check` (Specs §8.1), deterministic `hasBlocker` computation (Specs §7.3) ([`src/server/ai/pipeline.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/pipeline.ts)), and unit suite ([`test/ai-pipeline.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-pipeline.test.ts)). | **COMPLETE** |
| **Agent 4** (`agent-4-ai-frontend`) | Frontend AI & Settings Integration Engineer | Client API integration ([`src/client/api.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/api.ts)), provider/model catalog & live connection tester in Settings ([`src/client/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/settings.ts)), AI generation bar, manual-edit overwrite confirmation, token/latency/warning badges, and graceful manual fallback in Review & Edit ([`src/client/review.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/review.ts), [`src/client/styles.css`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/styles.css)). | **COMPLETE** |
| **Agent 5** (`agent-5-security-redteam-qa`) | Security, Red Team & Editorial QA Lead | Red Team security & editorial scenario test suite covering canonical `SC-01`, `SC-02`, `SC-03`, `AI-UNATTRIBUTED-CLAIM`, `AI-EN-TO-AR`, prompt injection, secret canary isolation, key-injection rejection, and CSRF/auth gates ([`test/ai-redteam.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-redteam.test.ts)), plus the 30-story pre-production evaluation protocol ([`docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md)). | **COMPLETE** |
| **Agent 6** (`agent-6-integration-release`) | Integration, Verification & Staging/Prod Release Manager | End-to-end Playwright AI & workstation tests ([`e2e/slice.spec.ts`](file:///h:/Projects/NAS-NEWS-AGENT/e2e/slice.spec.ts)), local E2E upstream origin config ([`scripts/e2e-server.mjs`](file:///h:/Projects/NAS-NEWS-AGENT/scripts/e2e-server.mjs)) & route isolation ([`wrangler.jsonc`](file:///h:/Projects/NAS-NEWS-AGENT/wrangler.jsonc)), full `npm run check` gate execution, Cloudflare Staging deployment (`nas-newsroom-staging`), live HTTP smoke testing, and this final delivery report. | **COMPLETE** |

---

## 2. Track A — Release A Live Production Verification (`https://nr.nasfm.info`)

Release A (Manual Editorial Newsroom Workstation) is **live in Production**:

- **Production URL**: `https://nr.nasfm.info`
- **Production Branch & Commit**: `main` (`e3573cd8cc22383da056c2bb47f8b9f27dfb2ab5`)
- **Production Worker Name**: `nas-newsroom`
- **Production Worker Version ID**: `1976b85a-6a4c-4c57-951e-0c1757dec41c`
- **Production D1 Database**: `nas-newsroom-db` (`afb6589e-0630-44db-9dae-0a6d2015b28f`)
- **Public Root Domain Isolation**: `nasfm.info` and `nas-fm-db` (`a571d21d-e2c5-49bd-890f-2c05f573c450`) remain 100% isolated and untouched.

### 15/15 Passing Live Production Smoke Checks on `https://nr.nasfm.info`

| # | Production Check | Live Result |
|---|---|---|
| **1** | **DNS & TLS Custom Domain (`nr.nasfm.info`)** | **PASS** — Active Cloudflare Custom Domain with valid edge TLS certificate (`HTTP/2 200 OK`). |
| **2** | **Root Domain Isolation (`https://nasfm.info`)** | **PASS** — `https://nasfm.info` responds normally and is completely unaffected. |
| **3** | **HSTS Without `includeSubDomains`** | **PASS** — `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`). |
| **4** | **Content Security Policy & Security Headers** | **PASS** — `Content-Security-Policy: default-src 'self'...`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| **5** | **Unauthenticated Session Probe (`GET /api/session`)** | **PASS** — Returns `401 unauthenticated` with `Cache-Control: no-store`. |
| **6** | **CSRF & Origin Protection (`assertSameOriginIntent`)** | **PASS** — Rejects missing `X-NAS-Client: 1` or foreign `Origin` headers with `403 forbidden`. |
| **7** | **Authenticated Login (`POST /api/auth/login`)** | **PASS** — Returns `200 OK` and sets host-only cookie `nas_session=...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` (no `Domain` attribute). |
| **8** | **Settings Persistence (`GET` & `PUT /api/settings`)** | **PASS** — Reads and persists station identity & editorial preferences in `nas-newsroom-db` with zero secret exposure. |
| **9** | **Draft Creation & Autosave (`POST` & `PATCH /api/stories`)** | **PASS** — Creates draft (`201 Created`) and persists source metadata, selected formats, and text in `nas-newsroom-db`. |
| **10** | **SSRF-Safe URL Import (`POST /api/stories/:id/import`)** | **PASS** — Blocks loopback/private IP (`https://127.0.0.1/...`) with Arabic `blocked` message while preserving existing draft text (`SC-02`). |
| **11** | **Transition to Review (`POST /api/stories/:id/start-review`)** | **PASS** — Transitions status from `مسودة` to `قيد المراجعة`. |
| **12** | **Human Verification Gates & Blocker Enforcement** | **PASS** — Blocks `POST /api/stories/:id/approve` (`422 approval_blocked`) until both human verification checks (`factsVerified`, `attributionVerified`) are confirmed and no blocker is active. |
| **13** | **Story Approval & Publication (`approve` → `publish`)** | **PASS** — Transitions `قيد المراجعة` → `معتمد` → `منشور` and records audit events in `story_events`. |
| **14** | **Multi-Format Archive Filtering (`GET /api/stories`)** | **PASS** — Returns accurate `counts` (`total`, `byFormat`, `byStatus`) and filters stories by format without duplicate rows. |
| **15** | **Logout & Session Revocation (`POST /api/auth/logout`)** | **PASS** — Returns `204 No Content`, clears cookie, and revokes the session in `nas-newsroom-db` (subsequent replay returns `401`). |

---

## 3. Track B — Full Verification Gate Results (`npm run check`)

The complete quality gate (`npm run check`) on `develop` passed with **exit code `0`**:

| Check Step | Command | Result | Details |
|---|---|---|---|
| **1. ESLint** | `npm run lint` | **PASS (`0` errors, `0` warnings)** | Strict TypeScript & browser/worker lint rules across `src/`, `test/`, `e2e/`, and `scripts/`. |
| **2. TypeScript Typecheck** | `npm run typecheck` | **PASS (`0` errors)** | `tsc -p tsconfig.json --noEmit` (Worker/Server) and `tsc -p tsconfig.client.json --noEmit` (Browser Client). |
| **3. Client Bundle Build** | `npm run build` | **PASS (`107.3 KB` minified)** | Zero runtime dependencies bundled into `dist/client/app.js` + static icons and `_headers`. |
| **4. Secret & Bundle Audit** | `npm run check:bundle` | **PASS (`33` files verified)** | `scripts/check-bundle.mjs` confirmed zero occurrences of `AI_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `SESSION_SIGNING_KEY`, `password_hash`, or `sk-`. |
| **5. Vitest Unit & Red Team Suite** | `npm test` | **PASS (`8` files, `97 / 97` tests)** | 100% green across auth, stories, import, workflow/archive, schema/secrets, AI providers, AI pipeline, and AI Red Team suites. |
| **6. Playwright E2E Suite** | `npm run test:e2e` | **PASS (`44 / 44` tests — Desktop & Mobile)** | 22 E2E test specifications executed across both `[desktop]` (`1440x900` + multi-viewport `1920x1080`, `1440x900`, `1366x768`) and `[mobile]` (`390x844`, `360x800`) projects. |

### 3.1 Vitest Test Suite Breakdown (`97 / 97` Passing across `8` Files)

| Test Suite File | Tests Passed | Core Coverage |
|---|---|---|
| [`test/auth.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/auth.test.ts) | `18 / 18` | PBKDF2 login, `HttpOnly; Secure; SameSite=Strict` host-only cookie, rate limiting (`429`), session expiry & server-side logout revocation. |
| [`test/stories.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/stories.test.ts) | `15 / 15` | Draft creation, autosave `PATCH`, field length guards (`100,000` source text cap), user isolation, and audit event logging. |
| [`test/import.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/import.test.ts) | `12 / 12` | SSRF blocking (`127.0.0.1`, metadata IPs, private CIDRs, non-HTTPS), redirect limits, byte cap (`2 MB`), and graceful manual fallback (`SC-02`). |
| [`test/workflow-and-archive.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/workflow-and-archive.test.ts) | `5 / 5` | 5-state transitions (`مسودة` → `قيد المراجعة` → `معتمد` → `منشور` / `مستبعد`), human check gates, blocker resolution check resets, and multi-format archive filtering. |
| [`test/schema-and-secrets.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/schema-and-secrets.test.ts) | `7 / 7` | Exact 6-table D1 schema invariant, foreign keys, indexes, canary secret isolation, and sanitized `500` error responses. |
| [`test/ai-providers.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-providers.test.ts) | `10 / 10` | Provider normalization, model resolution across Gemini/OpenAI/Anthropic/OpenRouter (`claude-haiku-4-5-20251001`, `google/gemma-3-27b-it:free`, zero `-exp` models, non-guaranteed quota notes), cost calculation, HTTP error classification, and connection testing. |
| [`test/ai-pipeline.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-pipeline.test.ts) | `16 / 16` | Arabic prompt construction, XML tag breakout escaping, JSON schema validation, Eastern/Western Arabic numeral normalization, `Number Superset Check`, `computeHasBlocker`, and canonical scenario alignment (`SC-01`, `SC-02`, `SC-03`, `AI-UNATTRIBUTED-CLAIM`, `AI-EN-TO-AR`). |
| [`test/ai-redteam.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-redteam.test.ts) | `14 / 14` | Secret canary leak checks, browser key-injection rejection (`400`), CSRF/Origin enforcement (`403`), prompt injection resistance, canonical `SC-01` (UNESCO Iraq education), `SC-02` (import failure + manual paste + AI extraction), `SC-03` (conflicting speed limit narratives -> `hasBlocker`), `AI-UNATTRIBUTED-CLAIM` (40% water waste rumor -> `hasBlocker` & `422`), `AI-EN-TO-AR` (English UNICEF river report -> Arabic drafts), manual edit overwrite protection, and provider failure safety. |

### 3.2 Playwright E2E Suite Breakdown (`44 / 44` Passing — `22` Desktop + `22` Mobile)

- **Authentication (`4` specs × 2)**: Unauthenticated redirect to RTL `/login`, wrong password handling, `HttpOnly; Secure; SameSite=Strict` cookie creation, and server-side session revocation on logout.
- **Draft Persistence (`7` specs × 2)**: Autosave, reload restoration, archive resumption, explicit save, network failure recovery without data loss, expired session warning, and SPA navigation flush.
- **Secure Source Import & Manual Fallback (`2` specs × 2)**: Loopback/SSRF URL rejection with friendly Arabic message preserving manual text (`SC-02`), and successful article import updating character counters.
- **Layout & Security Headers (`3` specs × 2)**: Zero horizontal overflow, zero secret strings in `/app.js`, and strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security: max-age=31536000` (without `includeSubDomains`).
- **Full 5-Screen Editorial Workflow (`1` spec × 2)**: End-to-end journey from `/stories/new` → `/stories/:id/review` (manual facts, 4 formats, human verification gates, approval `معتمد`, publication `منشور`) → `/archive` multi-format filtering → `/settings` D1 persistence.
- **Workstation UX Reorganization (`3` specs × 2)**: Smart local date input (`YYYY-MM-DD`), contextual copy/paste micro-toolbars (`نسخ` / `لصق`), and strict Fixed Shell viewport geometry across `1920x1080`, `1440x900`, `1366x768` (zero vertical/horizontal page scroll, zero sidebar scroll, `#btn-logout` & `#card-approval` inside viewport, zero broken icons) and mobile `390x844`, `360x800` (zero horizontal overflow).
- **Multi-Provider AI Settings, Connection Test & Editorial AI Generation (`2` specs × 2)**:
  1. Verifies `#setting-model-provider` (`gemini`, `openai`, `anthropic`, `openrouter`), model switching (`gemini-2.5-flash` with `Google AI Studio` / `Free Tier` / `مجاني` pricing note, and `meta-llama/llama-3.3-70b-instruct:free` on OpenRouter), unconfigured connection test feedback, and mocked live connection test (`142ms`, badge updated to `Connected`).
  2. Verifies graceful manual fallback on `/stories/:id/review` when AI is unconfigured (`503 not_configured` displays Arabic fallback guidance while preserving the editor's manual headline 100%), followed by AI generation with overwrite confirmation (`#btn-ai-overwrite-all`), updating `#editor-headline-input`, `#editor-format-textarea`, `#ai-disconnected-notice` (`gemini-2.5-flash` • `530 توكن`), and `#ai-insights-box` (`editorialNotes` + `numberWarnings`).

---

## 4. Track B — Cloudflare Staging Deployment & Live Smoke Tests (`https://nas-newsroom-staging.nasfm98-7.workers.dev`)

Track B (Release B) is deployed and verified live on the isolated Cloudflare Staging environment:

- **Staging URL**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`
- **Worker Name**: `nas-newsroom-staging` (`workers_dev: true`, `routes: []`)
- **Active Staging Version ID**: `f42293e2-2fb4-4b1c-8e8a-37f2c6e8d11f`
- **Bundle Size**: `134.21 KiB` (`gzip: 26.64 KiB`), Worker Startup Time: `1 ms`
- **Staging D1 Database**: `nas-newsroom-staging-db` (`16f339cc-4038-44a5-a522-a933dc2ba07b`)
- **Production Isolation Confirmed**: `https://nr.nasfm.info` remains bound exclusively to `nas-newsroom` (Release A Version `1976b85a-6a4c-4c57-951e-0c1757dec41c`).

### Live HTTP Smoke Test Matrix on `https://nas-newsroom-staging.nasfm98-7.workers.dev`

| Step | Endpoint | HTTP Status | Live Verification Summary | Verdict |
|---|---|---|---|---|
| **1. Login** | `POST /api/auth/login` | `200 OK` | Authenticated `staging-editor@nasfm.info`; received `nas_session` (`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`). | **PASS** |
| **2. Get Settings** | `GET /api/settings` | `200 OK` | Returned station settings (`aiConfigured: false`, `providersCount: 4`) with zero secrets exposed. | **PASS** |
| **3. Updated AI Catalog** | `GET /api/ai/catalog` | `200 OK` | Confirmed live model list: `["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "meta-llama/llama-3.3-70b-instruct:free", "google/gemma-3-27b-it:free", "qwen/qwen-2.5-72b-instruct:free"]` (`hasClaudeHaiku45: true`, `hasGemma3_27b: true`, `expModelsCount: 0`, `11/11` models carry explicit non-guaranteed quota disclosures). | **PASS** |
| **4. Test Model** | `POST /api/settings/test-model` | `200 OK` | Returned `{ ok: false, provider: "gemini", model: "gemini-2.5-flash", configured: false, connected: false, errorClass: "not_configured" }` with clear Arabic message. | **PASS** |
| **5. Story Extract Fallback** | `POST /api/stories/:id/extract` | `503 Service Unavailable` | Returned `{ error: "not_configured", message: "مزود الذكاء الاصطناعي غير مهيأ على الخادم..." }`; story draft preserved 100% intact in D1. | **PASS** |
| **6. Logout & Revocation** | `POST /api/auth/logout` | `204 No Content` | Session revoked on server; replaying cookie against `GET /api/session` returns `401`. | **PASS** |

---

## 5. Verified Multi-Provider AI Model Catalog & Pricing Table

All 11 model identifiers and pricing metadata in [`src/server/ai/catalog.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/catalog.ts) and [`src/client/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/settings.ts) are verified stable models (zero `-exp` identifiers, with explicit non-guaranteed free-tier/quota disclosures):

| Provider (`AIProviderId`) | Secret Binding (`Env`) | Model ID | Display Label | Tier | Input / 1M Tokens (USD) | Output / 1M Tokens (USD) | Pricing & Non-Guaranteed Quota Disclosure | Recommended Newsroom Use |
|---|---|---|---|---|---|---|---|---|
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-flash` *(Default)* | Gemini 2.5 Flash (موصى به — متوازن وسريع) | **Free Tier** (`free`) | `$0.15` *(Paid tier)* | `$0.60` *(Paid tier)* | الحصة المجانية في Google AI Studio غير مضمونة وتخضع لأهلية الحساب وحدود الطلبات اليومية (Rate Limits)؛ وفي الطبقة المدفوعة 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن | الاستخراج التحريري اليومي والصياغة الإذاعية السريعة |
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite (اقتصادي فائق السرعة) | **Free Tier** (`free`) | `$0.075` *(Paid tier)* | `$0.30` *(Paid tier)* | الحصة المجانية في Google AI Studio غير مضمونة وتخضع لأهلية الحساب وحدود الاستخدام؛ وفي الطبقة المدفوعة 0.075$ للمدخلات / 0.30$ للمخرجات لكل مليون توكن | الأخبار القصيرة والمعالجة السريعة منخفضة التكلفة |
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-pro` | Gemini 2.5 Pro (تحليل معمق) | **Paid** (`paid`) | `$1.25` | `$10.00` | مدفوع حسب الاستخدام: 1.25$ للمدخلات / 10.00$ للمخرجات لكل مليون توكن (الحصة المجانية غير مضمونة وتتطلب تفعيل الفوترة أو أهلية AI Studio) | التقارير المركبة والترجمة التحريرية الدقيقة من الإنجليزية |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4.1-mini` *(Default)* | GPT-4.1 Mini (سريع ومتوازن التكلفة) | **Paid** (`paid`) | `$0.40` | `$1.60` | مدفوع حسب الاستخدام: 0.40$ للمدخلات / 1.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً) | الصياغة الإخبارية السريعة والالتزام الصارم بمخطط JSON |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4.1` | GPT-4.1 (دقة تحريرية عالية) | **Paid** (`paid`) | `$2.00` | `$8.00` | مدفوع حسب الاستخدام: 2.00$ للمدخلات / 8.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً) | التحرير الإذاعي المتقدم ومطابقة الإسناد الصارمة |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4o-mini` | GPT-4o Mini (اقتصادي) | **Paid** (`paid`) | `$0.15` | `$0.60` | مدفوع حسب الاستخدام: 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً) | المعالجة الاقتصادية السريعة |
| **`anthropic`** (Anthropic Claude) | `ANTHROPIC_API_KEY` *(or `AI_API_KEY`)* | `claude-sonnet-4-20250514` *(Default)* | Claude Sonnet 4 (جودة لغوية عربية ممتازة) | **Paid** (`paid`) | `$3.00` | `$15.00` | مدفوع حسب الاستخدام: 3.00$ للمدخلات / 15.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في Anthropic API ويتطلب رصيداً مسبق الدفع) | الصياغة العربية الرصينة وتحليل المصادر الطويلة |
| **`anthropic`** (Anthropic Claude) | `ANTHROPIC_API_KEY` *(or `AI_API_KEY`)* | `claude-haiku-4-5-20251001` | Claude Haiku 4.5 (سريع واقتصادي) | **Paid** (`paid`) | `$1.00` | `$5.00` | مدفوع حسب الاستخدام: 1.00$ للمدخلات / 5.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في Anthropic API ويتطلب رصيداً مسبق الدفع) | الاستخراج السريع للمسودات اليومية |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `meta-llama/llama-3.3-70b-instruct:free` *(Default)* | Llama 3.3 70B Instruct (مجاني عبر OpenRouter) | **Free Tier** (`free`) | `$0.00` | `$0.00` | الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود معدل الطلبات (Rate Limits) وأهلية المزود وتوافر السعة | التجربة المجانية والتوليد الاحتياطي |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `google/gemma-3-27b-it:free` | Gemma 3 27B Instruct (مجاني عبر OpenRouter) | **Free Tier** (`free`) | `$0.00` | `$0.00` | الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود معدل الطلبات اليومية (Rate Limits) وتوافر المزود | التوليد السريع المجاني عبر بوابة موحدة |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `qwen/qwen-2.5-72b-instruct:free` | Qwen 2.5 72B Instruct (مجاني — داعم للعربية) | **Free Tier** (`free`) | `$0.00` | `$0.00` | الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود الطلبات اليومية (Rate Limits) وأهلية الحساب | المعالجة العربية متعددة الصيغ بدون تكلفة |

---

## 6. Release B Production Upgrade Gate (`https://nr.nasfm.info`)

Per project governance (`Decision Paper` & `Technical Specs §14 / §16`), **Production (`https://nr.nasfm.info`) remains on Release A (`1976b85a-6a4c-4c57-951e-0c1757dec41c`)** until the following two prerequisites are completed on Staging (`https://nas-newsroom-staging.nasfm98-7.workers.dev`):

1. **Configure 1+ Live AI Provider Secret on Staging**:
   ```powershell
   npx wrangler secret put GEMINI_API_KEY --env staging
   # Optional additional providers:
   npx wrangler secret put OPENAI_API_KEY --env staging
   npx wrangler secret put ANTHROPIC_API_KEY --env staging
   npx wrangler secret put OPENROUTER_API_KEY --env staging
   ```
2. **Complete the 30-Story Human Editorial Benchmark on Staging**:
   - Execute the 30 real-world stories (20 Arabic + 10 English) documented in [`docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md#L145-L303) and verify:
     - **`0%`** hallucinated names, numbers, dates, or quotes (`0 / 30`).
     - **`0%`** unattributed major claims passing without `hasBlocker = true`.
     - **`>= 85%`** (`>= 26 / 30`) radio drafts usable on air (`20–40 seconds`) without a full rewrite.
     - **`< 5 minutes`** median turnaround time per story.
3. **Promote Track B (`develop`) to Production (`main` / `nr.nasfm.info`)**:
   - Once the 30-story scorecard is signed off by the human reviewer and authorized by the user, merge `develop` into `main`, set the provider secret(s) on `nas-newsroom`, and run `npx wrangler deploy`.
