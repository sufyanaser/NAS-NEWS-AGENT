# NAS Newsroom — Technical Specifications v1.0

**الحالة:** مسودة مراجعة (بعد معالجة ملاحظات Red Team الداخلية)
**الإصدار:** 1.0
**التاريخ:** 11 أكتوبر 2026
**المرجع الملزم:** `NAS_Newsroom_Decision_Paper.md` (v1.0، معتمدة)، `NAS_Newsroom_Deployment_Decision_v1.0.md`، `NAS_Newsroom_Scenarios_v1.0.md`، `NAS_Newsroom_Wireframe_v0.2.md`، `prototype/index.html` (Baseline التفاعلي المعتمد)
**الحدود الملزمة لهذه الوثيقة:** MVP 1.0 فقط. لا توسيع نطاق. لا برمجة Frontend/Backend فعلية في هذه المرحلة. لا إنشاء موارد Cloudflare. لا تعديل DNS. لا نشر إنتاجي.

---

## 0. منهجية الاستخلاص

هذه الوثيقة تُرجمة مباشرة لثلاثة مصادر مثبتة فعلياً، دون أي توسيع:

1. **القواعد التحريرية والوظيفية** من `NAS_Newsroom_Decision_Paper.md` و`CLAUDE.md`.
2. **سلوك الحالات والانتقالات الفعلي** كما هو مُبرمج بالفعل داخل `prototype/index.html` (الدوال `bindNewStoryInputs`, `bindReviewEvents`, `updateNewStorySufficiency`, منطق `canApprove`) — هذا النموذج هو الواجهة المعتمدة، والمواصفات هنا تُثبّت نفس القواعد على مستوى الخادم، لا تخترع قواعد جديدة.
3. **قرارات الاستضافة** من `NAS_Newsroom_Deployment_Decision_v1.0.md` (Cloudflare إلزامي، القرار الخلفي مؤجل حتى هذه الوثيقة).

كل فقرة فيها علاقة مباشرة بسطر محدد في الوثائق أو الكود المصدر السابق للمواصفة.

---

## 1. Architecture Overview

### 1.1 القرار المعماري

**Single Cloudflare Worker واحد** يجمع:

- **Workers Static Assets** لتقديم الواجهة (ملفات HTML/CSS/JS الناتجة عن تطوير `prototype/index.html` إلى تطبيق فعلي)، عبر `assets.directory`.
- **Worker Script واحد** (`src/worker.ts`) يقدّم كل مسارات `/api/*` فقط. يُضبط التوجيه عبر:

```jsonc
// wrangler.jsonc (مرجعي فقط — لا يُنفَّذ أو يُنشر في هذه المرحلة)
{
  "name": "nas-newsroom",
  "compatibility_date": "2026-10-11",
  "main": "./src/worker.ts",
  "assets": {
    "directory": "./dist/client/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "nas-newsroom-db", "database_id": "<TBD-at-provision-time>" }
  ],
  "secrets": { "required": ["AI_API_KEY", "SESSION_SIGNING_KEY"] }
}
```

- ملفات ثابتة (`/`, `/app.js`, …) تُقدَّم مباشرة من `ASSETS` دون لمس الـWorker.
- أي طلب على `/api/*` يُشغَّل Worker أولاً (`run_worker_first`)، وهذا شرط إلزامي للمصادقة والتحقق قبل أي استجابة — بدون هذا الإعداد تُقدَّم الملفات الثابتة أولاً ويتعذر فرض الحماية (هذا تحديداً نوع الافتراض الذي يجب تثبيته وليس تخمينه؛ تم التحقق من سلوك `run_worker_first` من توثيق Cloudflare الرسمي الحالي قبل اعتماده هنا — انظر القسم 15.4 للافتراضات التي تحتاج تحققاً إضافياً عند التنفيذ الفعلي).

### 1.2 البدائل المستبعدة وسبب الاستبعاد

| البديل | سبب الاستبعاد |
|---|---|
| **Cloudflare Pages + Pages Functions** | يوصي Cloudflare حالياً (2026) بـWorkers Static Assets للمشاريع الجديدة؛ Pages لا يزال يعمل لكن التطوير المستقبلي ينصبّ على Workers. استخدام Pages اليوم يعني هجرة قسرية لاحقاً دون أي فائدة إضافية الآن. **مستبعد.** |
| **Worker + Pages منفصلين (Frontend/Backend كمشروعين)** | يضيف نشرَين منفصلين، إعداد CORS بين دومينين فرعيين، وتوقيتي Deploy يجب تزامنهما. لا حاجة له في MVP بمحرر واحد. **مستبعد لصالح Single Worker.** |
| **Durable Objects كطبقة حالة** | مصمَّمة لحالة لحظية متزامنة (WebSockets، Real-time collab). لا يوجد في MVP أي تزامن لحظي بين عدة مستخدمين (محرر واحد فقط). تضيف تعقيداً تشغيلياً غير مبرَّر. **مستبعد.** |
| **Hyperdrive + Postgres خارجي** | يفترض وجود قاعدة بيانات خارجية بالفعل ومُصمَّم لأحمال أكبر (١ تيرابايت فأكثر). D1 كافٍ تماماً لحجم بيانات محرر واحد. **مستبعد.** |
| **Cloudflare Browser Rendering (Headless Browser) لاستيراد الروابط** | يضيف كلفة وتعقيداً تشغيلياً كبيرين (تشغيل متصفح كامل) لحالة استخدام تنص ورقة القرار نفسها على أنها غير مضمونة النجاح أصلاً (فيسبوك والمواقع المحمية). `fetch()` بسيط + استخراج نص HTML كافٍ، مع قبول صريح بأن الاستيراد قد يفشل والانتقال للإدخال اليدوي (هذا هو السلوك المطلوب في SC-02، لا عيب يجب حله بأداة أثقل). **مستبعد.** |
| **Secrets Store binding (بدل Worker Secret عادي)** | مفيد لإدارة أسرار متعددة الفِرق أو دورة تدوير منتظمة. هنا مفتاح واحد (`AI_API_KEY`) يديره شخص واحد. `wrangler secret put` كافٍ، ولا يضيف منتجاً إضافياً دون حاجة فعلية في MVP. **مستبعد الآن، يُعاد النظر فيه إذا تعدد المزودون لاحقاً.** |
| **KV Namespace لتخزين الجلسات** | الجلسات والإعدادات بيانات علائقية صِرفة بحجم ضئيل؛ جدول `sessions` في D1 نفسه (الذي يُستخدم أصلاً) كافٍ، ويجنّب إضافة منتج تخزين ثانٍ لحالة استخدام واحدة. **مستبعد.** |

