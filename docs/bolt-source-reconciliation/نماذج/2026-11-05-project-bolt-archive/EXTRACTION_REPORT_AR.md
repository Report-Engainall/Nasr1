# تقرير استخراج ومطابقة حزمة Bolt — تسليم للمبرمج التالي

**التاريخ:** 2026-11-05  
**المستودع:** `Report-Engainall/Nasr1` — `main`  
**SHA المراجعة:** `431a08c9eb176112908c6dd42d560b95bb42d082`  
**SHA-256 للحزمة الخارجية:** `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`

## الخلاصة التنفيذية

لا توجد توصية بنسخ جماعي أو استبدال ملفات التطبيق من هذه الحزمة. الملفات المرجعية الـ69 المستخرجة سابقًا موجودة بالفعل في `docs/bolt-source-reconciliation/READY_TO_REUSE/`، وكل ملف مرتبط بقرار في `SOURCE_INTEGRATION_LEDGER.csv`. ملف CSV داخل الأرشيف الداخلي يطابق ملف Nasr1 الحالي حرفيًا، وحارس صور المنتجات الحالي أقوى من النسخة القديمة.

هذه هي نقطة الرجوع للمبرمج التالي: **لا تعِد فك ZIP أو جرد الملفات الـ69**. استخدم جدول القرار المرفق وسجل التكامل، ثم انتقل إلى فجوة منتج مثبتة فقط.

## 1. بصمات وأعداد الأرشيف

| البند | القيمة |
|---|---|
| ZIP الخارجي | `project-bolt-github-8ccbjvhg (2).zip` |
| الحجم الخارجي | 6,791,575 بايت |
| SHA-256 الخارجي | `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9` |
| العناصر الخارجية | 1,211 |
| الملفات الخارجية | 1,119 |
| الحجم غير المضغوط | 17,656,042 بايت |
| الجذر | `project/` |
| ZIP الداخلي | `project/docs/project-bolt-github-7sl6ykzz (5).zip` |
| الحجم الداخلي | 2,699,154 بايت |
| SHA-256 الداخلي | `0a71e066357d59e60e33e7f63d8afa3c645d48dc3a29c69ed64decb9ab131a20` |
| عناصر ZIP الداخلية | 871 |
| الملفات الداخلية | 790 |
| Git metadata | غير موجود في الأرشيفين |

الأرشيف الداخلي Snapshot تاريخي مضمن في الخارجي، ولا يعني ذلك أنه أحدث.

## 2. مقارنة Git

نقطة المصدر المسجلة سابقًا: `3f33dba1d1879fc1426a2428e331b496c6241dae`. مقارنة هذه النقطة مع main عند إعداد هذا التقرير أعطت **ahead 75 / behind 0**، ونقطة الأرشيف ancestor في تاريخ main.

الرقم 46 الوارد في تقرير سابق كان مقارنة مع رأس تاريخي `a15b4751920c0678fbe8edb7c9a6b545206cf8b2` فقط؛ لا تستخدمه كحالة راهنة. هذا التقرير مكمل لتقرير المصالحة السابق.

## 3. ملفات READY_TO_REUSE — 69 ملفًا

المجلد المرجعي canonical:
`docs/bolt-source-reconciliation/READY_TO_REUSE/`

| مستودع المصدر | Commit | الملفات |
|---|---|---:|
| Aghbari-Technologies/aghbari-commerce-evolved | `d24695209b45f2352e0ba994e1f5109d7e2afc9d` | 6 |
| Report-Engainall/aghbari-commerce | `00d7446bba9652ea40178a08b00c9da9a2bba8a1` | 48 |
| Report-Engainall/aghbari-store | `df3d7dd13276910d90a7273c8ace13e9a74ee277` | 8 |
| adnanabderab2016-sys/aladnan-electronics | `99eb3fa452eb3344c4c1fd625209e20d2f7169ed` | 7 |
| **الإجمالي** | | **69** |

نتائج التدقيق:
- Git blob المصدر يطابق النسخة المخزنة في READY_TO_REUSE في 69/69.
- تدقيق المسارات السابق وجد 60 مسارًا غير موجود بالاسم في target و9 مسارات مختلفة المحتوى. هذا لا يثبت غياب الميزة؛ قد تكون مطبقة بمسار أو عقد آخر.
- كل زوج `source_repo + source_path` في manifest له قرار في `SOURCE_INTEGRATION_LEDGER.csv`: 69/69.
- الملف `READY_TO_REUSE_DECISIONS.csv` يجمع البصمات ونتيجة audit ومعرفات قرارات ledger وحالتها في صف مستقل لكل ملف.

لا تنسخ الملفات الـ69 مرة أخرى. الجدول الجديد فهرس؛ النسخ المرجعية تبقى في READY_TO_REUSE.

## 4. نتائج الأرشيف الداخلي

### صفحات قديمة
الأرشيف الداخلي يتضمن 13 صفحة React Router: AdminAiWorkspace, AdminAuditLog, AdminBanners, AdminCategories, AdminCustomer360, AdminInventory, AdminNotifications, AdminPricing, AdminReports, AdminSuppliers, CommerceAssistant, ComparePage, WishlistPage. القرارات المفصلة بالمسارات في `SPECIAL_ARCHIVE_DECISIONS.csv`. لا تنشئ صفحات/مصادقة/مخططات ثانية من هذه الصفحات القديمة.

