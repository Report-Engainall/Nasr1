## P2 AI Gateway telemetry hardening — exact-SHA CI PASS (20 October 2026)

- Implemented in commit 05be5beb50c56e00ec9ee733b2089a259c3d0b3e; PR #18: https://github.com/Report-Engainall/Nasr1/pull/18
- TESTED_EXACT_SHA=PASS: Aghbari Commerce checks run 39459540700, exact head 05be5beb50c56e00ec9ee733b2089a259c3d0b3e. Workflow URL: https://github.com/Report-Engainall/Nasr1/actions/runs/39459540700. Verified frozen Bun lockfile, unit suite, PostgreSQL 17 migrations/workflow and standalone AI telemetry acceptance, lint, production-build preview smoke on port 4173, and dev smoke on port 5173. Logs include the AI measured/partial/unknown, no-provider, idempotency, quota-denial and service-only RPC acceptance PASS line.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED_EXACT_SHA=PASS. BROWSER_PROVEN=NOT RUN: Playwright workflow 39459540701 completed but its runner/test steps were skipped by the environment credentials gate; this is not browser evidence. PRODUCTION_PROVEN=NOT RUN: no production migration/deployment was performed.
- The new telemetry separates provider-observed token counts from conservative budget estimates. Failed attempts remain NULL at attempt level; quotas still count conservative reservations. No prompts, outputs, secrets, or raw provider error messages are persisted. Existing service-only RPC grants and tenant-derived attribution are retained.
- Current next_task_id: NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010. Related existing PR #12 is open at head 6417e723a532b4bfd2c1a81c59ff6a78722ed721; its exact-head CI run 39438180471 FAILS in the database workflow because public.enforce_customer_price_visibility_setting_authority() calls auth.role(), which is absent from the isolated PostgreSQL 17 acceptance database. This needs reconciliation before the price-privacy feature is considered integrated. Its diff also edits P1-locked scripts/test-database-migrations.mjs; P2 will not edit that protected harness.
- Donor archives remain read-only; no ZIP re-download/extraction/fingerprint recalculation. The 2,329-tree-entry vs 2,044-file extraction discrepancy remains unresolved.
- Tested application/test SHA: `c1e67c8fc006ad11f40af4547e5eb8afc34e12ae`. CI workflow **Aghbari Commerce checks** run [39452983497](https://github.com/Report-Engainall/Nasr1/actions/runs/39452983497) completed `success`; same-head evidence includes PostgreSQL 17 migrations/database acceptance and application build. Preserve this SHA association; it does not certify any later code SHA.
- `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Added `supabase/migrations/20261020120000_dqs_calendar_date_validity.sql` rather than rewriting historical migrations. The persisted DQS now rejects impossible calendar dates and mixed separators, requires a nonblank matching key for temporal integrity, falls back to the matching key for empty required-field lists, and includes cost in numeric-consistency scoring to match the client accumulator. Client scoring uses actual month/day/leap-year validation.
- DQS acceptance mutates only its own CI import-job fixtures, verifies `2026-02-31` reduces temporal integrity and aggregate DQS, checks leap-day formats and blank matching-key behavior, then restores original row values before the existing finalization and saved Onyx-snapshot assertions. CSV adversarial tests cover `= + - @`, leading controls/whitespace and ordinary labels. XLSX string cells remain inline strings, not executable formula cells, where covered by the target export test suite.
- `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; the separate Playwright gate records its missing dedicated non-production Supabase secrets and never claims a browser pass. `PRODUCTION_PROVEN=NOT RUN`.
- Archive fingerprints and integration decisions were reused. No donor archive was re-downloaded or re-extracted. The recorded source-tree/extraction-report discrepancy (2,329 tree entries vs 2,044 reported extracted files) remains unresolved and is not reclassified as reconciled.
- The finance print, Onyx reconciliation, task-center filter/print parity, and browser gate proofs remain separate; none is promoted to a higher proof state by this DQS run.
- **next_task_id الوحيد:** `NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009` — inspect AI provider routing, permission enforcement, usage/audit persistence, quota/rate limiting, privacy/minimal payloads and fail-closed behavior, and verify tests against the actual schema without touching P1-locked API/workflow paths.

## P2 readback — Task-center print parity and browser-test gate — 20 October 2026

- Branch: `feat/p2-customer-return-intake-20261020`; PR #18: https://github.com/Report-Engainall/Nasr1/pull/18.
- Exact tested application-code SHA for this batch: `d9590e4b8aefed27682a14c1915e26661e31e575`. GitHub Actions [39452487876](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487876) completed `SUCCESS`: frozen Bun lockfile, unit tests, PostgreSQL 17 migration/acceptance, Lint, production build, production-preview smoke (4173), and dev-server smoke (5173).
- `NASR1-ORIGINAL-SPEC-TASK-CENTER-PRINT-FILTER-PARITY-007`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Files changed: `src/components/TaskCenter.tsx`, `src/lib/task-print.ts`, `src/test/task-print.test.ts`. The print scope supports the exact currently displayed results (role + status + priority + assignee + date range + search), all rows allowed to the active account, or a selected allowed role. The print helper rechecks allowed roles; the print list shares the current non-role filters.
- Browser E2E suite/workflow: `IMPLEMENTED` but `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`. The exact-head run [39452487724](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487724) explicitly gated execution because dedicated non-production Supabase URL/key, two users from different organizations, test phone, and the affirmative non-production-write confirmation are absent. Setup, Chromium, built app, and Playwright steps were skipped by this gate; the job's green status is a gate success, **not** a browser test pass. No test order was created and production was not touched. To unblock, follow `docs/bolt-source-reconciliation/P2_PLAYWRIGHT_E2E_SETUP.md`.
- Onyx reconciliation remains `TESTED_EXACT_SHA` at `acadfb1321166ef5246f83ddb7703ca8a9650cb6`, run [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958); print-parity changes did not modify its database/RPC code. This database CI is not browser or production proof.
- Archive review reused existing manifest/fingerprint and source integration evidence. No donor ZIP was redownloaded, extracted, or rehashed. The source recursive-tree/extraction-report discrepancy remains unresolved evidence (2,329 tree entries versus 2,044 reported extracted files); it is not silently treated as reconciled.
- Status axes remain separate: `IMPLEMENTED` is not `INTEGRATED`; `TESTED_EXACT_SHA` is not `BROWSER_PROVEN`; `BROWSER_PROVEN` is not `PRODUCTION_PROVEN`.
- Historical next-task checkpoint (superseded after CI proof): `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008` — trace DQS scoring into persisted import/snapshot records and the user-facing flow; validate CSV/XLSX formula-injection handling and parser bounds with adversarial tests; remediate only demonstrable target-side gaps while preserving P1 ownership/locks.

## P2 readback — Onyx reconciliation CI result — 20 October 2026

- `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`.
- Exact tested application-code SHA: `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; GitHub Actions [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) completed `SUCCESS`. The workflow completed unit tests, isolated PostgreSQL 17 migration/acceptance, lint (repository-wide Prettier rule excluded by workflow), build, preview smoke (4173), and dev smoke (5173). The database acceptance includes role/tenant denial, unscoped source denial, reservation and stale-stock rejection, idempotency, successful apply and compensating rollback, and refusal to roll back over later movement history.
- Current PR #18 HEAD is a documentation-only successor to `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; subsequent commits in this sequence only updated P2 documentation/state records and did not change application code. Read the live PR metadata for the current HEAD rather than relying on a SHA copied into this note. The workflow is verified for the exact application-code SHA above; **do not label the later documentation HEAD as CI-tested**, because the workflow did not trigger for documentation-only updates.
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

## آخر تنفيذ P2 — NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 (CI_PENDING)

- المرحلة السابقة لطلب المرتجع/قرار المراجعة اجتازت CI على الرأس الدقيق `7244ad3ab9d37bf68a3ba2acd918455520798416` — [Action 39362085506](https://github.com/Report-Engainall/Nasr1/actions/runs/39362085506). هذا الإثبات لا يغطي إضافة الاستلام الحالية.
- الفرع: `feat/p2-customer-return-intake-20261020`؛ جميع التعديلات في PR #18 المفتوح ولا توجد كتابة مباشرة إلى `main`.
- نُفّذت وحدة الاستلام الفيزيائي بعد موافقة المدير: قائمة المخازن النشطة وطلبات الموافقة ذات الكمية المتبقية؛ تسجيل المستلم والصالح للمخزون؛ احتساب التالف من الفرق؛ حركة مخزون للكمية الصالحة فقط؛ تحديث حالة الطلب وإغلاق مهمة المخزن عند إكمال كل الكميات؛ سجل تدقيق؛ idempotency/replay/conflict ومنع تجاوز الكمية المعتمدة.
- الملفات الجديدة: `supabase/migrations/20261020060000_customer_return_receipts.sql`, `src/components/CustomerReturnReceiptQueue.tsx`, `src/lib/customer-return-receipts.ts`, `src/test/customer-return-receipts.test.ts`. عُدّل `src/components/TaskCenter.tsx` لدمج الوحدة في مركز المهام الحالي، وعُزّز `scripts/test-customer-returns.mjs` باختبارات PostgreSQL خاصة بالاستلام.
- تحقق قبول قاعدة البيانات يتضمن الاستلام الجزئي ثم النهائي، المخزن الأجنبي، replay، عدم تكرار الحركات، عدم دخول التالف للمخزون، إكمال مهمة المخزن وخروج الطلب المكتمل من قائمة الانتظار.
- لا ينشأ إشعار دائن أو قيد دفتر أستاذ أو ردّ مالي في هذه المرحلة؛ يلزم تنفيذ الربط المحاسبي بشكل منفصل من مصدر موثوق ومبالغ خادمية وموافقة واضحة.
- أوامر الاختبار المحلية غير متاحة دون checkout: `npm/git/PostgreSQL local = NOT RUN`. CI الخاص بالإضافة الحالية `PENDING`; المتصفح بحساب فعلي، وترحيل قاعدة الإنتاج والنشر `NOT RUN`.
- الخطوة التالية بعد قبول هذه المرحلة: `NASR1-ORIGINAL-SPEC-RETURNS-CREDIT-MEMO-LEDGER-003`، ثم فجوة إدارة التصنيفات الإدارية بعقد tenant/RPC.
- مصدر Bolt الوحيد يظل `project-bolt-github-7sl6ykzz (2).zip`, 1,009,556 bytes, blob SHA-1 `4835a0565f799a272dfca0ff49fbc3ce0d760474`, SHA-256 `1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1`. لا استخدام أو مقارنة لأي أرشيف Bolt قديم.
- لم تُعدل ملفات P1 المحمية أو سجلاتهم: `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv`, `PROGRAMMER_1_CURRENT_REPORT.md`.

---

## آخر تنفيذ P2 — NASR1-ORIGINAL-SPEC-RETURNS-INTAKE-001 (CI_PENDING)

- المستودع الهدف الوحيد: Report-Engainall/Nasr1. فرع P2: feat/p2-customer-return-intake-20261020. التعديلات محفوظة على الفرع؛ لا كتابة مباشرة على main.
- أساس الكود الذي يحتوي تغييرات المرتجعات قبل توثيق الإقلاع: 1ee787b27b536d3442bd49c69c5fbc6b166a95d. الرأس الحالي للفرع يتقدم بملفات التقرير بعد هذا المعلم؛ رأس main الذي عوين لاحقًا هو 0303cff02ff548aad74e68372bf02991237603af مع Action 39361436541 SUCCESS (هذا PASS خاص بـ main وليس دليلًا على تغييرات P2).
- PR P2: pending creation when this section was written; يجب تحديث رابط PR وقراءة Actions على الرأس النهائي نفسه بعد الإنشاء. لا يوجد ادعاء بأن اختبارات تغييرات المرتجعات نجحت قبل دليل CI.
- الأرشيف المعتمد فقط: report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/project-bolt-github-7sl6ykzz (2).zip. الحجم 1,009,556؛ Git Blob SHA-1 4835a0565f799a272dfca0ff49fbc3ce0d760474؛ SHA-256 1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1؛ 421 إدخالًا و359 ملفًا و3,322,389 بايت بعد فك الضغط؛ CRC PASS ولا توجد مسارات مكررة/اجتياز/روابط رمزية في الفحص. لم يُفتح أي أرشيف Bolt آخر.
- مقارنة محتوى الأرشيف المسموح فقط بقاعدة Nasr1 على SHA e815d1e01e5190220083e0593b8b9d152fc3783a: 270 متطابقًا، 67 مختلفًا، 22 أرشيف-فقط، 168 هدف-فقط. القرارات الفردية في P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv، والبصمات/الحجوم في P2_SINGLE_ARCHIVE_MANIFEST_2026-10-20.csv. لا تُنسخ .env أو SQL منح دور admin/تعيين كلمة مرور؛ صفحات المقارنة والمفضلة والمساعد والتحليلات والعمليات التي لها مقابل حي تُترك للتنفيذ الحالي.
- التغييرات: supabase/migrations/20261020050000_customer_return_requests.sql؛ src/lib/customer-returns.ts؛ src/components/CustomerReturnRequest.tsx؛ src/components/CustomerReturnReviewQueue.tsx؛ src/components/CustomerOrders.tsx؛ src/components/TaskCenter.tsx؛ src/test/customer-returns.test.ts؛ scripts/test-customer-returns.mjs؛ package.json؛ تقارير P2 الثلاثة وملفات التنسيق/السجل أدناه. لا تغييرات في ملفات P1 المقفلة أو src/lib/api.ts أو src/components/AghbariApp.tsx أو src/routeTree.gen.ts أو CI workflow.
- سلوك المرتجعات: طلب عميل أصلي مؤهل وطلبه مسلّم فقط، تطابق المؤسسة والعميل والصنف، حد الكمية المتبقية، idempotency/conflict، RLS للمالك والمدير فقط، قرار مدير بمبرر ومراجعة مدققة، ومهمة استلام/فحص مخزنية بعد الموافقة. لا توجد حركة مخزون أو إشعار دائن/قيد أو رد مالي عند تقديم الطلب أو الموافقة. اختبارات unit وPostgreSQL أضيفت لكنها تنتظر Action على PR النهائي.
- Live DB / authenticated browser E2E / production migration / deployment: NOT RUN.
- next_task_id = NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 بعد اجتياز قبول هذه المرحلة؛ ثم إغلاق فجوة إدارة التصنيفات الإدارية الأصلية مع عقد RPC ومسار تنقل محمي. تبقى مهمة P2 للخصوصية السعرية في PR #12 منفصلة ومفتوحة حتى إثباتها أو تعديل حالتها بدليل حي.



## آخر تنفيذ P2 — NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004 (PASS)

- Branch/PR: `feature/accounting-general-ledger-20261019`, [PR #4](https://github.com/Report-Engainall/Nasr1/pull/4). Main remains `0c089585d27665680dcc4ad2520dd4affc875804`; no direct main changes.
- Exact code SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b` passed [Actions 39321543032 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39321543032): 45/45 test files, 339/339 tests, frozen Bun lock check, all migrations + current database acceptance on PostgreSQL 17, lint, build, preview smoke 4173, dev smoke 5173.
- New DB migration `supabase/migrations/20261020020000_accounting_source_posting.sql` creates immutable tenant-scoped source/journal links, an authorized paginated expense-to-ledger inbox, explicit account-mapped journal draft creation, repeat-safe source linking, a pre-post guard against source/mapping changes, and same-transaction void handling (void linked draft or write a balanced reversal when original entry is posted). The posting guard reads the source without locking it to avoid journal-first/source-first deadlock; creation/void preserve source-first lock order.
- UI `src/components/CashExpenseJournalLinker.tsx` is integrated into the live `GeneralLedgerWorkspace`. Accountant/manager/admin picks an active expense account and asset settlement account; server uses the source amount/date, creates a draft only, and requires a separate post action. YER only until documented FX policy exists. Tests cover source-ID and account selection, explicit draft RPC, foreign-currency rejection and customer-role denial. Source-specific DB workflow assertions were not added to the P1-owned migration harness; CI proves migrations apply and all preexisting DB acceptance passes, but dedicated DB assertions for this new source-posting flow are still **NOT RUN**.
- Concurrency correction at the same tested SHA: posting trigger no longer row-locks the source expense after locking its journal entry, preventing lock-order inversion against source-void. No old financial transactions were invented, no service/dependency with new cost was added.
- Status: IMPLEMENTED=YES (cash-expense source posting path); INTEGRATED=YES on PR branch; TESTED=PASS exact SHA for unit suite/build/migration application and repo-level acceptance; source-flow-specific DB integration test=NOT RUN; browser-authenticated proof=NOT RUN; production migration/deployment=NOT RUN.
- **next_task_id = `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006`**, parent `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`. Next extend source mapping to actual customer invoices and payments as separate source kinds with invoice/payment-specific accounting rules, source event idempotency, tenant/account guard, no double-counting and explicit treatment of refund/void. Do not mark cash posting's flow-specific DB assertions as proven until they run in a future acceptance harness update approved by P1.

---



## Latest execution state — 2026-10-19 — P2 archive closure and financial statements

- Target repository: Report-Engainall/Nasr1. Main remains at 0c089585d27665680dcc4ad2520dd4affc875804. Work is only on feature/accounting-general-ledger-20261019 / PR #4: https://github.com/Report-Engainall/Nasr1/pull/4.
- Archive task NASR1-BOLT-ARCHIVE-DELTA-001 is CLOSED. All 160 formerly pending member decisions are recorded: 122 changed-content rows / 64 unique paths, plus 38 missing-candidate rows / 19 unique paths. Final 717-row counts: 548 exact, 8 security excluded, 1 previously adapted, 87 target already better, 33 reference-only, 40 incompatible with evidence. Pending review statuses = 0. Reused original ZIP verification Action 39294387493; no redownload, rehash, CRC, extraction, or re-enumeration was repeated.
- Saved the unified Arabic master specification verbatim at docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt. Saving the document is not a claim that all of its requirements are implemented.
- Implemented an income statement and cumulative balance sheet in the existing GeneralLedgerWorkspace, using the authorized fetch_general_ledger RPC for both period and as-of aggregates. Arithmetic uses BigInt minor units; balancing differences remain visible. Only posted ledger entries are included; no historical ledger entries or opening balances are fabricated.
- CI record: SHA 78cd809a4ce1d6486dfc2ea48219dc435bb3346d failed three test assertions in Action 39319700563: stale Arabic date-error regex, duplicate correct amount text, and a brittle role-denial matcher. Failures remain documented. Tests were corrected and exact SHA 869f0909bda0524275834952f64e1ce1609e79c0 passed Action 39320266809: 44/44 test files, 336/336 tests; frozen Bun lock verification; PostgreSQL 17 migrations/acceptance; lint; build; preview smoke port 4173; dev smoke port 5173.
- P1 coordination: PR #3 is open at bf31eea06d020955b0912d252087c72f98e023f5. P2 did not edit P1-owned code paths or reports/ledgers. Browser proof with a real authenticated user and production migration/deployment proof remain NOT RUN.
- Current next_task_id = NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004 under parent NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002. Build explicit, tenant-scoped, source-amount-derived cash-expense journal drafts with idempotent source linkage and guards against voiding a source after journal posting. The parent specification task remains OPEN.

---

# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

## تحديث تنفيذي 2026-10-19 — NASR1-ORIGINAL-SPEC-ACCOUNTING-GENERAL-LEDGER-003

- آخر HEAD حي لفرع `main` عند التحقق: `0c089585d27665680dcc4ad2520dd4affc875804`؛ CI مطابق [39311791227 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227). لم يُغيَّر main أثناء إعداد هذه الوحدة.
- التنفيذ على الفرع المعزول `feature/accounting-general-ledger-20261019` ضمن [PR #4](https://github.com/Report-Engainall/Nasr1/pull/4)، رأس الاختبار النهائي `190497591d6451ca69d26da41034a3e5558fd58f`.
- CI مطابق للرأس: [Actions 39314610222 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39314610222): 42/42 ملفات اختبار و330/330 اختبار؛ frozen Bun lockfile check؛ وحدات Vitest؛ جميع migrations وقبول سير العمل على PostgreSQL 17؛ lint؛ build؛ production-preview smoke على 4173؛ dev smoke على 5173. قبول قاعدة البيانات طبع `PASS general ledger: chart idempotency, exact two-decimal amounts, balanced draft/post, replay safety, audited draft cancellation, trial balance and tenant/role isolation`.
- التنفيذ: دليل حسابات مرتبط بالمؤسسة (asset/liability/equity/revenue/expense)، قيود مزدوجة draft/post/void، تحقق نقدي خادمي بمنزلتين عشريتين، منع تكرار مع تعارض الحمولة، صلاحيات/RLS ومنع DML المباشر، سجل تدقيق، دفتر قيود وميزان مراجعة من قيود حقيقية مرحّلة فقط، وواجهة مربوطة بصفحة المالية الحالية.
- لا أرصدة افتتاحية أو قيود تاريخية أو فواتير demo. الربط التلقائي المستقبلي بإنشاء الفواتير/الدفعات/المصروفات/استلام المشتريات/Onyx ومطابقة المصدر المحاسبي **لم يُنفّذ في هذه الوحدة**، ويظل عملًا لاحقًا مستقلًا.
- الأدلة: `IMPLEMENTED=YES`; `INTEGRATED=YES (PR branch only)`; `TESTED=PASS exact SHA`; `BROWSER-PROVEN=NOT RUN`; `PRODUCTION-PROVEN=NOT RUN`; `PRODUCTION_MIGRATION=NOT RUN`. نجاح CI لا يثبت نشر ترحيل الإنتاج أو اختبار متصفح بحساب حقيقي.
- عولجت إخفاقات الوسيط دون حذف اختبارات: عدّ القيود كان يحسب السطور بدل القيود، ثم تم إصلاح محدد SQL لدالة الإلغاء، ثم وُضع فحص audit_logs في سياق مدير مخوّل بدل توسيع صلاحيات الجدول. التشغيل النهائي المشار إليه أعلاه نجح.
- `next_task_id = NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` ما زال مفتوحًا؛ هذه وحدة محاسبة أساسية مكتملة الاختبار، وليست إكمالًا شاملًا لكل واجهات المواصفة.

**المستودع والفرع:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main` فقط.
**آخر SHA يحوي الكود الوظيفي واجتاز CI الكامل:** `2986f59c3350f313eaa53b529a7507da47192773` — [commit](https://github.com/Report-Engainall/Nasr1/commit/2986f59c3350f313eaa53b529a7507da47192773).
**CI المطابق لآخر كود وظيفي:** [GitHub Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500) على SHA `2986f59c3350f313eaa53b529a7507da47192773`: **41/41 ملف اختبار و317/317 اختبار**؛ migrations وRLS وقبول سير العمل على PostgreSQL 17؛ lint؛ build؛ production preview smoke على 4173؛ dev smoke على 5173. هذا إثبات CI وليس اختبار متصفح تفاعليًا بحساب فعلي أو نشرًا إنتاجيًا.
**دمج أرشيف Bolt — 19 أكتوبر:** تم التحقق من الأرشيفين في [Action 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493): 717 عضوًا، 340 مطابقًا، 18 متغيرًا، وواحد Before-only. دُمجت قدرة تحليل مبيعات المتجر الناقصة تكييفًا في `get_store_executive_analytics` وربطت فعليًا بشاشة التقارير؛ ثلاث RPCs مانحة أخرى كانت موجودة بالفعل بإصدارات أفضل. سجل القرارات: [ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md](ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md). لا SQL قديمة من الأرشيف نُفذت أو نُسخت مباشرة.
**التصنيف والبحث:** مسارات `/categories` و`/category/$slug` و`/category/$slug/subcategory/$subcategorySlug` و`/search` و`/search/advanced` مسجلة في `src/routeTree.gen.ts`. اختبار السلوك يثبت فتح تصنيف مصدر حقيقي، رفض child غير التابع، البحث حسب التصنيف، وتطبيق فلتر الرصيد المعروف على كتالوج النتائج. مسارا البحث المتقدم والتصنيف الفرعي مساران مباشران، لا fallback ضمني إلى شاشة الأب.
**فلتر المخزون المعروف:** عند طلب `/catalog?available=1` يعرض الكتالوج أصنافًا ذات `quantity_available` رقمية ومحددة وأكبر من صفر فقط؛ القيم المجهولة/غير الصالحة والصفر لا تدخل النتائج. يظهر بيان فلتر فعّال وإجراء لإزالته مع الحفاظ على شروط البحث والتصنيف الأخرى. الاختبار المطابق جزء من CI أعلاه.
**التقارير وOnyx:** لوحة لقطة المصدر داخل التقارير التنفيذية تعتمد على snapshots/RPC المخولة، تعرض hash واسم الملف والفترة والجودة والمؤشرات المصدرية، وتفصلها عن مبيعات المتجر؛ لا تدعي اتصالًا حيًا خارجيًا.
**الأسعار والمخزون:** شبكة الإدارة تدعم CSV/XLSX مع معاينة مسودات قبل الحفظ وتصدير صفوف الخادم المحفوظة، وملخص مخزون مخول للقراءة فقط. الرصيد غير المسجل يبقى مجهولًا، لا صفرًا افتراضيًا.
**المشتريات والاستلام:** `/admin/purchase-orders` واجهة TanStack فعلية لإنشاء مسودة أمر شراء من مورد/مخزن/صنف حقيقي، ثم اعتماد داخلي، وإلغاء مسبب، واستلام جزئي/كامل. `20261019230000_purchase_orders_and_receiving.sql` يضيف جداول PO/receipt وبنودها، RPCs محكومة بالمؤسسة، مفاتيح منع تكرار، سجل تدقيق وحركات مخزون ذرية، ومهمة مخزن idempotent تُغلق بعد الاستلام الكامل. التكلفة غير المسجلة تظل NULL؛ الاعتماد لا يرسل رسالة للمورد. التفاصيل والدليل في `ORIGINAL_SPEC_FEATURE_INTEGRATION_2026-10-19.md`.
**العروض والطلبات:** خصم الحملة يُحسب خادميًا مع حد تكلفة الصنف وتُحفظ لقطة الحملة/الخصم في بنود الطلب والفاتورة. لا فواتير تاريخية مختلقة ولا بيانات demo.
**أرشيفا Bolt:** تحقق مستقل ناجح في [Action 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493) على نسخة هدف تاريخية SHA `d20c1aced5f6595b1b2a81bb017c153a260c5a0d` ومصدر مثبت `b1ca62ec277ff9f55c8e850e0470d61d81aaa138`: كلا ZIP نزّل HTTP 200، تطابق الحجم وGit blob SHA-1 وSHA-256، واجتاز CRC وفك الضغط والمسارات الآمنة والاستخراج المؤقت خارج التطبيق. المقارنة: 717 عنصرًا، 340 مطابقًا، 18 متغيرًا، وواحد Before-only؛ لم تُشغّل ملفات الأرشيف ولم تُطبق SQL منها.
**مراجعة المصادر:** تدقيق المرشحين الـ69 وقراراتهم في `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` وسجل الدمج. تدقيق البصمات ليس دليل تشغيل كل ملف مانح.
**الفروع وPRs:** `main` و`recovery/bolt-snapshot-2026-10-17` تمت مراجعتهما؛ PR #1 ما يزال Draft وغير مدمج. لا force-push.
**تصنيف الإثبات الحالي:** purchase orders + receiving = IMPLEMENTED=YES؛ INTEGRATED=YES؛ TESTED=PASS على SHA `2986f59c3350f313eaa53b529a7507da47192773` عبر Actions `39309895500`؛ BROWSER-PROVEN=NOT RUN (فقط preview/dev HTTP smoke)؛ PRODUCTION-PROVEN=NOT RUN؛ نشر ترحيلات الإنتاج=NOT RUN. المسارات الأخرى تحتفظ بالأدلة التاريخية المحددة في كل سجل.
**المهمة الأشمل تبقى مفتوحة:** `next_task_id = NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`. تم إغلاق جزء اكتشاف الكتالوج والفلتر بدليل، وليس كل بنود المواصفة. أكمل وحدة محددة في كل دفعة مع الاختبار وSHA متطابقين.


## تنفيذ مباشر 2026-10-19 — مسارات المصادقة وسجل المصروفات

- `/register` و`/forgot-password` أصبحا مسارين TanStack فعليين، ويعيدان استخدام تدفق `Login` الموجود بدل إنشاء مخزن مصادقة آخر. أُضيف اختبار UI لكل مسار، وأُدرج التحقق من العنوان في production-preview وdev smoke.
- سجل المصروفات النقدية `cash_expenses` تكامل مكيّف من المرشح القديم `0032_finance_invoices_cash_expenses.sql`؛ لم يُنسخ عقد `branches/cash_accounts/operational_invoices` غير المتوافق. الجديد مربوط بـ`StaffFinancePage`، مع صلاحية مالية خادمية، عزل المؤسسة، إدخال مبلغ دقيق بمنزلتين عشريتين، مفتاح منع تكرار مربوط بالحمولة، تدقيق، إلغاء غير هدّام، حظر DML المباشر، بحث/تاريخ/حالة/ترقيم صفحات وطباعة الصفحة المفلترة.
- ترحيل الاختبار المعزول `20261019100000_finance_cash_expenses.sql` واختبارات الوحدة/قبول قاعدة البيانات اجتازت CI المطابق أعلاه. هذا إثبات CI على PostgreSQL 17؛ ترحيل الإنتاج وفتح المتصفح الفعلي والإنتاج الحي `NOT RUN / NOT PROVEN`.
- محاولات إعادة تنزيل أرشيفي Bolt في جلسة 2026-10-19 فشلت: GitHub fetch أعاد HTTP 400 بنص “GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)” لكل رابط raw ZIP؛ وجلب الشبكة من بيئة التشغيل أعاد `URLError <urlopen error [Errno -3] Temporary failure in name resolution>`. أدلة SHA-256/CRC والاستخراج الآمن السابقة تخص Actions `39157355307` فقط، ولا تدّعي نجاح إعادة التنزيل الآن.
- أُغلقت `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`: تمت مراجعة عقود وقرارات الصفوف الـ69 وتسجيل كل قرار في الجرد والدفتر. هذا لا يعني تنفيذ أو تشغيل كل كود مانح؛ كل اختبار مانح لم يُشغّل موصوف بأنه NOT RUN.
- حالة إثبات المصروفات: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA c3e4e3da71bedd9c8495fd5bd8cf901c6aee5d25; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; PRODUCTION-MIGRATION=NOT RUN.

## آخر إنجاز برمجي حقيقي
- أضيف اختبار حدّ قاعدة بيانات حقيقي لكشف العميل: ينشئ 205 فواتير و505 دفعات، ثم يثبت بقاء قوائم التفاصيل محدودة إلى 200/500 بينما الملخص المالي يظل شاملاً للسجل كله.
- أضيفت فاتورة ملغاة بقيمة 900.00 ودفعة مرتبطة بها بقيمة 500.00 إلى الاختبار؛ المجموعات الكاملة لا تتغير بسبب الفاتورة الملغاة أو دفعتها، ولا تدخل في رصيد المتأخر.
- تصحيحات الاختبار: المقارنات المالية تستخدم `BigInt` بوحدات نقدية صغرى، لتجنب أخطاء floating-point؛ وتم إصلاح regex إدخال الكسور العشرية. لا تخفيف للاختبار.
- [Exact-SHA CI 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395) اجتاز unit tests، PostgreSQL 17، lint، build، preview smoke وdev smoke.

## تحديث READY_TO_REUSE
- المرآة: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تتضمن 10 ملفات؛ تم تحديث `scripts/test-database-migrations.mjs` في المرآة إلى blob `08193e20f311e82d87a3873ef4cf40ee800dc11a` والـmanifest يشير إلى commit المختبر `618e3d3c019ecd7d05ca0462ca954f908178b814`.
- مصدر الكود اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395). تحديث المرآة اجتاز CI المطابق: [Actions 39150638459 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150638459).
- `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الخاص بالمانحين لم يُعدّل.

## أعمال مكتملة — لا تعِد فحصها دون سبب جديد
- مركز المهام والأحداث ومنع التكرار والإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- RPC أعمار الذمم للمؤسسة والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة RTL/A4 واختبار UI: [39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) — SUCCESS.
- مبالغ PDF غير الممكنة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- حالة التأخر وتاريخ الاستحقاق في PDF: [39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217)، [39146074209](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209) — SUCCESS.
- ملخص كشف العميل الكامل واختبارات العملات/الملخص: [39148856503 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503).
- حدّ 200/500، exact-minor arithmetic، واستبعاد الفاتورة الملغاة مع دفعتها: [39150380395 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395).

## نتيجة NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001

- Source: Report-Engainall/report-insight-engine@b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure.zip: 1,003,172 bytes; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; 359 members; CRC/decompression/safe extraction PASS.
- Restored_Current.zip: 997,589 bytes; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; 358 members; CRC/decompression/safe extraction PASS.
- Pair comparison: 340 identical, 18 changed, 1 before-only. Member inventory 717 rows. Archive content was not executed; no archived SQL applied.
- Evidence: ARCHIVE_MANIFEST.csv, ARCHIVE_MEMBERS.csv, ARCHIVE_PAIR_DIFF.csv, READY_TO_REUSE_FILE_AUDIT.csv, SOURCE_INTEGRATION_LEDGER.csv.
- READY_TO_REUSE path/blob audit: 4 exact, 2 differing target contents, 63 target paths missing at the audited SHA. This does NOT mean every donor feature was missing. All 69 candidates have documented per-row decisions in READY_TO_REUSE_FILE_AUDIT.csv and SOURCE_INTEGRATION_LEDGER.csv. Cash expenses were adapted and tested through target-native migration supabase/migrations/20261019100000_finance_cash_expenses.sql (Actions 39171703391); Onyx UI/analytics and role-scoped Task Center print were integrated and tested on current code SHA (Actions 39173352654). Donor modules not integrated were not run.
- The legacy audit screen was adapted to active route /admin/audit with actual columns, same-tenant admin/manager SELECT RLS, no direct authenticated DML, search and filtered printing. Code SHA bb08320b690203f7f9b1ce65287e389e847c2dea passed Actions run 39154450426.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on that exact code SHA. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. Production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.

## تكامل دلالي جزئي مثبت — تحقق مدخلات التحصيل

- تمت مراجعة المرشح `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/finance.ts` بدل نسخه كاملًا؛ عقده القديم `requireSupabase` وواجهات خدمته لا تطابق معمارية Nasr1 الحالية.
- كُيّفت قواعد التحقق الملائمة في `src/lib/finance-input.ts` ووُصلت فعليًا بنموذج التحصيل في `src/components/CustomerWorkflows.tsx`: المبلغ موجب بمنزلتين عشريتين، منع الصيغ الأسية/القيم غير الآمنة، حصر طرق الدفع في الخيارات الحالية، وحدود مرجع العملية والملاحظات.
- أضيفت `src/test/finance-input.test.ts` لاختبار الحدود السليمة والرفض. فحص الخادم/المعاملة ما زال المرجع الحاكم لحالة الفاتورة والرصيد المستحق وعزل المؤسسة؛ تحقق الواجهة دفاع إضافي وليس بديلًا عنه.
- [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840) على SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`: unit tests وPostgreSQL 17 migrations/RLS وlint/build وpreview/dev smoke PASS.
- هذا قرار `ADAPTED_PARTIAL_INTEGRATION` لمرشح واحد فقط؛ لا يعني دمج خدمة finance.ts كاملة ولا إغلاق مراجعة 69 ملفًا.

## نتيجة NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001

- Source: Report-Engainall/report-insight-engine@b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure.zip: 1,003,172 bytes; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; 359 members; CRC/decompression/safe extraction PASS.
- Restored_Current.zip: 997,589 bytes; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; 358 members; CRC/decompression/safe extraction PASS.
- Pair comparison: 340 identical, 18 changed, 1 before-only. Member inventory 717 rows. Archive content was not executed; no archived SQL applied.
- Evidence: ARCHIVE_MANIFEST.csv, ARCHIVE_MEMBERS.csv, ARCHIVE_PAIR_DIFF.csv, READY_TO_REUSE_FILE_AUDIT.csv, SOURCE_INTEGRATION_LEDGER.csv.
- READY_TO_REUSE path/blob audit: 4 exact, 2 differing target contents, 63 target paths missing. This does NOT mean every donor feature is absent; semantic review of all 69 rows remains incomplete.
- The legacy audit screen was adapted to active route /admin/audit with actual columns, same-tenant admin/manager SELECT RLS, no direct authenticated DML, search and filtered printing. Code SHA bb08320b690203f7f9b1ce65287e389e847c2dea passed Actions run 39154450426.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on that exact code SHA. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. Production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.

## نقطة الاستئناف الوحيدة

- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001
- Review each of 69 READY_TO_REUSE candidates against live app contracts and implement useful missing behavior only. Prioritize security/data correctness, commerce/inventory/import/Onyx, then finance/admin/analytics.
- Do not blind-copy old React Router screens or apply legacy SQL with DROP FUNCTION ... CASCADE. Do not invent historical invoices or demo data. No paid services.

## حدود الإثبات
- لا يوجد متصفح تفاعلي أو إثبات إنتاج مباشر؛ preview/dev smoke ليس إثبات نشر.
- PostgreSQL 17 معزول في Actions فقط؛ لم تُطبق migrations على Supabase الإنتاجية.
- أرشيفا Bolt اجتازا إعادة تحقق آلية على SHA `92a948e83ebc05278b09d50aec410da490c76f7c` في Actions 39157355307: الحجم وSHA-256 وممر CRC/فك الضغط لكل عضو وفحوص المسارات وحدود التوسع والاستخراج المؤقت المحدود PASS. لم تُشغّل ملفات الأرشيف ولم تُطبق SQL. تم تصنيف جميع مرشحي READY_TO_REUSE الـ69 في سجل القرارات، بينما تستمر المهمة NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 لاستكمال الواجهات الناقصة المثبتة من المواصفة الأصلية.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.

## تكامل المخزون: احتساب المتاح للبيع

- أُصلح عدّ المخزون المنخفض في `fetchDashboardStats`: أصبح يعتمد على `inventory_balances.quantity_available <= reorder_point` بدل `quantity_on_hand`، حتى لا تخفي الحجوزات نقص الكمية القابلة للبيع.
- إذا فشل استعلام المخزون، يعيد المسار خطأً بدل احتساب صفر أصناف منخفضة وعرض حالة آمنة غير صحيحة. الصف العددي غير المكتمل يُتجاهل بدل تحويل قيمة مجهولة إلى صفر؛ الحد الفارغ `reorder_point` يُعامل كصفر وفق قاعدة الدالة الجديدة.
- الملفات: `src/lib/inventory-metrics.ts`, `src/lib/api.ts`, `src/test/inventory-metrics.test.ts`.
- [Actions 39158519832 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39158519832) على SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`: lock verification، unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، preview smoke وdev smoke جميعها PASS.
- حدود الدمج: هذا إصلاح metric في لوحة التشغيل فقط، وليس تنفيذ تحويلات بين المخازن أو جلسات جرد. فُحص مرشح `src/services/inventory.ts` وتبين أنه يتطلب RPCs وجداول لا توجد في migrations الـ42 الفعالة عند رأس المراجعة؛ لذلك لم يُنسخ عقد الخدمة القديمة ولم تُنشأ RPCs غير مدعومة.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migrations=NOT RUN.



## أمان الاستيراد — فرض تتابع الشرائح على الخادم

- أضيفت migration جديدة `supabase/migrations/20261018060000_import_upload_chunk_contiguity.sql` تستبدل تنفيذ `record_import_upload_chunk` دون تغيير توقيع RPC العام.
- أصبحت دالة قاعدة البيانات تشترط تسجيل شرائح الرفع كبادئة متصلة بدءًا من 0؛ لا تقبل تخطي الشريحة الأولى أو الشريحة التالية، ولا تُعلن اكتمال manifest إلا بعد تسجيل العدد المتصل الكامل. يبقى تكرار طلب الشريحة نفسها ببصمة وموضع وحجم مطابقين idempotent.
- أضيفت اختبارات قبول PostgreSQL 17 لتجاوز رقم الشريحة، والفجوة المتوسطة، وإعادة المحاولة، والتتابع الصحيح حتى الاكتمال.
- [Exact-SHA CI 39159034597 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159034597) على `a02ad4682ed1e18a10811040ae20134875031de7`: frozen lock، unit tests، PostgreSQL 17 migrations/RLS، lint، build، preview/dev smoke PASS.
- هذا اختبار على قاعدة PostgreSQL معزولة في CI، وليس تطبيقًا على Supabase الإنتاجية. لا يدعي إنجاز الاستيراد بالكامل أو استبدال ملفات المانحين القديمة.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN.


## تكامل تحويل المخزون بين المستودعات

- تمت مواءمة الفائدة الأساسية من مرشح `src/services/inventory.ts` القديم على عقد Nasr1 الحقيقي بدل نسخه حرفيًا؛ الخدمة القديمة تفترض RPCs وأعمدة وجداول مختلفة. المسار الجديد يستخدم `inventory_balances.quantity_on_hand/quantity_reserved/quantity_available` الحالية.
- أضيفت `supabase/migrations/20261018070000_inventory_transfer_command.sql`: جدول `inventory_transfers` بعزل مؤسسي، قراءة فقط لموظفي المؤسسة، ومنع DML مباشر من المتصفح؛ وRPC `transfer_inventory` بصلاحية خادمية.
- ينفذ RPC النقل في معاملة واحدة، يتحقق من المؤسسة والمنتج والمستودعين وحالة نشاطهما، ويرفض الكمية غير الصالحة أو التي تتجاوز المتاح بعد الحجوزات. يقفل أرصدة المصدر والوجهة بطريقة حتمية، يكتب حركتي `transfer_out/transfer_in` بالمرجع نفسه ويسجل سجل التدقيق. مفتاح منع التكرار يعيد النتيجة السابقة لنفس الحمولة ويرفض إعادة استعماله بحمولة مختلفة.
- رُبطت الوظيفة بنموذج فعلي في إدارة المنتجات: اختيار مستودع المصدر/الوجهة والكمية والسبب؛ قرار الخادم هو المرجع المتحكم بكمية المتاح، لا قيمة عرض قديمة في النموذج.
- اختبارات PostgreSQL 17 تغطي النقل، ثبات الحجوزات، رصيد الوجهة، قيدي دفتر الحركة، إعادة المحاولة دون تكرار، اختلاف الحمولة، نقص المتاح، منع نقل مخزون مؤسسة أخرى، ومنع تعديل دفتر النقل مباشرة.
- [Exact-SHA CI 39159745907 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159745907) على `89fe8089aa2fd7d4f1b5130c8af85dc1171b4185`: unit tests، PostgreSQL 17، lint، build، preview/dev smoke PASS.
- ما لم يُنجز: جلسات الجرد الفعلي (start/count/complete) من خدمة المانح لم تُنقل؛ كانت تعتمد مخططًا غير موجود في الهدف. لم تُطبق migrations على Supabase الإنتاجية ولم يُثبت تشغيل المتصفح/الإنتاج.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.

## حماية الكتابة المباشرة وحد إعادة الطلب

- أضيفت migration `supabase/migrations/20261018080000_inventory_write_boundary_and_reorder_point.sql`: أُلغيت صلاحيات INSERT/UPDATE/DELETE وغيرها على `inventory_balances` و`inventory_movements` من `PUBLIC/anon/authenticated` مع إبقاء القراءة المطلوبة؛ التغيير في الرصيد ودفتر الحركات يمر عبر أوامر خادمية موثوقة.
- أضيف RPC `set_inventory_reorder_point`: صلاحية admin/manager فقط، هوية المؤسسة من الملف الشخصي المصادق عليه، تحقق من الصنف والمستودع داخل المؤسسة، حد صحيح بين صفر ومليار، سبب إلزامي، وقفل صف الرصيد القائم. لا ينشئ رصيدًا صفريًا عند غياب الرصيد المثبت.
- كل تغيير فعلي يُسجل في `audit_logs` مع القيمة السابقة والجديدة والسبب والفاعل؛ القيمة نفسها no-op لا تُنتج حدث تدقيق مضلل. مشغّل `operational_tasks_from_inventory` يعيد تقييم مهمة الشراء عند عبور حد إعادة الطلب.
- رُبط الأمر بنموذج إدارة المنتجات ويعرض الحد الحالي والمتاح المثبت لكل مستودع؛ حُجب عن الأدوار غير الإدارية في الواجهة ويظل التفويض النهائي في قاعدة البيانات.
- أضيفت اختبارات قبول لـPostgreSQL 17 تمنع DML المباشر على الأرصدة ودفتر الحركات، وتختبر تعديل الحد والتدقيق وno-op ودورة مهمة الشراء ورفض الحد السالب والمستودع من مؤسسة أخرى ورفض المحاسب.
- [Exact-SHA CI 39160377663 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39160377663) على `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`: unit tests، PostgreSQL 17 migrations/RLS، lint، build، preview/dev smoke PASS.
- هذا تكامل هدف أصلي متوافق مع مخطط Nasr1؛ لا يدمج الحدود القديمة المنفصلة min/reorder/max حرفيًا لأن الهدف يحتوي `reorder_point` فقط. جلسات الجرد ما زالت المهمة التالية. الإنتاج/browser لم يُثبتا، ولم تُطبق migration على Supabase الإنتاجية.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.

## الجرد الفعلي — ربط واجهة الإدارة

- تمت إضافة شاشة RTL فعلية `src/components/InventoryStockCountPage.tsx` وربطها بالمسار `/admin/stock-count` والتنقل والبحث السريع وملف routeTree.
- تستخدم الواجهة المستودعات النشطة والجلسة المفتوحة والـRPCs الحالية: بدء الجلسة بمفتاح idempotency، عرض لقطة الأصناف الموجودة، حفظ العد لكل صنف، الطباعة، واعتماد/إلغاء بصلاحية المدير. لا توجد بيانات demo.
- الخادم هو المرجع النهائي: لا تُطبّق الفروقات إلا مع تطابق لقطة الرصيد والحجوزات؛ الرفض لا يمحو حركات أحدث. التسوية تكتب حركات مخزون وسجل تدقيق.
- backend exact-SHA `4ef323db2aa7b3ea9e11e1bb362fc37e7994221a`: [Actions 39161411949 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39161411949) (frozen lock، unit، PostgreSQL 17 migrations/RLS/الجرد، lint، build، preview/dev smoke).
- واجهة الجرد ومسارها أُضيفا واختُبرا على exact SHA `94c0f92eea5fe8d2add289106c3f76d884460d4d`; [Actions 39165071610 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39165071610) اجتاز frozen lock، unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، production-preview smoke وdev smoke، بما في ذلك `/admin/stock-count`.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.


## 2026-10-19 — إغلاق مراجعة المرشحين الـ69 وتحديد التنفيذ التالي

- تمت مطابقة جميع صفوف `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` (69/69) مع الجرد، ومراجعة المحتوى المست staged من حيث الواردات/التعريفات/نقاط الاستدعاء/عقود البيانات وأدوار الصلاحيات/اعتماديات المخطط/اختبارات المانح. أُسند قرار مستقل لكل صف في `READY_TO_REUSE_FILE_AUDIT.csv` وأُدرجت قرارات الملفات الفردية في `SOURCE_INTEGRATION_LEDGER.csv`. ذلك لا يعني تشغيل كل كود مانح: أي كود لم يدمج لم يُشغّل، ومخرجات الاختبارات تشير إلى ذلك صراحة.
- خلاصة القرارات للصفوف الـ69: {"ALREADY_PRESENT_EXACT_SEMANTIC_REVIEWED":4,"KEEP_TARGET_PDF_IMPLEMENTATION":1,"KEEP_TARGET_TENANT_TEST_SUITE":1,"REFERENCE_ONLY_NO_CODE_MERGE":2,"KEEP_TARGET_BUSINESS_INTELLIGENCE":2,"KEEP_TARGET_CATALOG_API":2,"KEEP_TARGET_PRODUCT_IMAGE_PIPELINE":1,"DO_NOT_DUPLICATE_UNIFIED_IMPORT_ENGINE":5,"KEEP_TARGET_SERVER_AUTHORITATIVE_COMMERCE":10,"KEEP_TARGET_OUTBOX_RUNTIME":4,"KEEP_TARGET_SERVER_PRICE_AUTHORITY":2,"KEEP_TARGET_RETRY_HELPER":2,"DEFER_LEGACY_OFFLINE_CART_ADAPTATION":2,"KEEP_TARGET_SERVICE_AND_RESPONSE_CONTRACTS":3,"PARTIALLY_ADAPTED_CASH_EXPENSE_ONLY":2,"DO_NOT_DUPLICATE_XLSX_IMPORT_PIPELINE":2,"KEEP_TARGET_INVENTORY_COMMANDS":3,"DO_NOT_APPLY_LEGACY_SCHEMA_MIGRATION_OR_TEST":5,"ADAPTED_TARGET_NATIVE_CASH_EXPENSE_LEDGER":1,"REJECT_LEGACY_PRODUCT_CARD":1,"DO_NOT_ADD_SECOND_CSV_PIPELINE":1,"RETAIN_CUSTOMER_PRICE_PRIVACY_CONTRACT":1,"REJECT_LEGACY_ORDER_FROM_CART":1,"ALREADY_IMPLEMENTED_STREAMING_SHA256":1,"REJECT_LEGACY_POLICY_CENTER":2,"KEEP_TARGET_OPERATIONS_AND_AI_UI":1,"REFERENCE_ONLY_GENERIC_UI_PRIMITIVES":1,"REJECT_UNBOUNDED_LEGACY_ANALYTICS":1,"REJECT_UNSUPPORTED_LEGACY_CONTROL_TOWER":1,"REJECT_LEGACY_DATA_QUALITY_PAGE":1,"REJECT_LEGACY_IMPORT_PAGE":1,"REJECT_LEGACY_DIRECT_ORDER_EDITOR":1,"REJECT_LEGACY_DIRECT_PRICING_PAGE":1}. لا تُنسخ migrations قديمة مرتبطة بـ`current_organization_id/current_role/branches/price_lists/import_rows` على مخطط Nasr1، ولا واجهات React Router التي تكتب أسعار/طلبات العميل من المتصفح. الأفكار المتوافقة الموجودة أصلًا (العناوين/عضوية الشركات/PDF/المحرك الموحد/التجزئة/Onyx/الاستيراد والمخزون) احتفظنا بالتنفيذ الفعلي الحالي بدل إنشاء ازدواج.
- أغلق `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001` بعد توثيق كل 69 قرارًا وتكامل سجل المصروفات المكيّف. **المهمة التالية الوحيدة:** `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` — مطابقة كل قسم واجهات في المواصفة الأصلية مع المسارات/components الفعلية، ثم تنفيذ أول فجوة قابلة للإثبات مع tests وroute/smoke verification؛ دون إنشاء شاشة شكلية أو بيانات demo.
- إثبات CI الجاري للوثائق قبل هذا التحديث: [Actions 39172097300 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39172097300) على SHA `2dc06d4bf7b586d698747dff2d66fb3c29c24578`. سيصبح أي commit توثيق جديد بحاجة إلى CI مطابق خاص به.
- حالات الإثبات غير المتاحة ما زالت واضحة: أرشيفا ZIP لم يُعاد تنزيلهما في هذه الجلسة بسبب أخطاء UTF-8/DNS المسجلة في `ARCHIVE_MANIFEST.csv`؛ production migration `NOT RUN`؛ browser run `NOT RUN`؛ production proof `NOT PROVEN`.


## 2026-10-19 — دمج واجهة لقطات أونكس والتحليلات والمطابقة

- فُعّل مسار الوصول الحالي عبر «مركز البيانات الموحد» إلى شاشة حقيقية `OnyxSnapshotCenter` لعرض اللقطات الجاهزة من `onyx_snapshots`، تحليلات `get_onyx_snapshot_analytics`، ومعاينة محدودة لأول 100 صف، وتاريخ/نوع التقرير/الفترة/بصمة الملف.
- زر المطابقة يستدعي `run_inventory_reconciliation` الخادمي ويعرض عدد الصفوف المتطابقة والمتغيرة والجديدة وغير الصالحة ورقم التشغيل. هذه العملية تنشئ سجلات مطابقة وتدقيق فقط؛ لا تغيّر أرصدة المخزون ولا تدعي اتصالاً مباشرًا ببرنامج Onyx الخارجي.
- أُضيفت حالات تحميل/فراغ/خطأ/عدم صلاحية، تحقق صارم من الحقول الأساسية بدل تحويل القيم المفقودة إلى صفر، وطباعة تقرير يذكر مصدر اللقطة وحدود المعاينة، واختبارات UI للقراءة/المطابقة/الرفض عند غياب صلاحية الموظف/فشل الاستعلام.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact code SHA a38e43f4da656da6cc10abdb476b0023dd029440; matching Actions 39173352654 — SUCCESS (https://github.com/Report-Engainall/Nasr1/actions/runs/39173352654); BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.
- next_task_id يظل `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`، وسيستمر بعد إثبات هذا الدمج في مطابقة بقية أقسام المواصفة بدل اعتبار شاشة واحدة اكتمالًا شاملاً.


## 2026-10-19 — إثبات الرأس الحي a38e43f4da656da6cc10abdb476b0023dd029440

- CI المطابق للرأس نفسه: [Actions 39173352654 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39173352654); unit tests، ترحيلات وقبول PostgreSQL 17/RLS، lint، build، production preview smoke وdev smoke PASS.
- Onyx: تمت إضافة وربط src/components/OnyxSnapshotCenter.tsx من مركز البيانات لعرض اللقطات والتحليلات والصفوف المصدرية المحدودة والمطابقة الخادمية والطباعة. لا يدعي ذلك اتصالًا خارجيًا أو round-trip مع برنامج Onyx.
- مركز المهام: نطاق طباعة كل الأدوار المسموحة أو دور واحد ضمن صلاحيات الحساب، مع فلاتر الحالة/الأولوية/المسؤول/الفترة/البحث نفسها. حالات الدور غير المصرح به والنتيجة الفارغة مغطاة بالاختبارات.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA a38e43f4da656da6cc10abdb476b0023dd029440; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.
- next_task_id يظل NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002؛ إكمال جميع واجهات المواصفة لم يثبت بعد.


## 2026-10-19 — تنفيذ واجهة إعلانات المتجر: بانتظار CI المطابق

- الرأس الذي بدأ منه التنفيذ: 6ba074858b683dc6214039112e6c9cb147eabf2d. تشغيل CI السابق 39173352654 نجح على كود SHA a38e43f4da656da6cc10abdb476b0023dd029440 فقط، ولا يثبت التغييرات الحالية.
- أضيف ترحيل قاعدة البيانات 20261019110000_storefront_announcements.sql مع قراءة عامة مرتبطة بمؤسسة المتجر المنشورة، وتصفية خادمية بحسب وقت النشر والجمهور، ومنع الوصول المباشر للجدول، وحفظ مقيد بمدير النظام/المدير، وتسجيل التدقيق.
- رُبط المكون StorefrontAnnouncementSlider بمسار Storefront النشط، وأضيف تبويب إعلانات المتجر إلى SettingsPage مع تحرير التوقيت والأولوية والرابط واللون والجمهور والتفعيل. احترام prefers-reduced-motion يوقف الدوران التلقائي ويلغي حركة شريط الأخبار.
- حالات التغيير قبل اختبار Actions المطابق: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=NOT RUN; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; نشر الترحيل في الإنتاج NOT RUN.
- فرع الاستعادة recovery/bolt-snapshot-2026-10-17 وDraft PR #1 تمت معاينتهما. شاشات AdminBanners/BannerSlider ضمن الشجرة القديمة React Router ولا تكفي لربطها وحدها بالتطبيق الحي الذي يستخدم TanStack Start. تمت تهيئة الدمج باستخدام عقد التطبيق الحالي.
- إعادة تنزيل ZIPين في الجلسة الحالية NOT RUN. رابط Before Failure المحاول: https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip؛ الخطأ الحقيقي: curl exit 6: curl: (6) Could not resolve host: raw.githubusercontent.com. ملف Restored Current لم يُعد تنزيله كذلك بسبب عائق DNS. نتائج SHA-256/CRC في Actions 39157355307 دليل تاريخي من تشغيل سابق، وليست إعادة تحقق حالية.
- next_task_id يبقى NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 إلى أن يثبت CI المطابق هذا الدمج؛ لا يغلق بناءً على الكود وحده.


## 2026-10-19 — نتيجة تحقق exact-SHA لإعلانات المتجر

- الكود الجاري اختباره: 5308c3f917852cf3a2474a0ac0201bee8c8f32be؛ تشغيل GitHub Actions المطابق: 39174470933 — SUCCESS.
- مرّت مراحل Unit tests وPostgreSQL 17 migrations/RLS acceptance وLint وBuild وProduction-preview smoke (port 4173) وDev smoke (port 5173).
- كُشف وأُصلح فشل سابق في تشغيل 39174326823 على SHA f4a84e6ac6cf85966a918ca3bfa1cd0f81c28975: ملف storefront-discovery.test.tsx لم يكن يضيف fetchStorefrontAnnouncements إلى mock واجهة API. بعد الإصلاح، التشغيل المطابق 39174470933 نجح.
- حالة هذه الفجوة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS على exact SHA؛ BROWSER-PROVEN=NOT RUN؛ PRODUCTION-PROVEN=NOT RUN؛ نشر الترحيل في بيئة الإنتاج=NOT RUN.
- هذه نتيجة جزئية ضمن المهمة النشطة NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002، وليست إقرارًا باكتمال كل الواجهات. ستبقى المهمة نشطة حتى حسم بقية بنود المواصفة مثل شبكة الأسعار الشاملة وتحريرها المجمع.




## 2026-10-19 — شبكة أسعار التحرير المجمع

- Code SHA under verification: `7e3bdbee89def1e7c4396235a87618c357858fac`.
- Active Admin UI integrated: editable base price + VIP/wholesale/retail tiers; keyboard Enter navigation; before/after preview; explicit commit; batch cap 200.
- Backend: the corrective migration uses the real `products.base_price/wholesale_price/retail_price` and `product_prices(tier,min_quantity,is_active)` schema, instead of non-existent `price_wholesale_of_wholesale` columns. Reads and writes require an active admin/manager in the current organization; writes are atomic, stale-value guarded, and audit logged.
- Exact-SHA CI: FAIL (failure) — GitHub Actions 39175623592 on exact code SHA 7e3bdbee89def1e7c4396235a87618c357858fac; inspect this run before proceeding: https://github.com/Report-Engainall/Nasr1/actions/runs/39175623592
- IMPLEMENTED=YES; INTEGRATED=YES; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN.
- Archive downloads/updated SHA256/CRC/safe extraction remain NOT PROVEN in this session; the logged direct-download DNS error is `curl: (6) Could not resolve host: raw.githubusercontent.com`. Historical ZIP hashes are not fresh validation.
- The next task remains `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`; this is one additional specification gap closed/under test, not full-spec completion.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PROMOTIONS-003: إدارة حملات فعلية مع عزل وصلاحيات

- عولجت فجوة محددة في قسم واجهات التجارة: كان زر «إضافة عرض» معطّلًا، وكانت القراءة والتبديل تعتمد وصولًا مباشرًا إلى جدول `promotions` مع سياسات عامة/موظفين أوسع من المطلوب.
- أُضيف `supabase/migrations/20261019140000_promotion_management_commands.sql`: RPCs منفصلة للمتجر العام والإدارة والحفظ وتغيير الحالة؛ القراءة العامة تعرض الحملات النشطة ضمن نافذة تاريخ النشر فقط، وإدارة/تعديل/تفعيل الحملات يشترط مستخدمًا نشطًا بدور admin/manager في المؤسسة الحالية. تم سحب DML والقراءة المباشرة من `anon` و`authenticated` وإضافة تدقيق لكل إنشاء/تعديل/تغيير حالة. فحوص الخادم تتحقق من قيمة الخصم والتواريخ وملكية product/category IDs.
- الواجهة الفعلية: `src/components/PromotionManager.tsx` مربوطة من لوحة الإدارة؛ إنشاء/تعديل/تفعيل وإيقاف باستخدام RPC الحقيقي، واختيار الأصناف والتصنيفات. `Storefront.tsx` يقرأ من RPC عامة منفصلة ولا يعرض رقم خصم على أنه مطبق على فاتورة.
- حد صحة مالي صريح: قيمة الحملة المخزنة لا تُخصم تلقائيًا من إجمالي الطلب بعد؛ الواجهة الإدارية تصرح بهذا الحد، وواجهة المتجر لا توحي بأن محرك التسعير طبّق خصمًا. دمج العروض مع حساب سعر الطلب ما يزال مهمة مستقلة ولم يُنفّذ/يُثبت هنا.
- CI المطابق: [Actions 39185199950 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39185199950) على SHA `ddd99501594fca3d622555e3868159e65c987952`. النتيجة الفعلية: 34/34 test files، 279/279 tests؛ قبول PostgreSQL 17 طبع `PASS promotion management: admin-only tenant-scoped RPCs, public active/schedule filter, no direct table access, cross-tenant rejection and audit idempotency`; Lint/Build/preview smoke/dev smoke PASS.
- دلائل تنفيذ: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact-SHA CI); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; PRODUCTION_MIGRATION=NOT RUN. الواجهة وRPCs لم تُختبر بمتصفح مسجل الدخول أو بقاعدة إنتاج.
- محاولة ZIP الحالية على الرابط `https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip` وعلى الرابط `https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Restored_Current.zip`: GitHub fetch أعاد HTTP 400 بالنص `GitHub Fetch: INVALID_ARGUMENT / HTTPError 400: GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)`. `web.open` أعاد DisabledError للملفين، و`container.download` رفض التنزيل برسالة `download failed because url not viewed in conversation before`; كما أن رابط GitHub raw البديل احتوى `refs/heads` وأعاد 404 `No commit found for the ref refs`. لذا SHA-256 الجديد، واختبار CRC/الضغط، والاستخراج الآمن والمقارنة الثنائية لهذه الجلسة كلها NOT RUN. القيم السابقة في الفهرس دليل تاريخي فقط، لا إعادة تحقق.
- راجعت فروع Nasr1 المتاحة: `main` و`recovery/bolt-snapshot-2026-10-17`؛ وPR #1 ما يزال Draft وغير مدمج، لذلك لم أنقل منه ملفات/SQL تلقائيًا. سجل قرارات الملفات المانحة الـ69 باقٍ في `READY_TO_REUSE_FILE_AUDIT.csv` ولا يساوي تشغيل كل ملف مانح.
- `next_task_id` يبقى `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`: لا تزال تغطية كل واجهات المواصفة غير مكتملة، ويجب استكمال مطابقة بقية الأقسام، ثم دمج الحملة في محرك التسعير الحقيقي عند تحديد عقد الخصم المناسب.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PRICE-GRID-CSV-001: استيراد/تصدير شبكة الأسعار

- نُفذت فجوة قابلة للإثبات من §6.2 في المواصفة الأصلية: إضافة تصدير UTF-8 CSV بقالب ثابت من صفوف الخادم المحفوظة فقط، مع BOM، ترتيب أعمدة محدد، اقتباس كل الحقول، أسعار بدقتين عشريتين، ومعالجة النصوص التي تبدأ بصيغ spreadsheet حتى لا يتم تفسيرها كصيغ Excel. التصدير لا يتضمن المسودات غير المعتمدة.
- أُضيف الاستيراد إلى شبكة الأسعار النشطة: يحلل قالب CSV، يطابق كود الصنف حرفيًا مع الأصناف الموجودة على الخادم، ويرفض الرؤوس/الأكواد المكررة، والأكواد غير الموجودة، وعدد الأعمدة الخاطئ، والسعر السالب أو غير الرقمي أو بأكثر من منزلتين عشريتين. الحد 2MB و200 صنف بالدفعة؛ لا dependency إضافية.
- الاستيراد ينتج مسودة واجهة فقط. لا يُكتب إلى قاعدة البيانات حتى معاينة الأسعار ثم ضغط «اعتماد وحفظ الدفعة» التي تستدعي أمر التسعير الخادمي الحالي بفحص التعارض والتدقيق الذري. اختبار الواجهة يتحقق من عدم الحفظ قبل الاعتماد.
- CI مطابق: [Actions 39186174524 — SUCCESS](`https://github.com/Report-Engainall/Nasr1/actions/runs/39186174524`), exact SHA `b0fedcbec9a445aa2eef96eb2686a59a9ab14768`. الأدلة: 35/35 test files، 285/285 test cases، PostgreSQL 17 migrations/RLS acceptance، lint، build، preview smoke 4173 وdev smoke 5173 كلها PASS. تغطي الاختبارات round-trip لكود يبدأ بأصفار، دقة السعر، CSV quoting/formula injection، رفض الكود غير الموجود/المكرر والدقة غير الصالحة، والتدفق UI من الاستيراد إلى المعاينة والاعتماد.
- تصنيف الإثبات: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact-SHA CI); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; PRODUCTION_MIGRATION=NOT RUN.
- الحدود المفتوحة في المواصفة: لم ينفذ XLSX workbook؛ لم تُضف حقول الكمية/المخزون إلى شبكة/قالب الأسعار لأن عقد `ProductPriceGridRow` والـRPC الحالي لا يعيدان كمية مخزون. ملف CSV يحمل الأكواد في نصه مع الأصفار البادئة، ويطلب من المستخدم استيراد عمود الكود بنوع Text في Excel كي لا يحوله Excel تلقائيًا إلى رقم. لا تدّعِ أن القسم 6.2 مكتمل بالكامل.
- في المحاولات الوسيطة أظهرت CI إخفاقي assertion في توقعات الاختبار ثم إخفاق lint بسبب `no-control-regex`; تم إصلاح التوقعات وتبسيط تعبير الحماية دون إسقاط اختبارات الأمان. التشغيل النهائي المذكور أعلاه نجح بعد الإصلاحات.
- المهمة الأشمل ما زالت مفتوحة: `next_task_id = NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`. هذا تنفيذ CSV في شبكة الأسعار وليس إكمالًا لكل الواجهات.


