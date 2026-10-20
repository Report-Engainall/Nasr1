## P2 readback — Onyx reconciliation CI result — 20 October 2026

- `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`.
- Exact tested application-code SHA: `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; GitHub Actions [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) completed `SUCCESS`. The workflow completed unit tests, isolated PostgreSQL 17 migration/acceptance, lint (repository-wide Prettier rule excluded by workflow), build, preview smoke (4173), and dev smoke (5173). The database acceptance includes role/tenant denial, unscoped source denial, reservation and stale-stock rejection, idempotency, successful apply and compensating rollback, and refusal to roll back over later movement history.
- Current PR #18 branch HEAD after documentation-only readback commits: `a7d2a22c43d6eab44cbbb0a27071225f4eeef4a8`. Commits after `acadfb1` changed only P2 documentation/state records; no application code changed. The workflow is verified for the exact application-code SHA above; **do not label the later documentation HEAD as CI-tested**, because the workflow did not trigger for documentation-only updates.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; no real external Onyx connection/sync is claimed.
- P2 records updated: `PROGRAMMER_2_CURRENT_REPORT.md`, `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, `WORK_COORDINATION.md`, and `P2_MULTI_PROJECTS_TRANSFER_REVIEW_2026-10-20.md`. No P1-owned ledger/report/locked code paths changed; no main or donor repository writes.
- Next single task: `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006` — adapt the extracted Playwright critical-path suite to Nasr1's actual auth/routes and prove catalog → cart → order → refresh plus cross-organization isolation using dedicated CI credentials; absent credentials must be reported `NOT RUN/BLOCKED_EXTERNAL`, never silently skipped. Afterward continue the task-center print-all/filter parity and remaining original-spec gaps.

---

## P2 live update — NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005 — 20 October 2026