### 1.3 مخطط التدفق العام

```
المتصفح (محرر واحد)
   │  HTTPS فقط (nasfm.info أو subdomain — قرار معلّق، انظر 15.1)
   ▼
Cloudflare Edge (TLS, WAF أساسي, Rate Limiting)
   ▼
Cloudflare Worker (nas-newsroom)
   ├── /*         → ASSETS binding (ملفات الواجهة الثابتة)
   └── /api/*     → Worker Script
          ├── Auth Middleware (فحص Session Cookie عبر جدول sessions في D1)
          ├── Route Handlers (stories, import, extract, settings...)
          ├── D1 Binding (DB) — كل القراءة/الكتابة
          └── fetch() خارجي إلى:
                ├── مزود الموديل النصي (AI_API_KEY من Secret) — طلب واحد عبر الخادم فقط
                └── رابط المصدر الذي يدخله المحرر (باستيراد محكوم، انظر القسم 9)
```

---

## 2. Frontend Structure

الواجهة امتداد فعلي (برمجة حقيقية، لا HTML ثابت) لنفس خمس الشاشات المثبتة في `prototype/index.html`، بنفس أسماء الحالات والحقول لضمان تطابق سلوك النموذج المعتمد دون إعادة تصميم UX:

| الشاشة | المسار (Client-side route) | الاعتماد على API |
|---|---|---|
| تسجيل الدخول | `/login` | `POST /api/auth/login` |
| خبر جديد | `/stories/new` أو `/stories/:id/source` | `POST /api/stories`, `PATCH /api/stories/:id`, `POST /api/stories/:id/import` |
| المراجعة والتحرير | `/stories/:id` (steps: source/facts/draft/approval كحالة UI محلية فقط، مطابقة لـ`state.activeStep` في النموذج) | `POST /api/stories/:id/extract`, `PATCH`, `POST .../checks`, `POST .../resolve-blocker`, `POST .../approve`, `POST .../publish`, `POST .../exclude` |
| الأرشيف | `/archive` | `GET /api/stories?status=&q=` |
| الإعدادات | `/settings` | `GET/PUT /api/settings`, `POST /api/settings/test-model` |

### 2.1 قواعد Frontend الملزمة (مأخوذة حرفياً من الوايرفريم والنموذج)

- شريط الخطوات «المصدر ← الحقائق ← الصياغة ← مراجعة الاعتماد» **عنصر واجهة محلي فقط** (لا يُرسَل للخادم ولا يغيّر `status`)، تماماً كما في `state.activeStep` بالنموذج الحالي.
- زر «استخراج الحقائق» يبقى `disabled` إلا إذا: طول `sourceText.trim() >= 50` **و** `sourceName.trim()` غير فارغ — نفس شرط `updateNewStorySufficiency()` في النموذج حرفياً، ويُعاد فرضه في الخادم (القسم 11).
- زر «اعتماد» يبقى `disabled` إلا إذا: `hasSufficientSource && !hasBlocker && checksComplete` — نفس شرط `canApprove` في النموذج حرفياً، ويُعاد فرضه في الخادم (القسم 11) لأن تعطيل الزر في الواجهة وحده **لا يمنع** استدعاء مباشر لـ API (ثغرة Red Team، انظر 11.4).
- لا توجد صفحة Frontend منفصلة لكل Step — نفس الشاشة الواحدة (مطابقة لمبدأ "رحلة تحريرية واحدة" في الوايرفريم).
- RTL، واتجاه الحقول، وعدم تمديد الحقول القصيرة — كما هو موصوف حرفياً في `NAS_Newsroom_Wireframe_v0.2.md` §"استجابة الشاشة للأحجام".

---

## 3. Backend API Contracts

جميع المسارات تحت `/api/*`، JSON فقط (`Content-Type: application/json`)، وتتطلب Header مخصص `X-NAS-Client: 1` على كل طلب لا يكون GET (إجراء مضاد CSRF، انظر 12.3). الاستثناء: `POST /api/auth/login` لا يتطلب جلسة سابقة بالطبع.

### 3.1 Auth

| Method | Path | Body | Response | ملاحظات |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | `200 {ok:true, user:{id,email}}` / `401 {error:"invalid_credentials"}` | Rate-limited (القسم 12.4) |
| POST | `/api/auth/logout` | — | `204` | يحذف صف الجلسة فعلياً من D1 (ليس فقط الكوكي) |
| GET | `/api/session` | — | `200 {user}` / `401` | للتحقق عند تحميل التطبيق |

### 3.2 Stories

| Method | Path | ملاحظات |
|---|---|---|
| GET | `/api/stories?status=&q=&limit=&cursor=` | للأرشيف؛ بحث نصي بسيط على `headline, source_name, source_text` |
| POST | `/api/stories` | ينشئ خبراً بحالة `مسودة`، يعيد `id` فوراً (قبل أي إدخال، لضمان Draft Persistence من أول لحظة — القسم 10) |
| GET | `/api/stories/:id` | التفاصيل الكاملة بما فيها `facts`, `formats`, `checks`, `events` الأخيرة |
| PATCH | `/api/stories/:id` | تحديث جزئي لحقول المصدر/العنوان/نص الصيغة؛ **Autosave** من الواجهة بعد Debounce قصير + زر "حفظ" صريح |
| DELETE | `/api/stories/:id` | **غير متاح في MVP** — يطابق قاعدة "لا يوجد حذف دائم" في الوايرفريم؛ البديل الوحيد هو `exclude` |

### 3.3 Import & AI Pipeline

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/stories/:id/import` | `{url}` | `200 {ok:true, sourceText, importMessage}` أو `200 {ok:false, failureClass, importMessage}` — **لا يُعيد 4xx/5xx لفشل الاستيراد العادي**، لأن فشل القراءة حالة متوقعة ضمن تدفق SC-02، وليست خطأ خادم (القسم 9) |
| POST | `/api/stories/:id/extract` | — (يستخدم `source_text`/`source_name`/`source_lang` المحفوظة مسبقاً في D1) | `200 {facts, headline, formats, hasBlocker, blockerReason}` أو `502 {error:"model_failed", retryable:true}` — **لا تُفقد أي بيانات مصدر عند الفشل** (القسم 10) |

### 3.4 Review Actions

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/stories/:id/checks` | `{factsVerified?, attributionVerified?}` | `200 {checks}` |
| POST | `/api/stories/:id/resolve-blocker` | `{resolutionNote}` (إلزامي، غير فارغ) | `200 {hasBlocker:false}`؛ **يُعيد `checksVerified` إلى false** (القسم 11.5) |
| POST | `/api/stories/:id/approve` | — | `200 {status:"معتمد"}` أو `422 {error:"approval_blocked", reasons:[...]}` |
| POST | `/api/stories/:id/publish` | — | `200 {status:"منشور"}` أو `409` إذا لم تكن الحالة `معتمد` |
| POST | `/api/stories/:id/exclude` | `{reason}` (إلزامي) | `200 {status:"مستبعد"}` |

