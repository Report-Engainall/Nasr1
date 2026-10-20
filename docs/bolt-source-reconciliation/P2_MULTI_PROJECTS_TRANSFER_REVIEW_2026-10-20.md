## P2 readback — DQS calendar integrity and CSV/XLSX spreadsheet safety — 20 October 2026

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

# P2 — مراجعة مصادر NASR المستخرجة مقابل Nasr1
تاريخ المراجعة: 20 أكتوبر 2026  
المستهدف المقارن: Report-Engainall/Nasr1 على main عند SHA b54c87525d3b8c25c1d6ebf0c525636f82444ac1.  
المصدر: Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER على main عند SHA f7c0b8132f3e4bbe298c73d966ed6996b5cf989b.  
تقرير الاستخراج: blob 1f5e589344251129e5d96ed2e0b4bf886c8222f1.

## حدود الدليل
هذا الجرد تمت مراجعته عبر GitHub recursive tree ومقارنة Git blob SHA-1 للملفات، مع فتح الملفات الوظيفية الأساسية المذكورة أدناه. لا يعني جرد الشجرة تشغيل التطبيق أو اختبار كل ملف؛ أي سلوك runtime غير مذكور على أنه مثبت. هذه وثيقة P2 ولا تضاف نتائجها إلى سجلات P1 الثلاثة.

## 1. تعداد المصدر والتكرارات
- شجرة GitHub recursive: 2,329 entries، منها 2,024 blobs على مستوى المستودع كله، و2,011 blobs داخل مجلدات الأرشيف التسعة في EXTRACTED_PROJECTS.
- تقرير الاستخراج يعد 2,044 ملفًا. الفرق بين أعداد التقرير ومحتوى الشجرة المتاح حاليًا = 33 مسارًا. هذا **تباين يحتاج تسوية** وليس دليلًا كافيًا على فقد البيانات أو فساد الاستخراج؛ لم نعد تنزيل ZIPs أو إعادة استخراجها.
- عدد الملفات المسجل بالتقرير مقابل blobs الموجودة داخل المجلد:
| المشروع المستخرج | تقرير الاستخراج | مسارات blobs الحالية | الفرق |
|---|---:|---:|---:|
| project-bolt-github-7ctmfr27 | 494 | 494 | 0 |
| project-bolt-github-7sl6ykzz (3) | 359 | 358 | 1 |
| project-bolt-github-7wyze9ut (2) | 45 | 35 | 10 |
| project-bolt-github-7wyze9ut (3) | 45 | 35 | 10 |
| project-bolt-github-8ccbjvhg | 338 | 338 | 0 |
| project-bolt-github-gcrrtnzl | 274 | 273 | 1 |
| project-bolt-github-last | 376 | 375 | 1 |
| project-bolt-github-myh797q4 (4) | 72 | 71 | 1 |
| project-bolt-sb1-b5g7dtki (1) | 41 | 32 | 9 |
| **الإجمالي** | **2,044** | **2,011** | **33** |

تقرير المصدر يقول إن archive pair project-bolt-github-7wyze9ut (2)/(3) لهما SHA-256 واحد: 491a82420425128cec8de57544747a40f243bfbf9daae27a329b9099a8b6ae2a. وتؤكد شجرة الملفات الحالية أن الملفات الـ35 المسجلة تحت project/ في كل نسخة متطابقة جميعها في المسار وGit blob SHA (35/35). لذلك تُحتسب محتويات الزوج مرة واحدة. العدد 45 في تقرير ZIP لا يقابل إلا 35 ملفًا متتبعًا تحت project/ لكل مجلد حاليًا؛ تبقى العشرة المسارات غير الظاهرة في الشجرة جزءًا من تباين العدّ وليست سببًا لتكرار الدمج.

## 2. قياس تشابه المشاريع مع Nasr1/main
- project-bolt-github-7ctmfr27: 494 ملفًا؛ 493 مسارًا مشتركًا مع الهدف، 492 ملفًا متطابق المحتوى، ملف واحد مختلف (src/routeTree.gen.ts)، ملف source-only واحد، و20 ملفًا target-only.
- project-bolt-github-last: 375 ملفًا؛ 349 مسارًا مشتركًا، 306 محتوى متطابقًا، 43 ملفًا مختلفًا، 26 ملفًا source-only، و164 target-only.
- project-bolt-github-gcrrtnzl: 273 ملفًا؛ 17 مسارًا مشتركًا فقط، اثنان متطابقان، 15 مختلفة، و256 source-only. هذه الشجرة ذات طبقة تطبيق/مخطط أقدم؛ لا يُنقل مشروعها كاملًا أو SQLها آليًا.
- المشروع الحالي في Nasr1 يحوي بالفعل 513 ملفًا متتبعًا في الشجرة التي تمت مقارنتها. تداخل الأسماء لا يثبت تكافؤ السلوك؛ استُخدمت بصمات المحتوى ومراجعة موضعية حيث يلزم.

