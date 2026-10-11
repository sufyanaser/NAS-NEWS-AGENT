# NAS Newsroom — Final Multi-Agent Delivery & Verification Report

**Document Owner**: Agent 6 (`agent-6-integration-release` — Integration, Verification & Staging/Prod Release Manager)  
**Date**: 2026-10-11  
**Development Branch**: `develop`  
**Production Branch**: `main` (Untouched — awaiting explicit user authorization per `CLAUDE.md` Rules 5 & 8)  
**Staging Environment (Live)**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`  
**Active Staging Version ID**: `be027488-5cba-4cf7-8a58-bd799c209ed9`  
**Approved Production Target**: `https://nr.nasfm.info` (Not yet deployed — gated by explicit user authorization)

---

## 1. Executive Summary & Multi-Agent Execution Roster

The NAS Newsroom multi-agent engineering delivery across **Release A** (15-task Workstation UX Reorganization & Production Readiness for `https://nr.nasfm.info`) and **Release B** (Multi-Provider AI Layer, Arabic Editorial Pipeline, Red Team Security Hardening, and Live Cloudflare Staging Deployment) is **100% complete and verified**.

All work was executed under the strict file ownership matrix defined in [`docs/04-implementation/AI_Multi_Agent_Execution_Plan.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/AI_Multi_Agent_Execution_Plan.md) with zero merge conflicts and zero regressions to D1 schema invariants (`users`, `sessions`, `login_attempts`, `stories`, `story_events`, `settings`).

| Agent ID | Role | Delivered Scope & Owned Artifacts | Status |
|---|---|---|---|
| **Orchestrator** | Principal Engineering Orchestrator | Shared contracts ([`src/shared/contracts.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/shared/contracts.ts)), Worker bindings ([`src/server/env.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/env.ts)), API routing ([`src/worker.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/worker.ts)), settings & connection test endpoints ([`src/server/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/settings.ts)), and story AI extraction endpoint ([`src/server/stories.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/stories.ts)). | **COMPLETE** |
| **Agent 1** (`agent-1-ui-prod-readiness`) | UI/UX Finalizer & Production Release Engineer | Verification of all 15 UI/UX workstation tasks across all 5 screens and 5 viewports (`1920x1080`, `1440x900`, `1366x768`, `390x844`, `360x800`), read-only DNS/Zone/D1 inspection for `nr.nasfm.info`, and Release A Production Runbook ([`docs/04-implementation/Release_A_Production_Readiness.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/Release_A_Production_Readiness.md)). | **COMPLETE** |
| **Agent 2** (`agent-2-ai-providers`) | AI Provider & Model Architecture Engineer | Multi-provider abstraction ([`src/server/ai/types.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/types.ts), [`src/server/ai/catalog.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/catalog.ts), [`src/server/ai/registry.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/registry.ts)), adapters for Gemini, OpenAI, Anthropic, and OpenRouter (`src/server/ai/providers/*.ts`), cost calculator, timeout/error classification, and unit suite ([`test/ai-providers.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-providers.test.ts)). | **COMPLETE** |
| **Agent 3** (`agent-3-editorial-pipeline`) | Arabic Editorial AI Pipeline Engineer | Prompt-injection-resistant Arabic editorial prompts ([`src/server/ai/prompts.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/prompts.ts)), strict JSON output validator ([`src/server/ai/schema.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/schema.ts)), server-side `Number Superset Check` (Specs §8.1), deterministic `hasBlocker` computation (Specs §7.3) ([`src/server/ai/pipeline.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/pipeline.ts)), and unit suite ([`test/ai-pipeline.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-pipeline.test.ts)). | **COMPLETE** |
| **Agent 4** (`agent-4-ai-frontend`) | Frontend AI & Settings Integration Engineer | Client API integration ([`src/client/api.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/api.ts)), provider/model catalog & live connection tester in Settings ([`src/client/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/settings.ts)), AI generation bar, manual-edit overwrite confirmation, token/latency/warning badges, and graceful manual fallback in Review & Edit ([`src/client/review.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/review.ts), [`src/client/styles.css`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/styles.css)). | **COMPLETE** |
| **Agent 5** (`agent-5-security-redteam-qa`) | Security, Red Team & Editorial QA Lead | Red Team security & editorial scenario test suite covering `SC-01`, `SC-02`, `SC-03`, prompt injection, secret canary isolation, key-injection rejection, and CSRF/auth gates ([`test/ai-redteam.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-redteam.test.ts)), plus the 30-story pre-production evaluation protocol ([`docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md)). | **COMPLETE** |
| **Agent 6** (`agent-6-integration-release`) | Integration, Verification & Staging/Prod Release Manager | End-to-end Playwright AI & workstation tests ([`e2e/slice.spec.ts`](file:///h:/Projects/NAS-NEWS-AGENT/e2e/slice.spec.ts)), state sync fix in [`src/client/review.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/review.ts), full `npm run check` gate execution, Cloudflare Staging deployment (`nas-newsroom-staging`), live HTTP smoke testing, and this final delivery report. | **COMPLETE** |

---

## 2. Full Verification Gate Results (`npm run check`)

The complete quality gate (`npm run check`) passed with **exit code `0`**:

| Check Step | Command | Result | Details |
|---|---|---|---|
| **1. ESLint** | `npm run lint` | **PASS (`0` errors, `0` warnings)** | Strict TypeScript & browser/worker lint rules across `src/`, `test/`, `e2e/`, and `scripts/`. |
| **2. TypeScript Typecheck** | `npm run typecheck` | **PASS (`0` errors)** | `tsc -p tsconfig.json --noEmit` (Worker/Server) and `tsc -p tsconfig.client.json --noEmit` (Browser Client). |
| **3. Client Bundle Build** | `npm run build` | **PASS (`104.9 KB` minified)** | Zero runtime dependencies bundled into `dist/client/app.js` + static icons and `_headers`. |
| **4. Secret & Bundle Audit** | `npm run check:bundle` | **PASS (`33` files verified)** | `scripts/check-bundle.mjs` confirmed zero occurrences of `AI_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `SESSION_SIGNING_KEY`, `password_hash`, or `sk-`. |
| **5. Vitest Unit & Red Team Suite** | `npm test` | **PASS (`8` files, `93 / 93` tests)** | 100% green across auth, stories, import, workflow/archive, schema/secrets, AI providers, AI pipeline, and AI Red Team suites. |
| **6. Playwright E2E Suite** | `npm run test:e2e` | **PASS (`44 / 44` tests — Desktop & Mobile)** | 22 E2E test specifications executed across both `[desktop]` (`1280x800` + multi-viewport `1920x1080`, `1440x900`, `1366x768`) and `[mobile]` (`390x844`, `360x800`) projects. |

### 2.1 Vitest Test Suite Breakdown (`93 / 93` Passing)

| Test Suite File | Tests Passed | Core Coverage |
|---|---|---|
| [`test/auth.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/auth.test.ts) | `18 / 18` | PBKDF2 login, `HttpOnly; Secure; SameSite=Strict` host-only cookie, rate limiting (`429`), session expiry & server-side logout revocation. |
| [`test/stories.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/stories.test.ts) | `15 / 15` | Draft creation, autosave `PATCH`, field length guards (`100,000` source text cap), user isolation, and audit event logging. |
| [`test/import.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/import.test.ts) | `12 / 12` | SSRF blocking (`127.0.0.1`, metadata IPs, private CIDRs, non-HTTPS), redirect limits, byte cap (`2 MB`), and graceful manual fallback (`SC-02`). |
| [`test/workflow-and-archive.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/workflow-and-archive.test.ts) | `5 / 5` | 5-state transitions (`مسودة` → `قيد المراجعة` → `معتمد` → `منشور` / `مستبعد`), human check gates, blocker resolution check resets, and multi-format archive filtering. |
| [`test/schema-and-secrets.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/schema-and-secrets.test.ts) | `7 / 7` | Exact 6-table D1 schema invariant, foreign keys, indexes, canary secret isolation, and sanitized `500` error responses. |
| [`test/ai-providers.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-providers.test.ts) | `10 / 10` | Provider normalization, model resolution across Gemini/OpenAI/Anthropic/OpenRouter, cost calculation, HTTP error classification (`401`/`402`/`429`/`500`/timeout), and connection testing. |
| [`test/ai-pipeline.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-pipeline.test.ts) | `14 / 14` | Arabic prompt construction, XML tag breakout escaping, JSON schema validation, Eastern/Western Arabic numeral normalization, `Number Superset Check`, and `computeHasBlocker`. |
| [`test/ai-redteam.test.ts`](file:///h:/Projects/NAS-NEWS-AGENT/test/ai-redteam.test.ts) | `12 / 12` | `RT-01` through `RT-10`: secret canary leak checks, browser key-injection rejection (`400`), CSRF/Origin enforcement (`403`), prompt injection resistance, `SC-01`, `SC-02`, `SC-03`, manual edit overwrite protection, and provider failure safety. |

### 2.2 Playwright E2E Suite Breakdown (`44 / 44` Passing — `22` Desktop + `22` Mobile)

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

## 3. Cloudflare Staging Deployment & Live Smoke Test Results (Release B)

Release B was deployed to the isolated Cloudflare Staging environment via `npx wrangler deploy --env staging`:

- **Staging URL**: `https://nas-newsroom-staging.nasfm98-7.workers.dev`
- **Worker Name**: `nas-newsroom-staging`
- **Deployed Version ID**: `be027488-5cba-4cf7-8a58-bd799c209ed9`
- **Bundle Size**: `131.60 KiB` (`gzip: 26.52 KiB`), Worker Startup Time: `2 ms`
- **Staging D1 Database**: `nas-newsroom-staging-db` (`16f339cc-4038-44a5-a522-a933dc2ba07b`)
- **Production Isolation**: Production (`nr.nasfm.info`), public station site (`nasfm.info`), and the `main` branch were **not** touched.

### Live HTTP Smoke Test Matrix (`https://nas-newsroom-staging.nasfm98-7.workers.dev`)

| Step | Endpoint | HTTP Status | Live Response Summary | Verdict |
|---|---|---|---|---|
| **1. Login** | `POST /api/auth/login` | `200 OK` | `{"ok":true,"user":{"id":"bd472c2a-97eb-47d3-8aed-bfb62a37320f","email":"staging-editor@nasfm.info"}}` + `Set-Cookie: nas_session=<REDACTED>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` | **PASS** |
| **2. Get Settings** | `GET /api/settings` | `200 OK` | `{"stationName":"إذاعة ناس 98.7 FM","modelProvider":"OpenAI","modelName":"gpt-4.1","aiConfigured":false,"providersCount":4}` (Zero secret fields exposed) | **PASS** |
| **3. AI Catalog** | `GET /api/ai/catalog` | `200 OK` | Returns all 4 providers (`gemini`: 3 models, `openai`: 3 models, `anthropic`: 2 models, `openrouter`: 3 models) with `configured: false` and verified pricing metadata. | **PASS** |
| **4. Test Model** | `POST /api/settings/test-model` | `200 OK` | `{"ok":false,"provider":"gemini","model":"gemini-2.5-flash","configured":false,"connected":false,"latencyMs":0,"message":"مزود الذكاء الاصطناعي غير مهيأ على الخادم. يرجى ضبط مفتاح المزود في أسرار Cloudflare Worker.","errorClass":"not_configured"}` | **PASS** |
| **5. Story Extract (Unconfigured Fallback)** | `POST /api/stories/:id/extract` | `503 Service Unavailable` | `{"error":"not_configured","message":"مزود الذكاء الاصطناعي غير مهيأ على الخادم. يرجى ضبط مفتاح المزود في أسرار Cloudflare Worker."}` (Story draft preserved intact in D1) | **PASS** |
| **6. Logout & Replay Check** | `POST /api/auth/logout` → `GET /api/session` | `204 No Content` → `401 Unauthorized` | Session deleted in D1; replaying captured `nas_session` cookie immediately returns `401`. | **PASS** |

---

## 4. Verified Multi-Provider AI Model Catalog & Pricing Table

All model identifiers and pricing figures in [`src/server/ai/catalog.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/server/ai/catalog.ts) and [`src/client/settings.ts`](file:///h:/Projects/NAS-NEWS-AGENT/src/client/settings.ts) were verified as of `2026-10-11`:

| Provider (`AIProviderId`) | Secret Binding (`Env`) | Model ID | Display Label | Tier | Input / 1M Tokens (USD) | Output / 1M Tokens (USD) | Pricing & Quota Note | Recommended Newsroom Use |
|---|---|---|---|---|---|---|---|---|
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-flash` *(Default)* | Gemini 2.5 Flash (موصى به — متوازن وسريع) | **Free Tier** (`free`) | `$0.15` *(Paid tier)* | `$0.60` *(Paid tier)* | متاح ضمن الطبقة المجانية في Google AI Studio (مع حدود استخدام يومية) أو 0.15$ / 0.60$ لكل مليون توكن في الطبقة المدفوعة | الاستخراج التحريري اليومي والصياغة الإذاعية السريعة |
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite (اقتصادي فائق السرعة) | **Free Tier** (`free`) | `$0.075` *(Paid tier)* | `$0.30` *(Paid tier)* | متاح مجاناً في Google AI Studio ضمن حدود الاستخدام أو بتكلفة منخفضة جداً 0.075$ / 0.30$ لكل مليون توكن | الأخبار القصيرة والمعالجة السريعة منخفضة التكلفة |
| **`gemini`** (Google Gemini) | `GEMINI_API_KEY` *(or `AI_API_KEY`)* | `gemini-2.5-pro` | Gemini 2.5 Pro (تحليل معمق) | **Paid** (`paid`) | `$1.25` | `$10.00` | 1.25$ للمدخلات / 10.00$ للمخرجات لكل مليون توكن (وتتوفر حصة تجريبية محدودة في AI Studio) | التقارير المركبة والترجمة التحريرية الدقيقة من الإنجليزية |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4.1-mini` *(Default)* | GPT-4.1 Mini (سريع ومتوازن التكلفة) | **Paid** (`paid`) | `$0.40` | `$1.60` | مدفوع حسب الاستخدام: 0.40$ للمدخلات / 1.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية دائمة في OpenAI API) | الصياغة الإخبارية السريعة والالتزام الصارم بمخطط JSON |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4.1` | GPT-4.1 (دقة تحريرية عالية) | **Paid** (`paid`) | `$2.00` | `$8.00` | مدفوع حسب الاستخدام: 2.00$ للمدخلات / 8.00$ للمخرجات لكل مليون توكن | التحرير الإذاعي المتقدم ومطابقة الإسناد الصارمة |
| **`openai`** (OpenAI) | `OPENAI_API_KEY` *(or `AI_API_KEY`)* | `gpt-4o-mini` | GPT-4o Mini (اقتصادي) | **Paid** (`paid`) | `$0.15` | `$0.60` | مدفوع حسب الاستخدام: 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن | المعالجة الاقتصادية السريعة |
| **`anthropic`** (Anthropic Claude) | `ANTHROPIC_API_KEY` *(or `AI_API_KEY`)* | `claude-sonnet-4-20250514` *(Default)* | Claude Sonnet 4 (جودة لغوية عربية ممتازة) | **Paid** (`paid`) | `$3.00` | `$15.00` | مدفوع حسب الاستخدام: 3.00$ للمدخلات / 15.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية في Anthropic API) | الصياغة العربية الرصينة وتحليل المصادر الطويلة |
| **`anthropic`** (Anthropic Claude) | `ANTHROPIC_API_KEY` *(or `AI_API_KEY`)* | `claude-3-5-haiku-20241022` | Claude 3.5 Haiku (سريع واقتصادي) | **Paid** (`paid`) | `$0.80` | `$4.00` | مدفوع حسب الاستخدام: 0.80$ للمدخلات / 4.00$ للمخرجات لكل مليون توكن | الاستخراج السريع للمسودات اليومية |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `meta-llama/llama-3.3-70b-instruct:free` *(Default)* | Llama 3.3 70B Instruct (مجاني عبر OpenRouter) | **Free Tier** (`free`) | `$0.00` | `$0.00` | مجاني (0.00$) عبر OpenRouter مع حدود معدل طلبات (Rate Limits) تخضع لتوافر المزود | التجربة المجانية والتوليد الاحتياطي |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `google/gemini-2.0-flash-exp:free` | Gemini 2.0 Flash Exp (مجاني عبر OpenRouter) | **Free Tier** (`free`) | `$0.00` | `$0.00` | مجاني (0.00$) عبر OpenRouter ضمن حدود الاستخدام التجريبية | التوليد السريع المجاني عبر بوابة موحدة |
| **`openrouter`** (OpenRouter) | `OPENROUTER_API_KEY` *(or `AI_API_KEY`)* | `qwen/qwen-2.5-72b-instruct:free` | Qwen 2.5 72B Instruct (مجاني — داعم للعربية) | **Free Tier** (`free`) | `$0.00` | `$0.00` | مجاني (0.00$) عبر OpenRouter ضمن حدود الطلبات اليومية | المعالجة العربية متعددة الصيغ بدون تكلفة |

---

## 5. Production Readiness & Governance Status (`https://nr.nasfm.info`)

### 5.1 Release A — Manual Newsroom Workstation (`READY FOR PRODUCTION AUTHORIZATION`)
- **Status**: **100% Ready**. All 15 UI/UX tasks, fixed desktop shell geometry (`1920x1080`, `1440x900`, `1366x768`), mobile responsiveness (`390x844`, `360x800`), contextual copy/paste, smart local date, SSRF-safe import, autosave, human approval gates, and multi-format archive classification are verified.
- **Runbook**: Documented step-by-step in [`docs/04-implementation/Release_A_Production_Readiness.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/Release_A_Production_Readiness.md#L115-L197).
- **Governance Gate (`CLAUDE.md` Rules 5 & 8)**: Awaiting explicit user authorization to create the production D1 database (`nas-newsroom-db`), attach the Custom Domain `nr.nasfm.info`, merge `develop` into `main`, and run `npx wrangler deploy`.

### 5.2 Release B — Multi-Provider AI Newsroom (`LIVE ON STAGING — GATED BY 30-STORY EVALUATION FOR PROD`)
- **Status on Staging (`https://nas-newsroom-staging.nasfm98-7.workers.dev`)**: **Live & Verified** (Version `be027488-5cba-4cf7-8a58-bd799c209ed9`).
- **Enabling Live AI Generation on Staging**: Set one or more provider API keys as Worker secrets on `nas-newsroom-staging`:
  ```powershell
  npx wrangler secret put GEMINI_API_KEY --env staging
  # Optional additional providers:
  npx wrangler secret put OPENAI_API_KEY --env staging
  npx wrangler secret put ANTHROPIC_API_KEY --env staging
  npx wrangler secret put OPENROUTER_API_KEY --env staging
  ```
- **Pre-Production Gate before Enabling AI on `https://nr.nasfm.info`**:
  1. Configure the chosen provider secret on `nas-newsroom-staging`.
  2. Complete the **30-Story Real-World Editorial Benchmark** (20 Arabic + 10 English sources) documented in [`docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md`](file:///h:/Projects/NAS-NEWS-AGENT/docs/04-implementation/QA_RedTeam_and_30Story_Protocol.md#L145-L303) with:
     - `0%` hallucinated names, numbers, dates, or quotes.
     - `0%` unattributed major claims passing without `hasBlocker = true`.
     - `>= 85%` (`>= 26 / 30`) radio drafts usable on air (`20–40 seconds`) without a full rewrite.
  3. Obtain explicit user sign-off to enable AI provider secrets on Production (`nr.nasfm.info`).