## 2026-10-20 — P2 task 006: source-linked customer invoice/payment journals

- P2 PR: https://github.com/Report-Engainall/Nasr1/pull/6
- Forward-integrated head before this documentation commit: `dec9026ef5c1f2c894774f8b68933df5e2dfe01b`; parents are prior P2 head `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` and current main `f7cffd41cd63e16c6020fe379edf27416c5e0ce8`. The merged tree retains main's changes and contains only the five intended PR files beyond current main.
- Exact-head CI: [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916) **SUCCESS** on `dec9026ef5c1f2c894774f8b68933df5e2dfe01b`: unit tests, PostgreSQL 17 migration/acceptance, lint, build, preview smoke and dev smoke.
- Earlier feature head `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` also passed Action 39335571027.
- Retained failure: Action 39335294442 on `fc62a8bb0f38e0eb6ec97c3ae878fec69635f17b` exposed that readback searched only page one. P2 fixed the acceptance helper to page until the exact seeded source is found; no SQL/RLS guard was loosened.
- Accounting behavior: source-derived invoice totals/tax, idempotent invoice/payment drafts, server-derived payment AR mapping, unconfigured FX rejection, source/line edit guards, tenant/role boundaries, reasoned manager/admin reversal drafts, exact inverse debit/credit lines and reversal-before-void enforcement.
- Production migration, live-tenant and browser/manual proof: **NOT RUN**.

