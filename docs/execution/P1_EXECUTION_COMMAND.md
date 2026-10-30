# التكليف التنفيذي الوحيد — P1 — متجر الأغبري Nasr1

نفّذ الآن، وليس تقريراً أو خطة. اقرأ فقط بهذا الترتيب:
1. أول 60 سطراً من docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md.
2. docs/execution/CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md.
3. هذا الملف.
4. docs/execution/P1_CHECKPOINT.md لاستعادة آخر موضع عمل.

المستودع Report-Engainall/Nasr1، الفرع main فقط، لا branches ولا PRs. الحد 180 دقيقة. هدف الدفعة إغلاق ثلاثة صفوف قبول تفصيلية على الأقل من CSV بأدلة حقيقية. لا تعِد استكشاف المشروع.

## أول مهمة مباشرة

تحقق من إصلاحات النطاق offline catalog/cart/account switching على آخر main. نقطة الرصد عند إعداد هذا التكليف هي ee1b84303e5fc18b46bed0b37a880a306e06d5d8، وتتضمن تغييرات متتابعة:
- 81716e9: كاش الكتالوج scoped بالمستخدم والمؤسسة والمستودع.
- 15269cb: الحفاظ على مسودات السلة المستقلة ومواءمة اختبارات النطاق.
- ee1b843: مسح كاش الحساب الخارج والداخل عند تبديل الحساب دون اتصال.

آخر SHA موثق الاختبار في المؤشر القديم هو eb83f6c؛ لا تنقل نجاحه إلى هذه التغييرات. تحقق من رأس main الحالي مرة واحدة قبل التنفيذ؛ إذا تقدم، افحص فقط هذه الملفات المتغيرة.

الملفات المعروفة:
- src/routes/__root.tsx
- src/components/CustomerWorkflows.tsx
- src/lib/offline-catalog-cache.ts
- src/lib/offline-catalog-cache.test.ts
- src/lib/supabase-tenant-scope.test.ts
- src/test/auth-session-cache-boundary.test.tsx
- src/test/customer-workflow-tenant.test.tsx
- src/test/offline-workspace-route-acceptance.test.tsx

نفّذ الاختبارات المركزة:
    npm test -- src/lib/offline-catalog-cache.test.ts src/lib/supabase-tenant-scope.test.ts src/test/auth-session-cache-boundary.test.tsx src/test/customer-workflow-tenant.test.tsx src/test/offline-workspace-route-acceptance.test.tsx
    npm run typecheck
    npm run build

تحقق من CI الموجود على SHA نفسه قبل تشغيل أي workflow جديد. أصلح regression المثبتة فقط في ملفاتك. حافظ على مسودات السلة؛ لا تمسحها لإجبار الاختبار على النجاح.

## نطاق UI لبقية المسارات

- W02: DLV-002/ROUTES-001/IDENTITY-001 — customer/admin routes، RTL، navigation، responsive، loading/empty/error/retry/unauthorized/success، PWA/brand.
- W03: DLV-003 — product lifecycle/search/detail/admin UI.
- W04: DLV-004 — cart/checkout/retry/ambiguous response UX.
- W05: DLV-005/006/014 — registration/approval/sessions/device/offline UI.
- W07/W08: DLV-009/010 — import/export screens، Customer 360، analytics.
- W09: DLV-011/012/013 — print/PDF/AI/WhatsApp user-facing flows and explicit unavailable states.
- W10: DLV-017/018 — accessibility/keyboard/contrast/responsive/handover UI.

اختر فقط متطلبات تفصيلية مفتوحة في CSV وتجنب No-repeat set. استخدم Task IDs الموجودة، لا تنشئ ID بديل.

## ملكية الملفات

مسموح لك: src/components/**, src/routes/**, src/styles.css, UI tests within src/test/**, assigned e2e/**.
ممنوع: supabase/**, scripts/**, src/lib/api.ts, src/lib/supabase.ts, RLS/RPC/Edge, CURRENT_EXECUTION_STATE, matrix CSV, EXECUTION_LOG.
عند الحاجة لعقد API، اكتب في REQUEST TO P2 في P1_CHECKPOINT.md العملية والطلب والاستجابة والـtenant/role/error/idempotency/audit والاختبار. لا تنشئ خدمة بديلة. استمر في مسار واجهة مستقل.

## حفظ التقدم

بعد كل task/commit/failure وبحد أقصى 10 دقائق، حدّث P1_CHECKPOINT.md: Task ID، base/result SHA، الملفات، أمر الاختبار والنتيجة، root cause، رابط CI، الملفات التي لا تزال غير ملتزمة، والعين next command. لا تلمس المؤشر المركزي؛ P2 يملكه ويحدّثه.
ادفع fast-forward عادياً فقط إلى main. إذا تحرك main، قارن المسارات الجديدة وأعد ترتيب commit على رأسه إن كانت التغييرات منفصلة. لا force/reset/clean ولا حذف عمل غير ملتزم به.
حد أقصى محاولتان للفشل نفسه؛ بعدها وثق السبب، أكمل البديل الممكن، وسجّل الخارجي BLOCKED_EXTERNAL ثم انتقل. لا خدمات مدفوعة ولا أسرار في commits.

**في نهاية الدفعة:** سلّم ما أُغلق من صفوف قبول بأدلة exact-SHA، مع commit والملفات والاختبارات وروابطها، وسبب أي صف لم يغلق، وNEXT ACTION واحد. ابدأ فوراً بالمهمة الأولى.