### 3.5 Settings

| Method | Path | Body | ملاحظات |
|---|---|---|---|
| GET | `/api/settings` | — | **لا يُعيد `AI_API_KEY` مطلقاً** — لا كحقل فعلي ولا مقنَّع جزئياً؛ السر غير متاح عبر API بالكامل |
| PUT | `/api/settings` | `{stationName, editorialStyle, radioLength, modelProvider, modelName}` | لا يحتوي الجسم على مفتاح API؛ المفتاح يُضبط فقط عبر `wrangler secret put` من بيئة النشر، خارج التطبيق تماماً |
| POST | `/api/settings/test-model` | — | طلب فعلي صغير للمزود (Ping)، Rate-limited بشدة (3 طلبات/دقيقة) لمنع استنزاف الكلفة |

### 3.6 رموز الأخطاء الموحدة

| Code | الاستخدام |
|---|---|
| `400 invalid_input` | تحقق Schema فاشل |
| `401 unauthenticated` | لا جلسة صالحة |
| `403 forbidden` | طلب كتابة بلا Header المطلوب (CSRF) |
| `404 not_found` | خبر غير موجود |
| `409 invalid_transition` | انتقال حالة غير مسموح (القسم 6.2) |
| `422 approval_blocked` | شروط الاعتماد غير مستوفاة |
| `429 rate_limited` | تجاوز حد الاستهلاك |
| `502 model_failed` | فشل مزود الموديل أو استجابة غير صالحة |
| `502 import_failed` | (داخلي فقط، لا يُرسَل كـHTTP status — الاستيراد يُعاد كـ200 دائماً كما في 3.3) |

---

## 4. Database Schema

**D1 (SQLite)** — قاعدة واحدة، بدون جداول صلاحيات متعددة (مستخدم واحد فقط في MVP، مطابقةً لقرار النطاق).

```sql
-- المستخدم الوحيد (المحرر). لا جدول أدوار/صلاحيات.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- PBKDF2-SHA256 (القسم 5.2)
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- جلسات دخول قابلة للإلغاء الفوري (logout حقيقي، لا كوكي ذاتي التحقق فقط)
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,   -- SHA-256 لقيمة الكوكي، لا تُخزَّن القيمة الخام
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,      -- Idle expiry منزلق + حد أقصى مطلق (القسم 5.3)
  ip_hash       TEXT,               -- SHA-256(IP) لتدقيق أمني لاحق، لا عنوان IP خام
  user_agent    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- الخبر — جوهر النظام
CREATE TABLE stories (
  id                       TEXT PRIMARY KEY,
  status                   TEXT NOT NULL DEFAULT 'مسودة'
                             CHECK (status IN ('مسودة','قيد المراجعة','معتمد','منشور','مستبعد')),
  source_url               TEXT,
  source_name              TEXT,
  publish_date             TEXT,
  category                 TEXT,
  source_lang              TEXT,
  source_text              TEXT NOT NULL DEFAULT '',
  import_failed            INTEGER NOT NULL DEFAULT 0,
  import_message           TEXT,
  has_blocker              INTEGER NOT NULL DEFAULT 0,
  blocker_reason           TEXT,
  headline                 TEXT,
  urgent_enabled            INTEGER NOT NULL DEFAULT 0,
  formats_json             TEXT,   -- {radio, web, facebook, urgent}
  facts_json                TEXT,   -- [{label, value, status, type}]
  checks_facts_verified     INTEGER NOT NULL DEFAULT 0,
  checks_attribution_verified INTEGER NOT NULL DEFAULT 0,
  exclude_reason            TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at               TEXT,
  published_at              TEXT
);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_updated ON stories(updated_at DESC);

-- سجل تدقيق شامل: كل حفظ، كل استدعاء موديل (ناجح أو فاشل)، كل انتقال حالة
CREATE TABLE story_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id   TEXT NOT NULL REFERENCES stories(id),
  event_type TEXT NOT NULL,  -- 'draft_saved' | 'import_attempted' | 'extract_succeeded' |
                              -- 'extract_failed' | 'check_updated' | 'blocker_resolved' |
                              -- 'approved' | 'published' | 'excluded'
  detail     TEXT,           -- JSON مرن بحسب النوع (مثلاً سبب الفشل، أو نص resolutionNote)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_story ON story_events(story_id, created_at);

-- إعدادات المنصة — صف واحد ثابت
CREATE TABLE settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  station_name    TEXT NOT NULL DEFAULT 'NAS FM — إذاعة ناس',
  editorial_style TEXT NOT NULL DEFAULT 'فصحى إخبارية إذاعية مبسطة',
  radio_length    TEXT NOT NULL DEFAULT '20-40',
  model_provider  TEXT NOT NULL DEFAULT 'OpenAI',
  model_name      TEXT NOT NULL DEFAULT 'gpt-4.1',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (id) VALUES (1);
```

### 4.1 ملاحظة تصميمية: JSON columns بدل جداول علائقية للحقائق/الصيغ

`facts` و`formats` مخزَّنة كـ`TEXT` JSON داخل صف الخبر نفسه، لا كجداول فرعية. السبب: معايير القبول في ورقة القرار تتحقق من مستوى الخبر الواحد (لا اختلاق، ربط بمصدر واحد)، ولا توجد حاجة MVP لاستعلامات علائقية عبر الحقائق (بحث داخل حقل واحد). إضافة جدول `facts` منفصل الآن = تعقيد غير ضروري وفق قاعدة "لا تضف خدمات غير ضرورية" في طلب المهمة نفسها. إن ظهرت حاجة لاحقاً لتحليلات على مستوى الحقيقة الفردية، الترحيل من JSON إلى جدول علائقي بسيط حينها (D1 يدعم SQLite JSON1 functions للاستعلام داخل الحقل حتى بصيغته الحالية إن لزم).

### 4.2 Data Location

D1 لا يدعم حالياً Location Hint مخصصاً للشرق الأوسط (`me` غير مدعوم فعلياً لـD1 — فقط Durable Objects). أقرب Hint متاح هو `weur` (أوروبا الغربية) أو `eeur` (أوروبا الشرقية). **قرار مبدئي: `eeur`**، على أن يُقاس Latency الفعلي من بغداد/الرمادي عند التزويد الفعلي ويُعدَّل عند الحاجة (Hint هو Best-effort لا ضمان، هذا افتراض يحتاج تحققاً فعلياً — القسم 15.4).