## 3. قرارات المكونات والميزات

### ALREADY_PRESENT_BETTER — لا تنسخ الملفات المتطابقة
| القدرة | دليل الهدف والمصدر | القرار |
|---|---|---|
| مركز لقطات Onyx | src/components/OnyxSnapshotCenter.tsx blob 538bc4234530419cd2c75761822811705ae5f035 مطابق في project-bolt-github-7ctmfr27 وproject-bolt-github-last | التطبيق الحالي يقرأ snapshots ويعرض التحليلات ويمتنع عن تعديل الرصيد في وضع المقارنة الحالي. لا تكرر المركز. |
| التحليل الموحد لـOnyx | src/components/UnifiedOnyxAnalysisPanel.tsx blob b8c87fbdfb19c2ea0d6768f46d697f524c13f710 مطابق في المشروعين المذكورين | لا تنشئ واجهة ثانية. تحقق لاحقًا من مصدر البيانات/حالة آخر مزامنة الحية كفجوة سلوكية مستقلة. |
| مركز المهام | src/components/TaskCenter.tsx blob 295f4dcb3f98f1f2673644bb90390c7103dff3a8 مطابق في 7ctmfr27 وlast | لا تنقل المكون؛ متطلبات الطباعة حسب الدور/الموظف والفلاتر تبقى بوابة قبول وظيفية. |
| تصدير Onyx واختباره | src/lib/onyx-export.ts blob b8e284194984516c4a33602fb848425449633e62، واختباره cb4f482d9a93c1a306d657cb6b5215750db6a0b2، مطابقان في عدة snapshots | التصدير الحالي يكتب المعرّفات كسلاسل بدل صيغ؛ لا تعِد المحرك. |
| CSV/XLSX لشبكة الأسعار | src/lib/price-grid-csv.ts blob 68d3e869818e64a1aa6447769dc6c670a72223af، وsrc/lib/price-grid-xlsx.ts blob 5dbf56b3f754a633f0d4a8949faf58e22a9eb11f؛ ملفات اختبارات CSV/XLSX المقابلة موجودة ومطابقة في snapshots | تنفيذ CSV يضيف حماية للخلايا ذات شكل الصيغ، ويصدر الأكواد النصية؛ XLSX يصدر identifiers كـ inline strings لا كمعادلات. لا تنقل الملفات أو الاختبارات المتطابقة ثانية. يلزم التحقق من مسارات التصدير الأخرى بالاختبار. |
| AI Gateway code | supabase/functions/ai-gateway/logic.ts blob 7858b8a487857a6b97a1e9c1ba1b2e9b0f387e25 وindex.ts blob 3152d79fa62bc793bedec34d2a80db18541c3f3a، متطابقان في 7ctmfr27 و7sl6ykzz(3) و8ccbjvhg وlast | البنية ليست جديدة. وجود adapter أو دوال usage لا يثبت fallback الفعلي أو أن كل استدعاء يسجل في ledger؛ اختبار تلك العقود حيًّا جزء من القبول. |
| أسس قاعدة البيانات والتحليل الحتمي | supabase/migrations/20261009070000_platform_spec_foundations.sql blob 4e61abdb9c45c92bb031514d2fa7075daf0b9a61، و20261009090000_onyx_deterministic_analytics.sql blob 6f6cf3811d287369832d418ad9c66701ab3805b5 متطابقتان في عدة snapshots | لا تعِد تطبيق migration ولا تعتبر وجودها إثبات مزامنة Onyx الخارجية. |

