# NAS Newsroom — Implementation Notes: Slice 1 (Auth + D1 + Draft Persistence)

**تاريخ الإنجاز:** 11 أكتوبر 2026
**الفرع:** `develop`
**المرجع:** `docs/02-requirements/NAS_Newsroom_Technical_Specs_v1.0.md`

---

## 1. ما تم إنجازه في الشريحة البرمجية الأولى (Vertical Slice 1)

1. **التهيئة المعمارية (Single Cloudflare Worker + Static Assets + D1):**
   - هيكل TypeScript متوافق مع معمارية Cloudflare Workers الرسمية.
   - إعداد بيئة التطوير والاختبار المحليّة بالكامل دون أي مساس بموارد Cloudflare أو GoDaddy أو DNS الإنتاجية.
   - مسارات `/api/*` مخدومة خادمياً بالكامل عبر Worker Script مع عزل أمني وصلاحيات صارمة.
   - واجهة المستخدم تُبنى إلى `dist/client` وتُقدَّم كـ Static Assets عبر `ASSETS` binding مع سياسات أمان مشددة (`_headers`).

2. **قاعدة البيانات ونظام الترحيل (D1 Migrations):**
   - ملف الترحيل الأولي `migrations/0001_init.sql` يطابق المواصفات التقنية (§4) لجداول: `users`, `sessions`, `stories`, `story_events`, `settings`.

3. **المصادقة وإدارة الجلسات (Authentication & Session Control):**
   - تشفير كلمات المرور باستخدام PBKDF2-SHA256 (عبر Web Crypto API الأصلي في Workers).
   - كوكي الجلسة `nas_session`: Host-only، `HttpOnly`، `Secure`، `SameSite=Strict`، `Path=/`.
   - الجلسات قابلة للإلغاء الفوري (Revocation) عبر حذف سجل الجلسة من D1 عند `logout`.
   - انتهاء الجلسة التلقائي: 12 ساعة Idle مع سقف مطلق 7 أيام.
   - حماية كاملة ضد CSRF: ترويسة `X-NAS-Client: 1` ومطابقة ترويسة `Origin` للطلبات المعدلة للحالة، دون تفعيل أي CORS خارجي.

4. **إدارة وحفظ المسودات (Draft Persistence & Safety):**
   - إنشاء خبر جديد وحفظ المسودة فورياً بحالة `مسودة`.
   - حفظ تلقائي مع Debounce وتأكيد صريح من الخادم.
   - عدم فقدان النص إطلاقاً في حال انقطاع الشبكة أو تعثر الخادم، وإبقاء النصوص في الحقول لإعادة المحاولة.
   - استعادة المسودات عبر المعرّف أو من قائمة المسودات المحفوظة.

5. **فروقات توثيقية موثقة (Deviations):**
   - **D-1 (PBKDF2 Iteration Cap):** تنص المواصفات النظرية على 310,000 تكرار، بينما تفرض بيئة تشغيل Cloudflare Workers سقفاً لا يتجاوز 100,000 تكرار لتفادي استهلاك CPU. تم اعتماد 100,000 تكرار كحد أقصى مدعوم في Workers، مع تخزين عدد التكرارات داخل الحقل لإتاحة الترقية مستقبلاً.

---

## 2. نتائج الاختبارات وفحوص الجودة (Quality Gates)

- **ESLint & Typecheck:** اجتياز كامل بدون أي أخطاء (`tsc` على كود الخادم والمتصفح).
- **Check Bundle:** 0 تسريبات لأي أسرار أو مفاتيح API أو معرّفات خادمية داخل حزمة المتصفح.
- **Vitest (40 Tests):** 40 اختبار نجاح يشمل المصادقة، التشفير، الجلسات، الترحيلات، وحفظ المسودات وحماية الأسرار.
- **Playwright E2E (28 Tests):** 28 اختبار نجاح على Desktop (Chrome) و Mobile (Pixel 7 / Viewport 390x844) يتأكد من سلامة الواجهة، عدم وجود overflow، استعادة المسودات، والتعافي من أخطاء الشبكة.
