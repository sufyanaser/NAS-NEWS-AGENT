# NAS Newsroom (منصة ناس للتحرير الإخباري)

منصة تحرير إخباري داخلية لإذاعة ناس (`NAS FM`)، تساعد محررًا واحدًا في تحويل مادة صحفية موثقة إلى نص إذاعي جاهز للبث وصيغ رقمية قابلة للمراجعة والاعتماد البشري خلال أقل من خمس دقائق، مع الفصل الصارم بين استخراج الحقائق من المصدر والتحقق الصحفي، ومنع اختلاق المعلومات.

## البيانات الأساسية للمشروع

- **اسم المشروع:** NAS Newsroom
- **المستودع الرسمي:** https://github.com/sufyanaser/NAS-NEWS-AGENT
- **فرع التطوير المعتمد (Source of Truth):** `develop` (مع الاحتفاظ بـ `main` كفرع مستقر)
- **دومين الإنتاج المستهدف:** https://nasfm.info
- **مسجل الدومين:** GoDaddy
- **DNS والحماية والنشر:** Cloudflare ([وثيقة قرار الاستضافة v1.0](docs/01-foundation/NAS_Newsroom_Deployment_Decision_v1.0.md))

## حالة المشروع الحالية

- **ورقة القرار 1.0 ومراجعة Red Team:** معتمدة ([NAS_Newsroom_Decision_Paper.md](docs/01-foundation/NAS_Newsroom_Decision_Paper.md)).
- **قرار الاستضافة والنشر v1.0:** معتمد مبدئياً ([NAS_Newsroom_Deployment_Decision_v1.0.md](docs/01-foundation/NAS_Newsroom_Deployment_Decision_v1.0.md)).
- **سيناريوهات الاستخدام الثلاثة (SC-01, SC-02, SC-03):** مثبتة كمرجع تصميمي v1.0 ([NAS_Newsroom_Scenarios_v1.0.md](docs/02-requirements/NAS_Newsroom_Scenarios_v1.0.md)).
- **الوايرفريم والنموذج القابل للنقر (Prototype Baseline):** مكتمل ومفحوص عبر الشاشات الخمس في [prototype/index.html](prototype/index.html) (ويطابقه [prototype/NAS-Newsroom-Redesign.html](prototype/NAS-Newsroom-Redesign.html)).
- **البرمجة الإنتاجية والنشر:** لم تبدأ بعد، بانتظار تثبيت المواصفات التقنية التفصيلية واختبار الموديل وفق الترتيب الملزم.

## هيكل المستودع

```text
NAS-NEWS-AGENT/
├── docs/
│   ├── 01-foundation/
│   │   ├── NAS_Newsroom_Context_Handoff.md
│   │   ├── NAS_Newsroom_Decision_Paper.md
│   │   └── NAS_Newsroom_Deployment_Decision_v1.0.md
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

## خطة مراحل المشروع (MVP 1.0 Roadmap)

1. **المرحلة 1 — التأسيس والنطاق (مكتملة):** اعتماد ورقة القرار 1.0، قرار الاستضافة والنشر، وتوثيق تسليم السياق.
2. **المرحلة 2 — المتطلبات وسيناريوهات الاستخدام (مكتملة):** تثبيت السيناريوهات المرجعية الثلاثة (`SC-01` المسار الطبيعي، `SC-02` فشل استيراد الرابط، `SC-03` دقة الإسناد والمانع التحريري).
3. **المرحلة 3 — التصميم والنموذج التفاعلي (Baseline حالي):** بناء الوايرفريم الموحد `v0.2` والنموذج التفاعلي المستقل (`prototype/index.html`) للشاشات الخمس والتحقق من الانتقالات.
4. **المرحلة 4 — المواصفات التقنية ومعايير القبول (الخطوة التالية):** تثبيت مخطط البيانات، عقود الـ API الخادمية، المصادقة، قوالب الموديل، ومعايير القبول لكل شاشة وحالة.
5. **المرحلة 5 — تقييم الموديل والقوالب:** اختبار القوالب التحريرية على عينة من 30 خبراً حقيقياً للتحقق من عدم الاختلاق ودقة العربية والكلفة والسرعة.
6. **المرحلة 6 — بناء المسار الأساسي ثم إكمال الـ MVP:** برمجة مسار تحريري كامل واحد أولاً، ثم إكمال بقية الصيغ والأرشيف والإعدادات.
7. **المرحلة 7 — اختبارات القبول والنشر:** إجراء اختبارات ما قبل الإنتاج ثم النشر في مرحلة مستقلة على Cloudflare وربط `nasfm.info`.

## قواعد الحوكمة والتشغيل

تُدار جميع العمليات البرمجية والتشغيلية وفق الضوابط الموثقة في [CLAUDE.md](CLAUDE.md). لا يبدأ بناء Backend أو Frontend إنتاجي قبل تثبيت المواصفات التقنية، ولا يتم تعديل إعدادات DNS أو Cloudflare قبل مرحلة النشر المخصصة.
