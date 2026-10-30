# التكليف التنفيذي الوحيد — P2 — متجر الأغبري Nasr1

أنت P2 وقائد التكامل والاستئناف. المطلوب تنفيذ كود واختبارات، وليس مسحاً أو تقريراً. اقرأ فقط:
1. أول 60 سطراً من docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md.
2. docs/execution/CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md.
3. هذا الملف.
4. docs/execution/P1_CHECKPOINT.md عند الحاجة لعقد أو تقدم P1.

المستودع Report-Engainall/Nasr1، الفرع main فقط، لا branches ولا PRs. حد الدفعة 180 دقيقة. أنت المالك الوحيد لمؤشر الاستئناف ومصفوفة CSV وسجل التنفيذ المركزي. الهدف المشترك مع P1 ثلاثة صفوف قبول تفصيلية مغلقة على SHA محدد.

## المهمة الحالية — نفذها فوراً

ابدأ من المهمة المسجلة في المؤشر:
DLV-007-REORDER-POINT-STAFF-DENIAL-001.

في scripts/test-database-migrations.mjs بعد اختبارات set_inventory_reorder_point السلبية وعبر المؤسسات:
1. حل operationsStaffProfileId إلى auth_user_id من اتصال fixture ذي الامتيازات؛ الدور يعود إلى staff في الاختبارات السابقة.
2. التقط snapshots قبل العملية من inventory_balances: reorder_point/on_hand/reserved/available/updated_at، ومهمة ai_tasks المرتبطة بـstockKey، وكل inventory.reorder_point.updated audit entries.
3. سجل هوية الموظف العادي من المؤسسة نفسها، واستدعِ set_inventory_reorder_point(...,30,'unauthorized staff policy change').
4. اشترط SQLSTATE 42501، وقارن snapshots بعد الرفض byte-for-byte. أعد هوية المدير بشكل آمن.
5. لا تكرر manager success/no-op أو accountant denial أو negative-bound أو foreign-tenant cases. لا تضف migration إلا إذا ثبت خلل guard فعلي.
6. نفذ PostgreSQL 17/Core محلياً ثم CI على SHA الناتج نفسه.

لا تنتظر P1؛ هذا ملف مستقل. اقرأ P1_CHECKPOINT.md لطلبات API أو integration فقط.

## مسارات P2 العشرة

- W01: DLV-001 — traceability/coverage numerator-denominator/0 orphan/0 duplicate.
- W02: DLV-002/IDENTITY-001 — server identity/PWA contracts/security.
- W03: DLV-003 — catalog schema/RPC/RLS/required fields/search/image/storage.
- W04: DLV-004 — atomic order/idempotency/retry/reservations.
- W05: DLV-005/006/014 — auth/invitations/approval/membership/session revocation/tenant cache.
- W06: DLV-007/008 — inventory/ATP/locks/ledger/payment allocation/currency/statements.
- W07: DLV-009 — import/DQS/chunk/hash/replay/export/Onyx reconciliation.
- W08: DLV-010 — KPI/source lineage/tenant-safe aggregation.
- W09: DLV-011/012/013 — PDF/XLSX server allowlists/AI gateway and fallback/outbox/official WhatsApp receipt.
- W10: DLV-015/016/018/REL-GATE-002 — risk-ranked RPC/Edge semantic security/health/logs/backup/restore/rollback/handover/release. API-OPS-001 crosses these tracks.

اختر المهام من صفوف CSV المفتوحة، مرتبة حسب الأمان وصحة البيانات والمالية والمخزون ثم التكامل ثم التحليلات. بعد DLV-007 انتقل إلى متطلب تفصيلي قابل للإغلاق في DLV-008 أو DLV-015، ثم استمر. لا تحصر الدفعة في مهمة واحدة.

## ملكية الملفات

أنت وحدك تملك: supabase/**, scripts/**, src/lib/api.ts, src/lib/supabase.ts، منطق الخدمات، CURRENT_EXECUTION_STATE.md، المصفوفة CSV، EXECUTION_LOG.md والسجلات المركزية.
لا تعدل: src/components/**, src/routes/**, src/styles.css أو اختبارات المتصفح المخصصة لـP1.
الملفات المشتركة مثل package/lock/workflows/router root لا يلمسها أحد قبل تحديد مالك وحجزها. لا تنسخ SQL من donor repo. كل رفض أمني يثبت قبل/بعد على بيانات fixture؛ لا تكفي رسالة الخطأ.

## الاختبارات

استخدم الموجود:
    node scripts/test-database-migrations.mjs
    npm run test:db
    npm test -- <اختبارات الوحدة/العقد المتأثرة>
    npm run typecheck
    npm run lint
    npm run build

شغّل test:db كاملاً عند حاجة التكامل، لا بعد كل تعديل صغير إذا نجح الاختبار المركز. تحقق من Actions لنفس SHA قبل تشغيل workflow. Core/P2/PG17/cleanup يجب أن تكون نهائية على SHA المراد إثباته.

## قيادة الاستئناف

بعد كل إنجاز أو commit أو فشل: حدّث أول 60 سطراً من CURRENT_EXECUTION_STATE.md، والصف المتعلق في CSV، وأضف سطر evidence في EXECUTION_LOG.md. ثبّت live code SHA وlast verified SHA وactive/next task والمالك والملفات المحجوزة ونتيجة CI exact SHA والرابط والسبب الجذري وexact_next_command. لا تترك NEXT ACTION قديماً.
راجع P1_CHECKPOINT.md عند اكتمال UI أو وجود طلب API، ولا تنتظر P1 إن كان هناك عمل مستقل.
قبل push: git fetch origin main، افحص الملفات المملوكة فقط ثم commit وfast-forward push. عند تقدم main، compare للملفات المتغيرة، لا force/reset/clean ولا حذف عمل مبرمج آخر.
أنت منسق CI المشترك؛ شغّل Core/P2/PG17 مرة واحدة على SHA موحد. كل commit أحدث يحتاج تحققاً خاصاً به.

## منع الدوران والقيود الخارجية

- لا تعِد inventory 330 RPC؛ الخريطة البنيوية موجودة ولا تثبت الإذن الدلالي. اختبر الحدود عالية الخطورة غير المغطاة حسب matrix.
- محاولتان فقط لنفس الفشل والسبب. بعدهما عزل سبب/إصلاح أو بديل آمن، ثم انتقل.
- Onyx live/WhatsApp live/AI live/production بدون credentials أو موافقة: اختبر contracts محلياً، أظهر disabled state، سجل BLOCKED_EXTERNAL، وتابع فوراً.
- لا إنفاق مدفوع ولا تخزين أسرار ولا تغيير في الإنتاج.

**التسليم في نهاية 180 دقيقة:** ثلاثة صفوف قبول تفصيلية مغلقة على الأقل عبر P1/P2 متى سمحت البيئة؛ SHA محدد، حالات Core/P2/PG17، روابط الأدلة، قائمة BLOCKED_EXTERNAL، وNEXT ACTION واحد مباشر. ابدأ الآن بمهمة منع الموظف العادي من تعديل نقطة إعادة الطلب.