- Scope: implemented target-native warehouse-scoped preview → apply → compensating rollback using `onyx_snapshots/onyx_snapshot_rows`, `inventory_balances`, `inventory_movements`, and audit records; donor SQL was not copied.
- Code paths: `supabase/migrations/20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`, `src/lib/onyx-inventory-reconciliation.ts`, `src/components/OnyxInventoryReconciliationActions.tsx`, `src/components/OnyxSnapshotCenter.tsx`, `src/test/onyx-inventory-reconciliation.test.ts`, `scripts/test-onyx-reconciliation.mjs`; `package.json` test:db runs the PostgreSQL acceptance script.
- Guardrails in implementation: active staff tenant context; manager/admin for stock-changing commands; warehouse-scoped source evidence; rejects unscoped aggregate snapshots, duplicate/invalid item codes, nonnegative quantity violations, unknown/foreign products, reservations above target, and source/stock/movement drift; idempotency keys for preview/apply/rollback; two-pass validation before stock writes; append-only stock movements and audit; rollback denied when later stock changes exist. Table direct DML is revoked from authenticated and anonymous roles.
- `IMPLEMENTED` / `INTEGRATED`: present in P2 branch and wired into existing Onyx Snapshot Center; preview is explicitly non-mutating.
- `TESTED_EXACT_SHA`: **PENDING**. Current application commit `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; workflow [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) is still in progress at last readback (unit tests running). Do not claim PASS until the workflow concludes successfully on the exact code SHA or a final SHA with this code unchanged and CI rerun.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; live Onyx connection/sync is not claimed.
- Source-review state: the previously listed controlled reconciliation gap is now implemented on this branch; remaining work includes real authenticated Playwright critical paths and tenant isolation, task-center print-all/filter parity, extraction-count discrepancy triage, identity/sync-evidence review, AI fallback/usage-ledger behavior, and remaining original-spec gaps.
- Do not advance the single live task pointer until the exact-SHA workflow is green. **next_task_id remains `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005` pending CI acceptance.** No P1-owned source ledgers/reports or locked code paths were edited; no main or donor repository writes.

---

## أحدث حالة تنفيذ P2 — 20 أكتوبر 2026 — طباعة مالية حسب الصلاحية

- المستودع: `Report-Engainall/Nasr1`؛ الفرع `feat/p2-customer-return-intake-20261020`؛ PR [#18](https://github.com/Report-Engainall/Nasr1/pull/18) لا يزال OPEN؛ لا كتابة مباشرة إلى `main`.
- رأس الكود المثبت: `fb8390e9a4693f1d28247bab8fcb308408845284`.
- **اختبار SHA مطابق:** [GitHub Actions 39443178771](https://github.com/Report-Engainall/Nasr1/actions/runs/39443178771) — SUCCESS على SHA نفسه. نجحت خطوات frozen lockfile، Unit tests، migrations واختبارات القبول على PostgreSQL 17 المعزول، lint وفق إعداد workflow (باستثناء قاعدة Prettier الشاملة)، build، وproduction-preview smoke على 4173 وdev smoke على 5173.
- `IMPLEMENTED`: migration للطباعة المالية المحددة بالمؤسسة؛ RPCs لقوائم الفواتير/العملاء/الإشعارات الدائنة، وبيانات الفاتورة، وكشف الحساب؛ تحقق من مجاميع الفاتورة وبنودها؛ ملخص كشف الحساب محسوب من كامل دفتر العميل حسب العملة مع حدود واضحة لتفاصيل 200 فاتورة و500 دفعة و500 إشعار دائن؛ إظهار الإشعارات الدائنة المرحلة فقط في تخفيض الذمم.
- `INTEGRATED`: واجهة `FinanceDocumentPrintActions` ضمن مساحة الأستاذ العام `GeneralLedgerWorkspace`؛ أنماط RTL وطباعة المتصفح/حفظ PDF؛ تحقق payload آمن وDOM يعتمد `textContent` بدل تفسير بيانات المصدر HTML. مصدر طباعة الإشعار الدائن الموجود مسبقًا يعاد استخدامه بدل إنشاء مسار موازٍ.
- `TESTED_EXACT_SHA`: CI المذكور أعلاه غطى اختبار الوحدة والواجهة وقبول PostgreSQL للمحاسب/المدير والعميل العادي وعزل المؤسسة. RPCs الثلاثة تتحقق من الدور المالي على **الملف النشط نفسه**، وتستمد المؤسسة من ملف المستخدم الخادمي، ولا تقبل tenant ID من المتصفح. اختبار قاعدة البيانات يرفض العميل العادي والمستند الأجنبي، ويثبت أن إشعارًا دائنًا مرحّلًا يقلل إجمالي الذمم حسب العملة بالمبلغ نفسه قبل/بعد الترحيل.
- الملفات الجديدة: `supabase/migrations/20261020100000_staff_finance_document_print.sql`, `src/lib/finance-document-print.ts`, `src/components/FinanceDocumentPrintActions.tsx`, `src/test/finance-document-print.test.ts`, `src/test/finance-document-print-ui.test.tsx`. ملفات معدلة: `src/components/GeneralLedgerWorkspace.tsx`, `scripts/test-customer-returns.mjs`.
- فشل محفوظ لا يُحذف: Actions [39441610024](https://github.com/Report-Engainall/Nasr1/actions/runs/39441610024), [39442612711](https://github.com/Report-Engainall/Nasr1/actions/runs/39442612711), [39442912689](https://github.com/Report-Engainall/Nasr1/actions/runs/39442912689). الأولى كانت مقارنة صيغة مبلغ عربية محلية بنص رقمي لاتيني؛ الثانية افترضت خطأ أن كامل رصيد العميل يساوي فاتورة المصدر رغم وجود فواتير أخرى؛ الثالثة افترضت خطأ أن فاتورة المصدر تظهر ضمن أحدث 200 سجل. عولجت الاختبارات إلى فحص دلتا دفتر العميل قبل/بعد إشعار الائتمان وفحص علاقة الإشعار بالفاتورة، من دون توسيع حدود كشف التفاصيل أو تغيير الصلاحيات.
- `BROWSER_PROVEN = NOT RUN`: لم تُشغّل جلسة Playwright بمستخدم حقيقي على متصفح مستقل. `PRODUCTION_PROVEN = NOT RUN`: لم يتم ترحيل migration أو نشر/اختبار على قاعدة إنتاج. لا يُنقل PASS إلى أي رأس لاحق.
- الأرشيف المعتمد فقط هو `project-bolt-github-7sl6ykzz (2).zip` مع البصمات المحفوظة في سجل المصالحة؛ لم يُعد تنزيله أو استخراجه أو حساب بصماته. لا تعديلات على سجلات P1 أو ملفاته المقفلة أو harness الخاص به.
- **next_task_id الوحيد:** `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005` — تصميم وتنفيذ دورة مصالحة مخزون Onyx من معاينة محفوظة إلى تطبيق صريح قابل للتدقيق، مع منع تسوية خاطئة بين إجمالي المصدر ومخازن متعددة، ورفض التطبيق عند تغيّر المخزون بعد المعاينة، وتراجع تعويضي لا يمحو حركات أحدث. تبقى المهمة الأم للمواصفة مفتوحة؛ لا يُدّعى اكتمال المنتج كليًا.

---


# تحديث استئناف P2 — 20 أكتوبر 2026: استلام المرتجعات بعد الموافقة

- المهمة الجديدة: `NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002`. التغييرات في الفرع `feat/p2-customer-return-intake-20261020` وPR #18؛ رأس intake السابق `7244ad3ab9d37bf68a3ba2acd918455520798416` اجتاز [Action 39362085506](https://github.com/Report-Engainall/Nasr1/actions/runs/39362085506)، لكن هذا لا يثبت اختبارات التعديل الجديد الذي ينتظر CI.
- التنفيذ يتصل بمركز المهام الحي: عرض طلبات approved التي ما زالت لها كميات، تحديد مخزن المؤسسة، إدخال الكمية المستلمة والصالحة للمخزون، وتسجيل التالف منفصلًا. RPC يمنع المخزن الأجنبي وتجاوز الكمية/التكرار؛ حركة المخزون تُنفّذ ذريًا للكمية الصالحة فقط وتوثق بسجل تدقيق. الاستلام الكامل يغلق مهمة المخزن ويزيل الطلب من قائمة الانتظار.
- أضيفت migration وواجهة/validator واختبار وحدة، وتم تمديد اختبار PostgreSQL الموجود بدل تعديل harness المملوك لـ P1.
- ما لم يُنفّذ: إشعار دائن/رد مالي وقيد دفتر أستاذ مرتبطان بالمرتجع، واختبار متصفح مع حساب حقيقي وترحيل/نشر الإنتاج. جميعها NOT RUN أو مهمة لاحقة، ولا يُدعى اكتمال المحاسبة.
- الخطوة التالية بعد CI PASS: `NASR1-ORIGINAL-SPEC-RETURNS-CREDIT-MEMO-LEDGER-003`. بعدها تُعالج إدارة التصنيفات الإدارية الأصلية.
- سجل الأرشيف المعتمد الوحيد لا يتغير؛ لم يُفتح أي أرشيف قديم، ولم تُعدّل سجلات P1 أو main مباشرة.

---
# تقرير الاستئناف — المبرمج 2 / Bolt archive ثم المواصفة

## الحالة التنفيذية الحالية — 20 أكتوبر 2026

- المهمة الحالية: NASR1-ORIGINAL-SPEC-RETURNS-INTAKE-001 (CI_PENDING إلى أن يجتاز PR الرأس النهائي نفسه).
- الفرع: feat/p2-customer-return-intake-20261020؛ قاعدة المقارنة البرمجية: main SHA e815d1e01e5190220083e0593b8b9d152fc3783a. بعد إنشاء الفرع تقدم main إلى 0303cff02ff548aad74e68372bf02991237603af في تحديثات P1 لا تتقاطع مع ملفات كود هذه المهمة؛ تُنفذ اختبارات PR ضد main الحالي.
- ملخص الأرشيف المعتمد وقراراته: P2_SINGLE_ARCHIVE_RECONCILIATION_2026-10-20.md؛ فهرس البصمات: P2_SINGLE_ARCHIVE_MANIFEST_2026-10-20.csv؛ مصفوفة القرار لكل مسار من 22 مسارًا archive-only: P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv.
- قيد الأرشيف: ملف واحد فقط، project-bolt-github-7sl6ykzz (2).zip؛ 1,009,556 بايت؛ Git Blob 4835a0565f799a272dfca0ff49fbc3ce0d760474؛ SHA-256 1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1؛ CRC PASS؛ 359 ملفًا. لم نفتح أو نفحص نسختي Bolt القديمتين.
- فرق الأرشيف مقابل هدف SHA e815d1e01e5190220083e0593b8b9d152fc3783a: 270 تطابق محتوى، 67 مسارًا مختلفًا، 22 مسارًا archive-only، 168 target-only. لم تنسخ الصفحات القديمة التي لها مقابل في التطبيق الحي؛ استُبعدت متغيرات .env وSQL تعيين دور/كلمة مرور admin. إدارة التصنيفات الإدارية ما زالت فجوة موثقة؛ لم يُنسخ helper قديم مباشر الكتابة دون عقد صلاحيات.
- عمل المواصفة الأصلي الذي أضيف على الفرع: وحدة طلب مرتجع/قرار مراجعة في المخطط والواجهات الحية. تغييرات الكود الأساسية checkpoint 1ee787b27b536d3442bd49c69c5fbc6b166a95d (قبل تحديث ملفات التقارير). انظر ملف المصالحة لشرح التوافق والحدود.
- اختبارات جديدة: src/test/customer-returns.test.ts؛ scripts/test-customer-returns.mjs؛ test:db يشغل اختبار PostgreSQL الجديد بعد harness الأساسي. لم تُعتبر الاختبارات ناجحة قبل نتيجة CI على رأس PR النهائي. اختبار production/live tenant/browser غير منفذ.
- ملفات P1 المحمية وتقارير P1 ودفاترهم لم تُعدل. main وsource repository لم يكتب إليهما.
- task التالي بعد PASS: NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 — استلام وفحص فعلي، حركة مخزون حتمية، إشعار دائن وربط قيد/دفتر الأستاذ داخل معاملة idempotent منفصلة؛ ثم إدارة التصنيفات الإدارية target-native.

---

المستودع الهدف الوحيد: Report-Engainall/Nasr1.  
task الحالي الوحيد: NASR1-BOLT-ARCHIVE-DELTA-001.  
task التالي بعده مباشرة: NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 (الحالة الحية هي المرجع إذا تغير HEAD/المواصفة).

## دليل أرشيف Bolt المثبت — لا يعاد
- المصدر: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17
- Action التحقق: [39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493). هدف تاريخي SHA d20c1aced5f6595b1b2a81bb017c153a260c5a0d، مصدر مثبت b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure ZIP: 1,003,172 bytes؛ SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365؛ 359 عضوًا.
- Restored_Current ZIP: 997,589 bytes؛ SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214؛ 358 عضوًا.
- المقارنة: 717 عضوًا مجموعًا، 340 مطابقًا، 18 متغيرًا، عضو واحد Before-only؛ تنزيل/سلامة CRC/فحص المسارات الآمنة/الاستخراج المؤقت اجتازت الاختبار السابق.
- commit ميزة التحليل الناقصة: [55c1d970496c69db36d01197a109a5afd7c6aa04](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04); CI [39303848194 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194) على SHA المطابق. `get_store_executive_analytics` تم تكييفه إلى نموذج Nasr1؛ ثلاث RPCs أخرى كانت موجودة بالفعل بتنفيذ target-native أفضل.

## العمل الحالي
- افتح ARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md واستعمل البصمات/القرارات المسجلة. لا تعِد تنزيل ZIPs أو استخراجها أو إعادة حساب SHA/CRC أو إعادة تعداد جميع الأعضاء.
- راجع فقط rows الموسومة CHANGED / BEFORE_ONLY / PENDING أو التي لا تملك قرارًا مبرهنًا. إذا لم تحمل المصفوفة الدليل الدلالي اللازم، عالج عنصرًا واحدًا محددًا فقط من المادة التي سبق استخراجها؛ لا تعِد عملية الزوج كاملة. قارن كل اختلاف بالكود الحالي، ثم سجّل ALREADY_PRESENT_BETTER أو ADAPT_AND_INTEGRATE أو EXCLUDED_SECURITY أو INCOMPATIBLE_WITH_EVIDENCE مع path/source blob/tests/decision.
- تحقق من current HEAD/PR/CI metadata؛ لا تعتبر نجاحًا على SHA تاريخي نجاحًا للرأس الحالي. لا تحرر كود/مسار في PR يعمل عليه المبرمج 1. اقفل المسار عبر WORK_COORDINATION أو اعمل في ملفات مستقلة.

## الانتقال الإلزامي إلى المواصفة
عند إثبات حسم اختلافات الأرشيف، حدّث سجل الأرشيف، ثم تابع فورًا NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 من CURRENT_EXECUTION_STATE.md، دون توقف أو طلب موافقة. أكمل الواجهات والوظائف غير المنجزة تدريجيًا: كود/خدمة/DB/RLS/route/اختبار؛ لا mock/demo أو زر شكلي، ولا أرصدة وهمية ولا خدمات مدفوعة. لا تدّع Onyx/WhatsApp/production/browser proof دون اختبار مباشر.

## ملكية السجلات
هذا التقرير لك وحدك. أنت وحدك تعدل WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md. لا تعدل SOURCE_INTEGRATION_LEDGER.csv أو READY_TO_REUSE_FILE_AUDIT.csv أو تقرير المبرمج 1.

## الاختبار والتسليم
كل تعديل يحتاج unit/integration/DB/security المناسب وCI على SHA نفسه. غير المشغل NOT RUN. لا تحذف الفشل السابق؛ أضف إصلاحًا بدليل. احفظ commit/PR ورابط CI والمسارات والبصمات والنتائج، وحدّث next_task_id واحدًا فقط.


## Latest execution — 2026-10-19

- Archive decision task NASR1-BOLT-ARCHIVE-DELTA-001 is CLOSED. All 717 member rows are decided; 160 former review rows resolved across 83 unique target paths. ZIP files were not re-downloaded/rehashed; original integrity evidence remains Action 39294387493.
- Saved the restored Arabic master specification to docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt.
- Implemented ledger-derived income statement and cumulative balance sheet inside GeneralLedgerWorkspace using the already authorized tenant-scoped RPC. No fabricated opening balances or historical entries.
- Initial tests failed with 3 assertions on SHA 78cd809a4ce1d6486dfc2ea48219dc435bb3346d; failures are retained in EXECUTION_LOG. Test-only corrections passed exact-SHA Action 39320266809 on 869f0909bda0524275834952f64e1ce1609e79c0: 44/44 test files, 336/336 tests, PostgreSQL 17 migrations/acceptance, lint, build, preview/dev smoke PASS.
- Main remains at 0c089585d27665680dcc4ad2520dd4affc875804; PR #4 remains open; P1 PR #3 and owned files untouched. Browser proof and production migration/deployment proof NOT RUN.
- Parent task NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 remains open. Current next_task_id = NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004. Next: create target-native, idempotent cash-expense source journal drafts with explicit expense/settlement account selection and source-void/posting consistency guards.


## Latest task outcome — 2026-10-19

- `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004`: target-native cash-expense source linkage added in P2 PR #4. Code SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`, Action 39321543032 PASS: 45/45 tests files, 339/339 tests, PostgreSQL 17 migrations/repo-level DB acceptance, lint, build, preview/dev smoke.
- The linker reads real tenant-scoped expenses, demands explicit active expense + asset mapping, derives monetary value/date from source, creates only a draft until explicit posting, rejects unconfigured FX, protects against source modification and atomically handles source void via draft void or reversal journal.
- Exact CI proves migration application and full existing acceptance, but new-flow-specific DB behavior assertions are `NOT RUN`: `scripts/test-database-migrations.mjs` is currently P1-locked. A coordination request is recorded. Browser and production proof `NOT RUN`.
- Branch `feature/accounting-general-ledger-20261019`; PR #4 open. Main has not been modified. Archive task remains closed, original spec parent remains OPEN.
- `next_task_id = NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` under `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`.