### ADAPT_AND_INTEGRATE — تكييف صغير تم حفظه على فرع PR #18، والاختبار ينتظر CI
- المصدر المقارن: EXTRACTED_PROJECTS/project-bolt-github-last/project/src/lib/unified-import.ts blob caa411e6fa3354a6b435c67a6392cebdd440bd9e (672 سطرًا).
- الهدف الأصلي قبل التعديل: src/lib/unified-import.ts blob 7fa69c332256e1c6a3c40a14303964404324a586 (901 سطرًا)؛ التنفيذ الهدف أكثر تحفظًا في حد الأعمدة/حجم الرفع، حجم chunks، التحقق من تسلسل/حجوم/hash شرائح الاستئناف، streaming SHA-256، وحد توسّع XLSX. لذلك لم يُستبدل الملف القديم بالنسخة الأقصر.
- فائدة محددة تم تكييفها في الهدف: تطبيع Unicode NFKC، إزالة التشكيل والتطويل، توحيد أشكال الألف/الألف المقصورة، وتوسعة الأسماء القياسية للباركود والوحدة والفئة والوصف والاسم؛ كما أصبح تطبيع مفاتيح قاموس synonyms المخصص يعمل حتى لو كان المفتاح مكتوبًا بتشكيل/ألف بديلة.
- ملفات الهدف المحفوظة على فرع P2: src/lib/unified-import.ts (تعديل؛ commit 477217f7131fbe015212a800273d36f142f05cc4) وsrc/test/unified-import-safety.test.ts (اختبارات جديدة؛ آخر تعديل test commit 49fa336b6a04db3d3272ac78d78cc17b89bc7a89). حالات الاختبار تشمل Unicode fullwidth وArabic diacritics/tatweel وaliases للباركود والوحدة والفئة والإيراد وقاموس synonyms مخصص.
- الحالة الحالية: IMPLEMENTED، وTESTED_EXACT_SHA = PASS لشفرة الاستيراد والاختبارات على SHA 49fa336b6a04db3d3272ac78d78cc17b89bc7a89 عبر [GitHub Actions 39437730603](https://github.com/Report-Engainall/Nasr1/actions/runs/39437730603) — conclusion SUCCESS. هذا الإثبات يخص ذلك SHA؛ Browser/Production proof = NOT RUN. رأس الوثائق e7867d548bea5ee8529cdb8001f290b79da6c939 كان له workflow 39438007926 قيد التنفيذ عند التحقق، ويجب إعادة التحقق من رأس الفرع النهائي بعد هذه التحديثات.

### ADAPT_AND_INTEGRATE — مصالحة المخزون المقيدة، غير منفذة بعد
- المرشح: EXTRACTED_PROJECTS/project-bolt-github-gcrrtnzl/project/supabase/migrations/20260909005534_inventory_reconciliation_controlled_apply_rollback.sql.
- المخطط المانح يعتمد onyx_datasets/onyx_dataset_rows/inventory_reconciliations وأعمدة quantity/delta/source_type؛ Nasr1 يعتمد onyx_snapshots/onyx_snapshot_rows/inventory_reconciliation_runs/items وأرصدة quantity_on_hand/quantity_reserved/quantity_available وحركات movement_type/quantity/balance_after/reference_type.
- النتيجة: SQL الخام غير متوافق ولا ينسخ. قيمة الفكرة المحتملة هي دورة preview → approve → apply → compensating rollback. قبل التنفيذ يجب إعادة فحص رصيد المخزن وحجزه وحداثته تحت locks في معاملة ذرية، إنشاء حركات stock/audit، فرض idempotency وصلاحيات tenant/role، ومنع rollback من الكتابة فوق أي حركة لاحقة. الحالة: REFERENCE_ONLY / ADAPT_AND_INTEGRATE_PENDING.
- المركز الحالي ينفذ المقارنة التحليلية عبر run_inventory_reconciliation(p_snapshot_id) فقط ولا يغيّر الأرصدة؛ لا تدّع وجود اعتماد أو تطبيق أو تراجع.

### ADAPT_AND_INTEGRATE_PENDING — اختبارات متصفح حرجة
- المرشح: EXTRACTED_PROJECTS/project-bolt-github-gcrrtnzl/project/e2e/critical-path.spec.ts؛ لا يوجد مسار مطابق في شجرة Nasr1/main عند SHA المذكور.
- الاختبار المانح يعتمد E2E_EMAIL/E2E_PASSWORD وE2E_EMAIL_B/E2E_PASSWORD_B، ونصوص/مسارات هوية قديمة. يحتاج تكييفًا على عقد تسجيل الدخول والروابط الفعلية في Nasr1، مع إثبات سيناريو catalog→cart→order→refresh وعزل المؤسسات. لا تُضمّن أسرار حسابات في المستودع؛ غياب أسرار CI يساوي NOT RUN/BLOCKED وليس skip صامتًا.
- حالة الاختبار من هذا الفحص: NOT RUN.

## 4. عناصر قبول لم تُغلق بهذه المراجعة
1. تسوية تباين 33 ملفًا بين تقرير الاستخراج وشجرة المستودع. لا تعتبره نقص ZIP مؤكّدًا حتى يتضح أصل العدد.
2. دورة تطبيق مصالحة Onyx والتراجع التعويضي الآمن مع PostgreSQL concurrency/RLS acceptance.
3. تكييف Playwright، وإثبات المسارات الفعلية ببيئة حسابات E2E مناسبة.
4. **أُغلق الجزء الخاص بطباعة الفواتير وكشوف الحساب والإشعارات الدائنة حسب الدور/المؤسسة** في P2 task `NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004`: migrations/RPCs + واجهة مدمجة واختبارات الوحدة/قاعدة البيانات على SHA `fb8390e9a4693f1d28247bab8fcb308408845284`، [Action 39443178771 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39443178771). **لا تزال** متطلبات طباعة كل المهام بفلاتر الشاشة غير مغلقة، وكذلك Browser E2E الحقيقي وProduction proof (NOT RUN).
5. إعدادات عرض السعر ضمن PR #12: الفشل السابق [Action 39339667293](https://github.com/Report-Engainall/Nasr1/actions/runs/39339667293) سببه syntax error في تعليق SQL داخل 20261020040000_customer_price_visibility_controls.sql: escaped apostrophe customer\\'s غير صالحة مع PostgreSQL standard_conforming_strings. صُحح إلى SQL quote doubling customer''s في commit 6417e723a532b4bfd2c1a81c59ff6a78722ed721؛ [Action 39438180471](https://github.com/Report-Engainall/Nasr1/actions/runs/39438180471) كان IN_PROGRESS عند آخر قراءة. لا تستخدم PR #12 كدليل PASS حتى يكتمل هذا الرأس.
6. مراجعة هوية العلامة في الشاشات/metadata/PWA/PDF/Excel والإشعارات، والتحقق من ربط آخر حالة/وقت مزامنة Onyx بدليل حقيقي؛ لم يثبت ذلك بالكامل في هذا الفحص.
7. إكمال التحقق السلوكي من AI provider fallback وUsage Ledger؛ blobs المتطابقة وحدها لا تثبت التشغيل/configuration.

## 5. الحالة والخطوة التالية
هذه الجولة حسمت بعض قرارات المصدر وربطت تحسينًا صغيرًا في normalization، لكنها لا تعني اكتمال فحص كل ميزة في جميع المشاريع ولا اكتمال المواصفة.
- الحالة: source tree reviewed; selected contracts checked by blob and file content; one target-native import enhancement IMPLEMENTED on P2 PR branch.
- Import code + unit/DB/build pipeline: PASS على SHA 49fa336b6a04db3d3272ac78d78cc17b89bc7a89 عبر Action 39437730603؛ لم يتم local checkout، واختبارات المتصفح/الإنتاج NOT RUN. CI رأس الوثائق الأحدث كان IN_PROGRESS ويحتاج readback نهائيًا.
- main لم يُعدل؛ جميع التعديلات على فرع PR #18 الحالي.
- next_task_id remains NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004. لا تغيّر مؤشر الاستئناف بسبب هذا الجرد وحده.


## 6. نتيجة P2 بعد طباعة المستندات المالية ومؤشر التنفيذ الحي

- طباعة مستندات مالية حسب الصلاحية: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA` على `fb8390e9a4693f1d28247bab8fcb308408845284`، [Action 39443178771 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39443178771). `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.
- حدود القائمة: لا يمكن اعتبار ظهور الملفات/الواجهات وحده قبولًا؛ القبول نُفذ باستخدام PostgreSQL 17 وعقود RPC. اختبارات الفشل السابقة محفوظة في EXECUTION_LOG مع SHA/Action وسبب كل فشل وتصحيحه.
- لا تزال مصالحة Onyx في قاعدة Nasr1 عملية تحليل فقط؛ جدول المصدر `onyx_snapshots/onyx_snapshot_rows` ومخرجات `inventory_reconciliation_runs/items` لا تطابق مخطط المشروع المانح حرفيًا، لذا لا تُنسخ SQL القديمة مباشرة. يلزم تصميم تطبيق مضبوط بالمخزن، معاينة، قفل وتحقق من تغير المخزون، وتراجع تعويضي آمن.
- `next_task_id` الوحيد الآن: `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`. لم تُنزّل أو تُستخرج أو تُعاد بصمات ZIPs، ولم تُعدّل `main` أو ملفات P1.

### Multi-project source review disposition
Treat `EXTRACTED_PROJECTS` as read-only evidence. Reuse recorded manifests, byte hashes, and accept/adapt/reject decisions; do not recopy matching files without a specific gap. The known difference between recursive source-tree entries (2,329) and the extraction report (2,044 files) remains an unresolved accounting difference. Before any later transfer, inspect the target implementation and schema first; adapt rather than copying donor migrations, old routes, or permission assumptions.