---

## 5. Authentication & Session

### 5.1 نطاق المصادقة

مستخدم واحد فقط (`users` بصف واحد). لا تسجيل حسابات جديدة عبر الواجهة؛ إنشاء المستخدم الأول يتم عبر Migration/Seed يدوي عند النشر (ليس عبر API — لا يوجد `POST /api/users`).

### 5.2 تجزئة كلمة المرور

PBKDF2-SHA256 عبر Web Crypto API الأصلي في Workers (`crypto.subtle.deriveBits`) — **لا مكتبة خارجية**، لأن bcrypt/argon2 الحقيقي يتطلب WASM إضافياً دون ضرورة لحجم مستخدم واحد:

- Salt: 16 بايت عشوائي لكل مستخدم (`crypto.getRandomValues`).
- التكرارات: 310,000 (موصى به من OWASP لـPBKDF2-SHA256 حتى 2026).
- التخزين: `password_hash` (Base64) + `password_salt` (Base64) منفصلين.

### 5.3 الجلسة

- عند تسجيل الدخول: إنشاء Token عشوائي 32 بايت، تخزين `SHA-256(token)` فقط في `sessions.token_hash`، إرسال Token الخام كـCookie:
  `Set-Cookie: nas_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`
- **Idle expiry:** 12 ساعة تُحدَّث (`last_seen_at`) مع كل طلب API ناجح.
- **Absolute expiry:** 7 أيام من `created_at` بلا استثناء، حتى مع نشاط متواصل (يفرض إعادة دخول دورية).
- **Logout حقيقي:** حذف صف `sessions` فعلياً (ليس فقط مسح الكوكي من المتصفح) — هذا يسد ثغرة إعادة استخدام Token مسروق بعد تسجيل الخروج الظاهري.
- محاولة دخول فاشلة متكررة: Rate-limited (القسم 12.4)، ولا تُكشف أي معلومة تفرّق بين "بريد غير موجود" و"كلمة مرور خاطئة" في رسالة الخطأ.

### 5.4 لماذا ليس JWT عديم الحالة (Stateless)

JWT عديم الحالة لا يمكن إلغاؤه فوراً (Logout لا يُسقط التوكن قبل انتهاء صلاحيته إلا بقائمة إلغاء إضافية — ما يعيدنا لنفس تعقيد جدول `sessions`). بوجود D1 أصلاً للتطبيق، تخزين الجلسة فيه أبسط من إدارة توقيع/تحقق JWT + قائمة إلغاء منفصلة.

---

## 6. News Editorial Workflow

### 6.1 الفرق بين "الخطوة" و"الحالة" (ملزم من الوايرفريم، مطبَّق فعلياً في النموذج)

- **الخطوة** (`source|facts|draft|approval`): موضع واجهة محلي فقط، لا يُخزَّن في الخادم، ولا يُغيّر `status`.
- **الحالة** (`status` في جدول `stories`): `مسودة → قيد المراجعة → معتمد → منشور`، بالإضافة لـ`مستبعد` كمخرج جانبي.

### 6.2 مصفوفة الانتقالات المسموحة (معالجة ثغرة Red Team §15.2)

النموذج الحالي (`prototype/index.html`) لا يفرض مصفوفة انتقال صريحة؛ المواصفة هنا تثبّتها على مستوى الخادم:

| من | إلى | الشرط |
|---|---|---|
| `مسودة` | `قيد المراجعة` | نجاح `extract` (مادة كافية) |
| `قيد المراجعة` | `معتمد` | شروط الاعتماد الكاملة (القسم 11) |
| `معتمد` | `منشور` | إجراء "تسجيل كمنشور" الصريح فقط |
| `مسودة` \| `قيد المراجعة` | `مستبعد` | سبب غير فارغ |
| أي حالة أخرى | أي حالة أخرى | **مرفوض — `409 invalid_transition`** |

ممنوع صراحةً: الرجوع من `منشور` أو `معتمد` إلى حالة أدنى عبر API (لا يوجد Endpoint "إلغاء اعتماد" في MVP — إن احتاج المحرر تصحيحاً بعد الاعتماد، يُسجَّل ذلك يدوياً خارج النظام في هذه النسخة؛ أي حاجة لـ"سحب الاعتماد" تُسجَّل في قائمة لاحقة ولا تدخل الآن في النطاق).

### 6.3 مسار العمل الكامل (من ورقة القرار، حرفياً)

اكتشاف → توثيق المصدر → إدخال → استخراج الحقائق → صياغة → مراجعة بشرية → اعتماد → نشر يدوي (خارج النظام) → تسجيل حالة "منشور" → أرشفة.

---

## 7. AI Processing Pipeline

### 7.1 مبدأ التصميم: استدعاء واحد مُركَّب بدل وكلاء متعددين

ورقة القرار تحدد ثلاث مهام ثابتة (استخراج الحقائق، كشف النواقص/الادعاءات غير المؤكدة، إنتاج الصيغ) عبر **موديل نصي واحد**. تنفيذ ذلك كثلاثة استدعاءات API متتالية يضاعف الكلفة والـLatency ويعقّد التعامل مع فشل جزئي (ماذا لو نجحت المهمة 1 وفشلت 2؟). **القرار: استدعاء واحد مُركَّب** بقالب Prompt ثابت يطلب من الموديل تنفيذ الثلاث مهام معاً ويُعيد نتيجة JSON واحدة منظَّمة (القسم 8)، مع التزام الـPrompt نفسه بالقواعد التحريرية الملزمة حرفياً (لا إضافة معلومة، لا تحويل تصريح إلى حقيقة أوسع، تمييز "غير مذكور في المصدر").

### 7.2 تسلسل التنفيذ (Server-side فقط)

```
1. العميل يستدعي POST /api/stories/:id/extract (بدون Body — المادة محفوظة أصلاً في D1)
2. الخادم:
   a. يقرأ story من D1 (source_text, source_name, source_lang, category)
   b. يتحقق: source_text.trim().length >= 50 AND source_name.trim() != ''
      → غير ذلك: 400 invalid_input (لا يصل الطلب إلى الموديل أصلاً)
   c. يتحقق من حد الطول الأقصى: source_text.length <= 20000 حرفاً
      → تجاوز: 400 invalid_input برسالة "المادة طويلة جداً، يرجى تلخيصها أو تقسيمها"
      (رفض صريح لا تقصير صامت — التقصير الصامت قد يُسقط معلومة جوهرية ويخالف قاعدة عدم الاختلاق بالحذف)
   d. يبني Prompt ثابت (Template محفوظ في كود الخادم، لا في الواجهة) + Structured Output Schema (القسم 8)
   e. استدعاء مزود الموديل (Timeout: 25 ثانية)
   f. التحقق من صحة الاستجابة مقابل Schema بدقة (Zod أو ما يعادله)
      → فشل التحقق أو Timeout أو خطأ شبكة: 502 model_failed، يُسجَّل story_events('extract_failed')،
        **لا تغيير على status أو أي حقل آخر** — المسودة والمدخلات سليمة 100%
   g. إعادة حساب hasBlocker من القيم الفرعية (القسم 7.3) — لا تُعتمَد قيمة الموديل الذاتية كما هي
   h. كتابة واحدة Atomic إلى D1: facts_json, formats_json, headline, has_blocker, blocker_reason,
      status='قيد المراجعة', updated_at + story_events('extract_succeeded')
   i. 200 OK بالنتيجة الكاملة
```

