# CLAUDE.md — قواعد التشغيل والحوكمة لمشروع NAS Newsroom

## معلومات المشروع الأساسية

- **اسم المشروع:** NAS Newsroom (منصة ناس للتحرير الإخباري)
- **المستودع الرسمي:** `https://github.com/sufyanaser/NAS-NEWS-AGENT`
- **المجلد المحلي:** `H:\Projects\NAS-NEWS-AGENT`
- **الدومين المعتمد:** `nasfm.info` (المسجّل: GoDaddy — إدارة DNS والحماية والنشر: Cloudflare)
- **الهدف الإنتاجي المستقبلي:** `https://nasfm.info`

---

## قواعد التشغيل الملزمة (Operational Guardrails)

1. **`develop` هو Development Source of Truth:**
   - يتم التطوير والتوثيق والتحديثات الجارية على فرع `develop` باعتباره مصدر الحقيقة للتطوير، مع الاحتفاظ بفرع `main` كفرع مستقر للإصدارات المعتمدة.
   - يمنع استخدام `git push --force` أو `git reset --hard` أو إنشاء تاريخ موازٍ غير مرتبط.

2. **العمل بمراحل صغيرة (Small, Verifiable Increments):**
   - يُنفذ المشروع في خطوات صغيرة متسلسلة، ولكل مرحلة مخرجات محددة ومعيار قبول واضح قابل للفحص قبل الانتقال للمرحلة التي تليها.

3. **لا توسع نطاق MVP 1.0 (Strict Scope Control):**
   - الالتزام الصارم بحدود [ورقة القرار 1.0](docs/01-foundation/NAS_Newsroom_Decision_Paper.md).
   - يمنع إضافة ميزات خارج النطاق المعتمد (مثل النشر الآلي، تفريغ الصوت والفيديو، ربط أنظمة البث، تعدد الوكلاء، أو الصلاحيات المعقدة).

4. **لا commit/push بعد فشل التحقق (Quality Gates First):**
   - يمنع إنشاء أي commit أو رفعه إلى GitHub إذا فشل أي فحص في بوابات الجودة (`git diff --check`، سلامة الروابط، صحة HTML/JS، خلو الملفات من الأسرار).

5. **لا نشر إنتاجي قبل اختبارات القبول (No Premature Production Release):**
   - لا يتم النشر الإنتاجي قبل استكمال المواصفات التقنية، واختبار الموديل على عينة الـ 30 خبراً حقيقياً، واجتياز معايير القبول التحريرية والأمنية كاملة.

6. **لا أسرار في المستودع (Zero Secrets in Repo):**
   - يمنع وضع مفاتيح API أو كلمات مرور أو رموز وصول (Tokens) داخل الكود المصدري أو ملفات الواجهة أو تاريخ Git. تُدار الأسرار لاحقاً في متغيرات بيئة الخادم فقط.

7. **لا اختلاق نتائج اختبارات (No Fabricated Test Results):**
   - توثق نتائج الفحص والاختبار الفعلية فقط كما جرت في بيئة العمل، مع التمييز الصريح بين الفحص البنيوي/التفاعلي في المتصفح وبين الاختبارات الخادمية المؤجلة.

8. **لا تغيير DNS أو Cloudflare من دون مرحلة نشر منفصلة:**
   - يمنع تعديل سجلات DNS أو ربط Cloudflare أو توجيه الدومين `nasfm.info` إلى أي بيئة تجريبية إلا ضمن مرحلة نشر مستقلة ومعتمدة صراحة.

9. **لا إضافة Backend قبل تثبيت المواصفات التقنية:**
   - لا يبدأ بناء الخلفية (Backend) أو قاعدة البيانات أو ربط مزود الذكاء الاصطناعي قبل تثبيت واعتماد المواصفات التقنية التفصيلية وعقود البيانات (Data & API Specs).

---

## هيكل المستودع المعتمد

```text
NAS-NEWS-AGENT/
├── docs/
│   ├── 01-foundation/
│   │   ├── NAS_Newsroom_Decision_Paper.md
│   │   ├── NAS_Newsroom_Deployment_Decision_v1.0.md
│   │   └── NAS_Newsroom_Context_Handoff.md
│   ├── 02-requirements/
│   │   └── NAS_Newsroom_Scenarios_v1.0.md
│   └── 03-design/
│       ├── README.md
│       ├── NAS_Newsroom_Wireframe_v0.2.md
│       ├── NAS_Newsroom_Transition_Tests_v0.1.md
│       └── NAS_Newsroom_Transition_Test_Results_v1.0.md
├── prototype/
│   ├── index.html
│   ├── NAS-Newsroom-Redesign.html
│   └── index.previous.html
├── README.md
├── CLAUDE.md
└── .gitignore
```