**التصنيفات:** حالة أكتوبر التي وصفت نقصًا في إدارة التصنيفات أصبحت قديمة جزئيًا. main الحالي يحتوي أوامر إنشاء وأرشفة وإعادة تسمية التصنيف من خلال `src/lib/admin-catalog-commands.ts` واختبارات UI wiring وarchive/rename وترحيل rename. لا تنقل صفحة الأرشيف لأنها تعتمد كتابة مباشرة بدل RPC والتدقيق. وجود الشيفرة والاختبارات لا يعني أن UAT شُغّل في هذه المراجعة.

**البنرات:** مدير إعلانات المتجر الحالي يدعم النص والجمهور والجدولة والأولوية والرابط الآمن. لكن دورة صورة البنر وStorage غير مثبتة بالكامل. الفجوة الضيقة المحتملة هي عقد أصول آمن: tenant path، RBAC، MIME/size، تنظيف آمن، audit واختبارات رفض. لا تنسخ الصفحة القديمة.

### تصدير CSV
الملف الداخلي `supabase/functions/async-export-worker/async-export-csv.ts` يطابق حرفيًا `src/lib/async-export-csv.ts` الحالي، blob `f4423da23c2c0d850b770a7de4f4b80ac962e034`. العامل الحالي يستورد الوحدة المشتركة؛ لا تضف نسخة ثانية. نسخة ZIP الخارجية مختلفة blob `8159e9318a939abd46215c4c694f0ac278b53d0a`؛ لا تستبدل بها الحالية.

### أمن صور المنتجات
helper الأرشيف القديم blob `09d762f434b2158250a38ad71e31f73e4bc2a2ad`. Nasr1 الحالي `src/lib/product-image-security.ts` blob `8232fc8d308822a53bd14945c9679e15b1154006`. الحالي أوسع: يتحقق من HTTPS وURL credentials/query/hash وencoded paths وtenant/product ownership وWebP وحد الحجم والأدوار. اختبارات target تغطي هذه الحالات والـupload handler يستخدم helper المركزي. احتفظ بالهدف ولا تضف helper قديمًا.

### SQL والأسرار
- ترحيل منح admin مباشرة: مستبعد أمنيًا؛ لا تنسخ ولا تطبق.
- ترحيل تعديل كلمة مرور مدير: مستبعد أمنيًا؛ لا تنسخ ولا تطبق.
- SQL الخاص بـExecutive analytics/Customer 360 مكرر مع الهدف؛ لا تضف migration ثانية.
- SQL الخاص بـstorefront batch pricing غير متوافق مع RPC/schema الحالي؛ لا تطبقه.
- `.env`: لم تُقرأ قيمه ولم يُنسخ؛ لا تنشر السر أو بصمته.
- `index.html`, `package-lock.json`, `tsconfig.tsbuildinfo`, `supabase/config.toml`: ملفات دخول/قفل/توليد/إعداد قديمة لا تستبدل نظائرها الحالية.

## 5. ما هو أحدث في Nasr1

الأرشيف أقدم من main. لا تسترجع ملفات أقدم فوق اختبارات XLSX لأوامر الشراء والجرد، backup/restore rehearsal، أو تحسينات الطباعة في Executive Analytics وCustomer 360. كما أن Customer Return Review XLSX سبق توثيقه كميزة موجودة؛ لا تكرر إضافته.

## 6. أمر الاستئناف للمبرمج

1. اقرأ هذا التقرير ثم `READY_TO_REUSE_DECISIONS.csv`.
2. استخدم task IDs في `SOURCE_INTEGRATION_LEDGER.csv` ولا تعد فحص ملف له قرار مثبت بلا regression أو دليل جديد.
3. لا تفك ZIP مجددًا ولا تنسخ الـ69 ملفًا ثانية.
4. لا تنفذ SQL أو تغييرات صلاحيات اعتمادًا على الأرشيف.
5. أي نقص مثبت يُنفذ ضمن عقود Nasr1 مع tenant/RBAC/RLS/RPC/audit/idempotency واختبار رفض بلا أثر جانبي على SHA نفسه.
6. استكمال أصول صور البنرات مرشح جزئي فقط؛ ابدأ بعقد آمن لا بنسخ الصفحة.
7. استأنف `BODY-COMPLETION-ON-MAIN-001`. هذا التقرير لا يفعّل Bolt runtime ولا يغيّر ترتيب المرحلة.

## 7. حدود الإثبات

تم التحقق من ZIP digests وأعداد الملفات ومقارنة Git وprovenance/audit/ledger وبصمات ملفات مختارة. لم يُنفذ كود الأرشيف أو migrations أو build أو Vitest/Playwright أو Edge deployment أو Bolt Preview أو أي كتابة إنتاجية. هذه وثائق مرجعية وليست إثبات قبول برمجي جديد.

## المراجع
- [READY_TO_REUSE](../../READY_TO_REUSE/README.md)
- [Provenance manifest](../../READY_TO_REUSE/PROVENANCE_MANIFEST.csv)
- [File audit](../../READY_TO_REUSE_FILE_AUDIT.csv)
- [Integration ledger](../../SOURCE_INTEGRATION_LEDGER.csv)
- [مصفوفة الأرشيف السابقة](../../P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv)
- [تقرير المصالحة السابق](../../BOLT_ARCHIVE_RECONCILIATION_2026-11-05.md)