### 7.3 معالجة Red Team: لا تعتمد على تقييم الموديل الذاتي لنفسه

النموذج التفاعلي والوثائق تفترض أن الموديل "يصيغ ولا يعتمد"، لكن كشف "الادعاء غير المسند" نفسه ناتج من الموديل. **إن وثقنا بإعلان الموديل عن نفسه حصراً فقط، فإي ادعاء يُفوّت تصنيفه من الموديل يمرّ دون مانع.** الحل: الخادم يُعيد حساب `hasBlocker` من قيم فرعية بنيوية (OR منطقي)، لا من حقل Boolean حر يُعيده الموديل:

```
hasBlocker = (
  أي عنصر في facts له type == 'review-req'
  OR
  أي عنصر في attribution_flags له confidence == 'unattributed'
  OR
  model_self_assessment.has_unattributed_major_claim == true
)
```

أي توقيع "لا يوجد مانع" من الموديل نفسه **لا يُعتمَد وحده** — يجب أن تكون كل الحقول الفرعية متسقة معه فعلياً. هذا تحقق بنيوي بسيط (منطق Boolean في كود الخادم)، لا تحقق صحة خارجي (يبقى خارج نطاق MVP كما تنص ورقة القرار).

### 7.4 قابلية تبديل المزوّد

```ts
interface AIProvider {
  generate(input: { prompt: string; schema: JSONSchema }): Promise<{ raw: unknown; latencyMs: number }>;
}
```

تنفيذ واحد فقط في MVP (`OpenAIChatProvider` عبر Chat Completions API مع `response_format: json_schema`)، يُختار عبر `settings.model_provider` + `settings.model_name` (نصوص حرة محفوظة في D1، لا منطق Switch معقد). المفتاح نفسه ثابت كـSecret واحد (`AI_API_KEY`) بغض النظر عن المزوّد الحالي — كافٍ لأن الإعدادات تخزّن مزوّداً واحداً فعّالاً في كل لحظة (مطابق لقرار "موديل نصي واحد" في ورقة القرار؛ لا حاجة لتخزين عدة مفاتيح الآن).

---

## 8. Structured AI Output Schema

```json
{
  "type": "object",
  "required": ["headline", "facts", "attribution_flags", "formats", "model_self_assessment"],
  "properties": {
    "headline": { "type": "string", "maxLength": 120 },
    "facts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["label", "value", "status", "type"],
        "properties": {
          "label": { "type": "string" },
          "value": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["وارد في المصدر", "غير مذكور في المصدر", "المتحدث غير محدد — مراجعة إلزامية"]
          },
          "type": { "type": "string", "enum": ["sourced", "missing", "review-req"] }
        }
      }
    },
    "attribution_flags": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["claim", "confidence"],
        "properties": {
          "claim": { "type": "string" },
          "attributed_to": { "type": ["string", "null"] },
          "confidence": { "type": "string", "enum": ["official", "attributed", "unattributed"] }
        }
      }
    },
    "formats": {
      "type": "object",
      "required": ["radio", "web", "facebook"],
      "properties": {
        "radio": { "type": "string" },
        "web": { "type": "string" },
        "facebook": { "type": "string" },
        "urgent": { "type": ["string", "null"] }
      }
    },
    "model_self_assessment": {
      "type": "object",
      "required": ["has_unattributed_major_claim", "notes"],
      "properties": {
        "has_unattributed_major_claim": { "type": "boolean" },
        "notes": { "type": "string" }
      }
    }
  }
}
```

### 8.1 قاعدة سلامة إضافية: تحقق الأرقام غير المُفقِد (Non-blocking)

قاعدة تحريرية ملزمة: "لا يضيف النظام معلومة غير موجودة في المصدر"، وينطبق هذا بشدة إضافية عند الترجمة من الإنجليزية (SC-03). يُنفَّذ تحقق آلي خفيف بعد استلام الاستجابة: استخراج كل الأرقام (Regex على الأرقام العربية/الإنجليزية) من `source_text` ومن `formats.radio`، والتأكد أن كل رقم ظهر في الصياغة موجود أصلاً في المصدر (Superset check باتجاه واحد: أرقام الصياغة ⊆ أرقام المصدر). عدم التطابق **لا يحجب التوليد** (قد يكون رقماً مُقرَّباً بالكلمات "مئة وعشرون" مقابل "120" وهذا سليم)، لكن يُضاف تنبيه UI غير مانع: "راجع الأرقام مقابل المصدر" — طبقة أمان إضافية تتجاوز الاعتماد الكامل على سلوك الموديل وحده.

---

## 9. Source Import Failure Handling

### 9.1 تصنيف الفشل (Failure Classes)

| الفئة | السبب | الرسالة المعروضة (غير تقنية) |
|---|---|---|
| `network_error` | DNS/Timeout/اتصال مرفوض | "تعذّر الوصول إلى الرابط. تحقق من الرابط أو تابع بلصق النص يدوياً." |
| `blocked` | `403`/`429`/Redirect لصفحة تسجيل دخول/Consent Wall | "هذا المصدر يمنع القراءة الآلية (مثل فيسبوك أو المواقع المحمية). يرجى لصق النص الأصلي يدوياً." |
| `unsupported_content` | `Content-Type` ليس `text/html`، أو حجم الاستجابة > 2MB | "تعذّرت قراءة محتوى هذا الرابط آلياً. يرجى لصق النص الأصلي يدوياً." |
| `insufficient_extract` | النص المستخرَج بعد إزالة HTML < 50 حرفاً | "المادة المستخرَجة غير كافية للتحرير. يرجى لصق النص الأصلي يدوياً." |

جميعها تُعيد نفس شكل الاستجابة (القسم 3.3): `200 {ok:false, failureClass, importMessage}`، **والرابط يبقى محفوظاً في `source_url`** (لا حذف)، مطابقةً حرفياً لـSC-02.