## Current active continuation

`next_task_id = NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007`

Objective: wire visibility controls to the actually routed catalog/cart/order-review/invoice/PDF surfaces, enforce settings authority and tier-price isolation at DB/RPC boundaries (not just CSS), and prove admin changes become effective without stale client settings. Inspect existing privacy migrations first; extend only demonstrated gaps and do not duplicate existing protections.

## مؤشر التنفيذ الحي بعد طباعة المالية — 2026-10-20

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



## AUTHORITATIVE P2 LIVE CHECKPOINT — 2026-10-20 — CUSTOMER PRICE PRIVACY ACCEPTED

- Only project: `Report-Engainall/Nasr1`. Continue the existing P2 branch `feat/p2-customer-return-intake-20261020` / PR #18 for P2-owned work. PR #12 remains a separate open price-privacy feature PR; do not merge directly to main.
- `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`: `IMPLEMENTED=YES`; `INTEGRATED=YES on PR #12 branch`; `TESTED_EXACT_SHA=PASS` at `be595fc74b8bbf64b308b84210d86a9aa1d464b8`, Actions [39463202326](https://github.com/Report-Engainall/Nasr1/actions/runs/39463202326). Exact DB acceptance log prints the standalone `PASS customer price privacy` line. See the latest appended section in `PROGRAMMER_2_CURRENT_REPORT.md`.
- Root causes resolved in the price-privacy branch: accountant incorrectly fell into operational `base_price` path; replacement price resolver dropped active promotion discounts; the new standalone test first bound bool as string, then raw PostgreSQL boolean to jsonb. These were fixed in the migration/test parameterization, not by changing authorization or weakening SQL policy. Earlier failed Actions remain historical evidence.
- `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. Preview and dev smoke tests are CI HTTP smokes only, not authenticated browser proof or production proof.
- Important merge coordination: the existing PR #12 diff includes a prior change to the P1-locked `scripts/test-database-migrations.mjs`. This P2 batch did not edit that file; do not merge PR #12 until P1 resolves that historical protected-file diff. Separate acceptance lives in `scripts/test-customer-price-visibility.mjs`.
- Donor extraction discrepancy remains unresolved: 2,329 Git tree entries versus 2,044 items reported by the extraction manifest; no archive redownload, extraction, or hash recalculation was performed.
- **Single authoritative active pointer:** `next_task_id = NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`. Next: inspect and complete target-native identity/branding and source identity/external IDs plus timestamp/status/trace evidence across saved Onyx snapshots, analysis, import/export and financial documents; prove that stored snapshot evidence is not mislabeled as live Onyx API sync. Do not start a parallel pointer.