## Latest execution — 2026-10-20 (P2; source-linked customer accounting)

- Closed `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` in code and acceptance tests.
- Migration: `supabase/migrations/20261020030000_accounting_customer_source_posting.sql`.
- UI: `src/components/CustomerInvoicePaymentJournalLinker.tsx`, registered in `GeneralLedgerWorkspace`; unit tests are in `src/test/customer-invoice-payment-journal-linker.test.tsx`; PostgreSQL acceptance is in `scripts/test-database-migrations.mjs`.
- Safety: invoice totals/tax derive from saved source; payment AR is inherited from the posted invoice journal; FX is rejected until policy exists; source edits/deletes are guarded; manager/admin reversal requires an audit reason, generates exact opposite debit/credit lines, and posts separately. It does not issue a cash refund.
- Feature SHA `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` passed [Action 39335571027](https://github.com/Report-Engainall/Nasr1/actions/runs/39335571027).
- Forward-merge commit `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` has parents P2 `f7526eeb...` and main `f7cffd41...`; it passed [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916).
- Failures retained: Action 39326813015 (stale error-message expectations) and 39335294442 (inbox page-one assumption). Corrections target the tests/readback only; guards and permission checks were not weakened.
- PR #6 is the delivery route; no direct write to main. Browser/live tenant/production proof: **NOT RUN**.
- `next_task_id = NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007`.

## 2026-10-20 — المراجعة الإضافية لمصادر NASR المستخرجة
- تقرير الأدلة الجديد: docs/bolt-source-reconciliation/P2_MULTI_PROJECTS_TRANSFER_REVIEW_2026-10-20.md.
- مصدر القراءة المتحقق: NASR-MULTI-PROJECTS-TRANSFER/main عند f7c0b8132f3e4bbe298c73d966ed6996b5cf989b؛ التقرير عند blob 1f5e589344251129e5d96ed2e0b4bf886c8222f1. تمت مقارنة شجرة المصدر مع Nasr1/main عند b54c87525d3b8c25c1d6ebf0c525636f82444ac1.
- ظهرت مفارقة تعداد: التقرير 2,044 ملفًا، والشجرة الحالية تعرض 2,011 blob داخل مجلدات الأرشيف التسعة (فارق 33). لم نعد استخراج الملفات ولم نصنف الفارق كفقد مثبت.
- ثبت تكرار الزوج 7wyze9ut: 35/35 ملفًا متتبعًا بنفس المسار وGit blob SHA، فوق تطابق SHA-256 للأرشيفين الذي يسجله التقرير.
- قدرات Onyx/التحليل/TaskCenter/Onyx export/price-grid CSV-XLSX/AI gateway المختارة مطابقة بالمحتوى مع Nasr1؛ لا نسخ مكرر. نسخة unified-import المانحة أقدم وتفتقد حراسات هدفية؛ أُخذ منها تحسين Unicode/Arabic header normalization فقط في فرع PR #18، مع اختبارات انحدار جديدة.
- التغييرات المستحدثة من هذه الجولة على فرع P2: src/lib/unified-import.ts وsrc/test/unified-import-safety.test.ts، مع تقرير المراجعة والتكليف الإضافي. CI النهائي الخاص بها PENDING حتى يجري على رأس الفرع بعد الحفظ الأخير؛ نجاح SHA سابق لا ينتقل إليها.
- لم يُنفّذ بعد controlled inventory apply/rollback ولا browser E2E source test؛ كليهما مسجل بالحدود والمخاطر في تقرير المراجعة. PR #12 لا يستخدم كدليل نجاح للخصوصية السعرية: Action 39339667293 فشل على SHA b3daf67de14c935fdafb0c2bf06c2f02e6be6ec5 ويحتاج قراءة سبب الفشل قبل أي قرار.
- لا يتغير مؤشر P2 التالي بهذه الإضافة: NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004. استكمال المراجعة الإضافية يستمر ضمن المهمة الأم ولا يبرر فتح next_task_id متوازٍ.


## 2026-10-20 — تحديث الأدلة بعد أول مراجعة للمصادر
- تحوّل تحسين تطبيع رؤوس الاستيراد من IMPLEMENTED إلى TESTED_EXACT_SHA=PASS على SHA 49fa336b6a04db3d3272ac78d78cc17b89bc7a89 عبر [Action 39437730603 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39437730603). يشمل دليل CI هذا وحدات الاختبار وPostgreSQL 17 migrations/acceptance والـlint/build وpreview/dev smoke؛ لا يثبت browser/production.
- رأس PR #18 بعد تحديثات الوثائق e7867d548bea5ee8529cdb8001f290b79da6c939 له Action 39438007926 وكان IN_PROGRESS عند آخر readback. أي commit وثائقي جديد سيغيّر الرأس ويستلزم فحص run المطابق الجديد.
- تم تشخيص فشل PR #12 من log Action 39339667293: migration 20261020040000_customer_price_visibility_controls.sql بها apostrophe مهربة بشرطة مائلة عكسية في نص COMMENT، وتسبب PostgreSQL syntax error at or near "s" عند character 15112. تم تعديلها إلى SQL-standard doubled quote customer''s في commit 6417e723a532b4bfd2c1a81c59ff6a78722ed721 على فرع PR #12؛ Action 39438180471 قيد التنفيذ عند آخر فحص. لا يُعلن نجاح الخصوصية السعرية قبل PASS على هذا الرأس أو successor tested.
- يظل next_task_id الوحيد في P2 هو NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004؛ تكليف المصادر الإضافي لا يغيّر ترتيب التنفيذ أو ملكية P1.