### 9.2 ضوابط أمان الاستيراد (معالجة ثغرة Red Team: SSRF)

النظام يُجري `fetch()` من الخادم إلى رابط يُدخله المحرر بثقة — هذا سطح هجوم SSRF كلاسيكي (رابط داخلي يستهدف شبكة Cloudflare الداخلية أو عناوين محلية). **ضوابط ملزمة قبل أي `fetch`:**

1. البروتوكول `https:` فقط (رفض `http:`, `file:`, `ftp:`, إلخ).
2. رفض Hostnames: `localhost`, أي عنوان في مدى `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (يشمل `169.254.169.254` — Metadata endpoints شائعة الاستغلال)، و`*.internal`.
3. حد زمني صارم: `AbortController` بعد 8 ثوانٍ.
4. حد حجم الاستجابة: قراءة الـStream بحد أقصى 2MB، مع إيقاف القراءة فوراً عند التجاوز (لا تحميل كامل الملف قبل الفحص).
5. أقصى 3 تحويلات (Redirects)، وكل تحويل يُعاد فحصه بنفس القواعد أعلاه (رابط ظاهره آمن قد يُحوِّل لعنوان داخلي).
6. استخراج النص: إزالة `<script>`/`<style>`، أخذ محتوى نصي من `<article>` أو `<body>` (مكتبة استخراج خفيفة متوافقة مع Workers runtime — لا Headless Browser، القسم 1.2).

---

## 10. Draft Persistence & Recovery

### 10.1 القاعدة الذهبية

**لا فقدان عمل أبداً نتيجة فشل الموديل أو الشبكة.** يُطبَّق هذا عبر فصل زمني صريح بين "حفظ الإدخال" و"استدعاء الموديل":

1. أي تغيير في حقول المصدر/النص يُحفَظ عبر `PATCH /api/stories/:id` **قبل** الضغط على "استخراج الحقائق" (Autosave بـDebounce 1.5 ثانية من توقف الكتابة، + زر "حفظ مسودة" صريح يعطي تأكيداً فورياً).
2. `POST .../extract` **يقرأ من D1 ما سُحفظ فعلاً فقط** — لا يعتمد على حالة مؤقتة في المتصفح لم تُحفَظ. إذا أُغلق المتصفح بعد الحفظ وقبل الاستخراج، البيانات سليمة بالكامل عند العودة.
3. فشل الموديل (502) **لا يكتب أي شيء** في `stories` سوى سجل `story_events` — صف الخبر نفسه لا يتغيّر، والمحرر يرى "تعذّر التوليد، حاول مرة أخرى" مع بقاء كل حقوله كما كانت.
4. إعادة المحاولة بعد فشل = نفس الطلب `POST .../extract` مجدداً، بلا حاجة لإعادة إدخال أي شيء.

### 10.2 حالة الحفظ المعروضة (مطابقة حرفياً للوايرفريم)

ثلاث حالات فقط: `جارٍ الحفظ` → `محفوظ` → `تعذّر الحفظ`. فشل `PATCH` (شبكة أو خادم) يُبقي القيم في حقول الإدخال كما كتبها المحرر (حالة محلية في الواجهة لم تُفقَد)، ويعرض "تعذّر الحفظ" مع إمكانية إعادة المحاولة اليدوية أو التلقائية بعد فترة قصيرة.

---

## 11. Human Approval Rules

### 11.1 الشروط الكاملة (مطابقة لمنطق `canApprove` في النموذج + تشديد Red Team)

الاعتماد (`POST /api/stories/:id/approve`) يُقبَل **فقط** إذا تحققت الشروط الخمسة معاً:

1. `source_text.trim().length >= 50`
2. `has_blocker == false`
3. `checks_facts_verified == true`
4. `checks_attribution_verified == true`
5. `status` الحالية هي `قيد المراجعة` (لا `مسودة` — يجب المرور بـ`extract` أولاً؛ ولا `معتمد`/`منشور`/`مستبعد` — مطابقةً لمصفوفة الانتقال §6.2)

تخلّف أي شرط → `422 {error:"approval_blocked", reasons:[...]}` تُسرد فيها الأسباب الفعلية (لا رسالة عامة)، لتمكين الواجهة من توجيه المحرر بدقة.

### 11.2 الإنفاذ المزدوج (Defense in Depth)

الواجهة تُعطّل زر الاعتماد شكلياً (مطابقةً للنموذج الحالي)، **لكن هذا للتجربة فقط**. الإنفاذ الحقيقي الملزم أمنياً وتحريرياً هو في معالج `POST .../approve` على الخادم، الذي يُعيد فحص الشروط الخمسة من جديد بقراءة مباشرة من D1 (لا من أي قيمة يُرسلها العميل في الطلب) — هذا يسد تحديداً الثغرة التي رصدها Red Team: **تعطيل زر في JavaScript لا يمنع طلب HTTP مباشر لنفس Endpoint.**

### 11.3 أثر حل المانع التحريري (Resolve Blocker) على حالة المراجعة

عند استخدام `POST .../resolve-blocker`: `has_blocker` يُصبح `false`، **لكن** `checks_facts_verified` و`checks_attribution_verified` يُعادان تلقائياً إلى `false`. السبب: حل المانع يعني تعديلاً جوهرياً في المحتوى (مثلاً حذف تصريح غير مسند)، فمراجعة المحرر السابقة ما قبل هذا التعديل لا تُغطّي النسخة الجديدة — يجب تأكيد المراجعة من جديد قبل الاعتماد. هذا تشديد لم يكن صريحاً في النموذج التفاعلي (الذي يسمح بالاعتماد المباشر بعد `resolveBlocker` دون إعادة تفعيل Checkboxes) ويُصحَّح هنا كمتطلب خادم.

### 11.4 استبعاد (Exclude) لا يحذف شيئاً

`POST .../exclude` يتطلب `reason` غير فارغ، ويُبقي `source_text`, `facts_json`, `formats_json`, و`story_events` كاملة — فقط `status` يتغيّر. هذا يحقق "لا حذف دائم" حرفياً.

---

## 12. Security & Privacy Baseline

### 12.1 النقل

HTTPS فقط، مفروض من Cloudflare Edge (HSTS header: `Strict-Transport-Security: max-age=31536000`). لا استثناء HTTP حتى للتحويل.

### 12.2 الجلسة والكوكي

`HttpOnly; Secure; SameSite=Strict` (القسم 5.3) — يمنع قراءة الكوكي من JavaScript (XSS mitigation) ويمنع إرساله في طلبات Cross-Site (CSRF mitigation الأساسي).

### 12.3 CSRF (طبقة ثانية فوق SameSite)

كل طلب غير-GET يتطلب Header `X-NAS-Client: 1`. طلب Cross-Site بسيط (مثل `<form>` من موقع خارجي) لا يمكنه إضافة Header مخصص دون CORS Preflight، والخادم لا يُفعِّل CORS لأي Origin خارجي أصلاً (`Access-Control-Allow-Origin` غير مضبوط إطلاقاً — التطبيق أحادي-Origin بالكامل بفضل بنية Single Worker في القسم 1).

### 12.4 Rate Limiting (Cloudflare `ratelimit` binding — GA)

| Endpoint | الحد | السبب |
|---|---|---|
| `POST /api/auth/login` | 5 طلبات / دقيقة لكل IP | منع Brute-force |
| `POST /api/stories/:id/extract` | 10 طلبات / دقيقة لكل جلسة | منع استنزاف كلفة الموديل عند تسرب جلسة أو استدعاء آلي خاطئ |
| `POST /api/stories/:id/import` | 20 طلبة / دقيقة لكل جلسة | منع استخدام الخادم كـProxy لجلب عشوائي (SSRF abuse secondary control) |
| `POST /api/settings/test-model` | 3 طلبات / دقيقة | هذا الـEndpoint يستدعي المزوّد فعلياً بكلفة حقيقية |

### 12.5 مفاتيح API

`AI_API_KEY` كـWorker Secret فقط (`wrangler secret put`)؛ **لا يظهر في**: كود الواجهة، استجابات `/api/settings`، سجلات `story_events`، أو أي Log عام. يُستخدَم فقط داخل معالج `extract` و`test-model` عبر `env.AI_API_KEY`.

### 12.6 الخصوصية

لا يُرسَل للمزوّد سوى الحد الأدنى: `source_text`, `source_lang`, `category`, وقالب التعليمات الثابت. لا يُرسَل بريد المحرر أو أي بيانات جلسة. يجب توثيق سياسة احتفاظ بيانات المزوّد المختار (OpenAI أو غيره) في `docs/01-foundation/` **قبل** أي تشغيل فعلي خارج هذه المرحلة — هذا شرط من ورقة القرار نفسها ولم يُحسَم بعد (قرار معلّق، القسم 15.3).

### 12.7 Headers أمان إضافية (خفيفة، بلا كلفة)

`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` تقييدي (`default-src 'self'`، بلا Inline scripts غير محسوبة إن أمكن).

---

## 13. Error Handling

### 13.1 مبدأ موحَّد

كل خطأ متوقَّع (استيراد فاشل، موديل فاشل، مانع تحريري، انتقال حالة غير صالح) يُعالَج كحالة عمل طبيعية بر سالة غير تقنية، لا كـException يُسرِّب تفاصيل داخلية. الاستثناءات غير المتوقَّعة (Bug في الكود) تُسجَّل كاملة في Workers Logs (عبر `console.error` + Cloudflare Observability) وتُعاد للعميل برسالة عامة فقط: `{"error":"internal_error"}` دون Stack Trace.

### 13.2 مطابقة الحالات مع الوايرفريم حرفياً

جميع حالات الواجهة المذكورة في `NAS_Newsroom_Wireframe_v0.2.md` §"حالات الواجهة الضرورية" (تحميل المصدر، تعذر قراءة الرابط، مادة غير كافية، استخراج ناجح، فشل الموديل مع إعادة المحاولة، مسودة محفوظة، مانع تحريري يمنع الاعتماد، معتمد، منشور) لها مقابل مباشر وواضح في استجابات API أعلاه — لا حالة واجهة بلا غطاء Backend مقابل.

---

## 14. Acceptance Criteria

مطابقة مباشرة لـ"معايير القبول قبل الإطلاق" في ورقة القرار + تشديدات Red Team، على مستوى قابل للفحص:

1. ✅ 30 عينة اختبار تنجح في حفظ المصدر وربط كل الصيغ به — تُقاس عبر وجود `source_url`/`source_text` + `facts_json`/`formats_json` غير فارغين لكل حالة اختبار، مسجَّلة في سجل تقييم منفصل (القسم 16، المرحلة 5).
2. ✅ لا تظهر أسماء/أرقام/اقتباسات غير موجودة في المادة المُدخلة — يُفحَص بشرياً حالة بحالة (لا أداة آلية تحسم هذا وحدها)، مع تحقق آلي مساعد غير مانع للأرقام (القسم 8.1).
3. ✅ أي ادعاء جوهري غير مسند في الحالات الثلاثين يمنع الإطلاق — معيار قبول بشري صريح، لا معيار كود.
4. ✅ نتيجة المراجعة البشرية لكل حالة تُسجَّل بنموذج موحّد (ناجح/فشل مانع/ملاحظة غير مانعة) — ملف تقييم منفصل، القسم 16.
5. ✅ يُمنع الاعتماد قبل تأكيد المراجعة البشرية — مُنفَذ خادمياً (القسم 11.2)، قابل للاختبار بطلب `curl` مباشر يحاول `approve` بدون `checks` مكتملة ويجب أن يُرفَض بـ`422`.
6. ✅ الإدخال اليدوي يعمل عند تعذر الاستيراد — `POST .../import` يُعيد `ok:false` دون حذف `source_url`؛ قابل للاختبار مباشرة.
7. ✅ لا يفقد المستخدم النص أو تعديلاته عند فشل الموديل — مضمون بنيوياً بالفصل الزمني (القسم 10.1)؛ قابل للاختبار بمحاكاة فشل المزوّد (Mock 502) والتحقق أن صف `stories` لم يتغيّر.
8. ✅ لا يظهر مفتاح API في المتصفح أو السجلات — مُنفَذ بعدم وجوده إطلاقاً في أي مسار استجابة أو كود Frontend (القسم 12.5)؛ قابل للفحص الآلي (`grep` على الحزمة المبنية للواجهة).
9. ✅ يستطيع محرر واحد إكمال المسار من الإدخال إلى الأرشفة دون شرح تقني — معيار اختبار استخدام بشري (المرحلة 5-6).

---

## 15. Deployment Architecture

### 15.1 قرار معلَّق يحتاج موافقة Sufyan قبل أي برمجة (Subdomain vs Path)

ورقة القرار تستهدف `https://nasfm.info` كعنوان إنتاج عام للإذاعة، لكنها لا تحدد ما إذا كانت أداة التحرير الداخلية (أداة محرر واحد، ليست موجَّهة للجمهور) ستُنشَر على:

- **(أ)** Subdomain مخصَّص، مثل `newsroom.nasfm.info` — **مُوصى به**: يفصل التطبيق الداخلي عن أي موقع عام مستقبلي على `nasfm.info` نفسه، DNS Record بسيط (`CNAME` إلى Worker Route)، لا تعارض Routing.
- **(ب)** مسار تحت الدومين الرئيسي، مثل `nasfm.info/newsroom` — يتطلب أن يكون Worker موجود على نفس Zone الجذرية ويتشارك التوجيه مع أي محتوى عام آخر لاحقاً (تعقيد توجيه إضافي إن وُجد موقع عام مستقل لاحقاً).

**هذا قرار جوهري يحتاج موافقتك قبل أي ربط Cloudflare فعلي** (ممنوع في هذه المرحلة أصلاً وفق تعليماتك). التوصية الفنية: الخيار (أ).

### 15.2 البيئات

بيئتان منفصلتان بالكامل (D1 database منفصلة + Worker منفصل لكل بيئة)، **لا يُنفَّذ أي منهما الآن**:

- **Staging:** `nas-newsroom-staging` على Subdomain منفصل (مثل `newsroom-staging.nasfm.info` أو Workers.dev الافتراضي أثناء التطوير المبكر) — تُستخدَم فيها عينة الـ30 خبراً (المرحلة 5) وكل اختبار قبل الإنتاج.
- **Production:** `nas-newsroom` على الدومين النهائي المقرَّر (القسم 15.1) — لا يُربَط ولا يُنشَر قبل اجتياز معايير القبول كاملة (القسم 14) وفق `CLAUDE.md` القاعدة 5.

### 15.3 قرار معلَّق آخر: مزوّد الموديل الفعلي وسياسة الاحتفاظ بالبيانات

الإعدادات الافتراضية في النموذج التفاعلي تفترض `OpenAI — GPT-4.1`، لكن ورقة القرار تنص صراحة: "توثيق مزود الموديل وسياسة الاحتفاظ بالبيانات قبل التشغيل الفعلي" كشرط أمان مُلزم، وهذا لم يُحسَم بعد كوثيقة منفصلة. **لا يبدأ اختبار الـ30 خبراً (المرحلة 5) قبل حسم هذا التوثيق.**

### 15.4 افتراضات Cloudflare تحتاج تحققاً فعلياً عند التزويد (لا تُؤخَذ كمضمونة من هذه الوثيقة وحدها)

1. سلوك `assets.run_worker_first: ["/api/*"]` مع `not_found_handling: "single-page-application"` معاً — تم التحقق من التوثيق الرسمي الحالي أن هذا مسار مدعوم رسمياً (القسم 1)، لكن يجب تأكيده بتجربة فعلية في Staging قبل أي اعتماد نهائي، لأن تفاعل الخيارين مع تحديثات Wrangler المستقبلية قابل للتغيير.
2. Latency الفعلي من العراق إلى أقرب نقطة D1 (`eeur` المرجَّحة، القسم 4.2) — لا بيانات قياس فعلية متاحة الآن؛ القرار افتراضي حتى قياسه في Staging.
3. حدود الخطة المجانية/المدفوعة لـCloudflare Workers/D1 الحالية (عدد الطلبات، الكتابات) — يجب تأكيدها من لوحة الحساب الفعلية لـSufyan عند التزويد، لا الاعتماد على رقم من هذه الوثيقة قد يتغيّر.

---

## 16. Implementation Phases

مرحلة واحدة فقط من ترتيب التنفيذ الملزم في ورقة القرار (رقم 8: "برمجة مسار واحد كامل فقط")، مُفصَّلة لخطوات صغيرة قابلة للفحص كل خطوة، مطابقةً لقاعدة "العمل بمراحل صغيرة" في `CLAUDE.md`:

| # | الخطوة | مخرج قابل للفحص |
|---|---|---|
| 1 | Schema + Migrations (القسم 4) + Auth (تسجيل دخول/خروج، جلسات D1) | تسجيل دخول فعلي ناجح/فاشل، جلسة تُلغى فعلياً عند Logout |
| 2 | شاشة "خبر جديد" + `POST /api/stories` + `PATCH` + Autosave | حفظ مسودة ينجو من إغلاق المتصفح وإعادة فتحه |
| 3 | `POST .../import` بكل ضوابط SSRF (القسم 9.2) + مسار الإدخال اليدوي | SC-02 يعمل فعلياً: فشل استيراد حقيقي → إدخال يدوي → استمرار |
| 4 | AI Pipeline المُركَّب (القسم 7) + Structured Output + إعادة حساب `hasBlocker` | SC-01 وSC-03 يعملان بمادة حقيقية عبر استدعاء فعلي للمزوّد |
| 5 | شاشة المراجعة الكاملة: `checks`, `resolve-blocker`, `approve` (إنفاذ خادمي مزدوج) | محاولة `approve` مباشرة بـ`curl` دون شروط مكتملة تُرفَض بـ422 |
| 6 | `publish`, `exclude`, الأرشيف (`GET /api/stories` + بحث/فلترة) | الحالات الخمس (مسودة→منشور، ومستبعد) قابلة للتتبع في الأرشيف |
| 7 | الإعدادات (`GET/PUT /api/settings`, `test-model`) | تغيير الأسلوب/الطول ينعكس فعلياً على التوليد التالي |
| 8 | **بوابة: اختبار 30 خبراً حقيقياً بمراجعة بشرية موثَّقة** (شرط إطلاق صريح في ورقة القرار) | سجل تقييم مكتوب (نجاح/فشل مانع/ملاحظة) لكل حالة من الثلاثين، صفر حالات اختلاق غير مُعالَجة |
| 9 | نشر Staging فعلي على Cloudflare + اختبار قبول نهائي | يُنفَّذ في مرحلة منفصلة تالية — **ليس جزءاً من نطاق هذه الوثيقة أو هذا الـCommit** |

---

## ملخص قرارات تحتاج موافقتك قبل بدء البرمجة الفعلية

1. **Subdomain vs Path** لاستضافة أداة التحرير (القسم 15.1) — التوصية: `newsroom.nasfm.info`.
2. **مزوّد الموديل النهائي وسياسة الاحتفاظ بالبيانات** (القسم 15.3) — يجب توثيقه كخطوة منفصلة قبل اختبار الـ30 خبراً، وليس بعده.
3. **D1 Location Hint** (`eeur` مرجَّحة، القسم 4.2) — افتراض يحتاج قياس Latency فعلي، لا قرار نهائي.
4. **عدم وجود "سحب الاعتماد" (Un-approve) في MVP** (القسم 6.2) — إن كانت هذه حاجة فعلية متوقعة قريباً، يجب تسجيلها الآن في قائمة لاحقة بوعي، لا اكتشافها متأخراً أثناء البرمجة.
