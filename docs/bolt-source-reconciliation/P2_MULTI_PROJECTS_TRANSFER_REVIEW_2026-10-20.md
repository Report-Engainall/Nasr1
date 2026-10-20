## P2 AI Gateway telemetry hardening — exact-SHA CI PASS (20 October 2026)

- Implemented in commit 05be5beb50c56e00ec9ee733b2089a259c3d0b3e; PR #18: https://github.com/Report-Engainall/Nasr1/pull/18
- TESTED_EXACT_SHA=PASS: Aghbari Commerce checks run 39459540700, exact head 05be5beb50c56e00ec9ee733b2089a259c3d0b3e. Workflow URL: https://github.com/Report-Engainall/Nasr1/actions/runs/39459540700. Verified frozen Bun lockfile, unit suite, PostgreSQL 17 migrations/workflow and standalone AI telemetry acceptance, lint, production-build preview smoke on port 4173, and dev smoke on port 5173. Logs include the AI measured/partial/unknown, no-provider, idempotency, quota-denial and service-only RPC acceptance PASS line.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED_EXACT_SHA=PASS. BROWSER_PROVEN=NOT RUN: Playwright workflow 39459540701 completed but its runner/test steps were skipped by the environment credentials gate; this is not browser evidence. PRODUCTION_PROVEN=NOT RUN: no production migration/deployment was performed.
- The new telemetry separates provider-observed token counts from conservative budget estimates. Failed attempts remain NULL at attempt level; quotas still count conservative reservations. No prompts, outputs, secrets, or raw provider error messages are persisted. Existing service-only RPC grants and tenant-derived attribution are retained.
- Current next_task_id: NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010. Related existing PR #12 is open at head 6417e723a532b4bfd2c1a81c59ff6a78722ed721; its exact-head CI run 39438180471 FAILS in the database workflow because public.enforce_customer_price_visibility_setting_authority() calls auth.role(), which is absent from the isolated PostgreSQL 17 acceptance database. This needs reconciliation before the price-privacy feature is considered integrated. Its diff also edits P1-locked scripts/test-database-migrations.mjs; P2 will not edit that protected harness.
- Donor archives remain read-only; no ZIP re-download/extraction/fingerprint recalculation. The 2,329-tree-entry vs 2,044-file extraction discrepancy remains unresolved.

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


## P2 live checkpoint — Onyx source evidence CSV export and exact-SHA verification — 2026-10-20

- Target: `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Code/test SHA: `3fb70618eabd9f93d67f734987a1f196ca4c9084`; base reference: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-SHA CI PASS: [Aghbari Commerce checks 39481288019](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288019). Confirmed 69/69 unit-test files passed (including the new Onyx CSV formatter and browser download tests); isolated PostgreSQL 17 migrations/workflow acceptance passed; lint passed with 0 errors (11 warnings); build passed; production-preview smoke on 4173 and dev smoke on 5173 passed.
- Implemented/integrated `src/lib/onyx-source-evidence-export.ts` and a download control in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`. CSV is rendered only from the existing tenant-scoped `get_onyx_snapshot_source_evidence` RPC response; it exports the database organization identity, snapshot/import linkage and SHA-256 hashes, bounded external-ID samples, truncation indicators and explicit unavailable values. Leading controls/whitespace are scanned by character code and spreadsheet-formula prefixes `= + - @` are neutralized; CSV quotes are escaped. Unit tests cover malicious cells, quoted commas/quotes, missing import links and the unproven live-sync boundary.
- The panel is wired in the existing Onyx Snapshot Center and report analysis paths. It does not re-query around RLS, invent an external source record ID, or label a saved snapshot/import as a live sync. `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and last live-sync time unavailable remain intentional because no live connection evidence/credential was verified.
- Activation integration revalidated on the same code/test SHA: admin customer invitation control, generated `/customer/activate/$token` route and PostgreSQL acceptance remain present. Database acceptance tests use `auth.users.email_confirmed_at` for email truth, hash-only invitation tokens, tenant/role/email/expiry/replay guards, audit assertions and direct-table-DML denial. No RLS/grants were weakened.
- Preserved failure: [run 39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) failed lint because `no-control-regex` rejected the initial control-character regex. The guard was changed to a character-code scan in commit `3fb70618eabd9f93d67f734987a1f196ca4c9084`; no lint rule was disabled. That exact SHA passed run 39481288019.
- Browser/production proof remains separate: [Playwright workflow 39481288053](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288053) exited successfully after the external-infrastructure gate skipped app launch and actual browser tests. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Activation evidence was handed to P1 in [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226). Merge remains blocked by P1 migration `20261020110000_customer_activation_invitations.sql` colliding with P2 migration `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's activation migration remains `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and #26 concurrently. P1-owned `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` were not edited.
- Archive discrepancy 2,329 tree entries versus 2,044 reported extracted files remains unresolved evidence; no re-download, re-extraction or fingerprint recalculation was done.
- State axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.

The new CSV is an additive target-native export, not a bulk archive transfer or donor-code copy. Existing finance/customer print RPCs keep their tenant-scoped persisted relationships (invoice, return request/receipt, credit memo and journal where those rows are linked); do not infer that an external Onyx ID maps to a financial document unless the database contains that relationship.



## P2 FINAL BATCH CHECKPOINT — Onyx provenance + source-backed finance print — 2026-10-20

- Target only: `Report-Engainall/Nasr1`; branch `feat/p2-customer-return-intake-20261020`; PR #18. Code/test HEAD: `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`; PR base SHA: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI PASS: [Aghbari Commerce checks #39485608035](https://github.com/Report-Engainall/Nasr1/actions/runs/39485608035). Evidence: 69/69 unit-test files pass; all migrations and core-workflow acceptance on isolated PostgreSQL 17 pass; lint pass; production build pass; preview smoke port 4173 pass; dev smoke port 5173 pass.
- Onyx inbound evidence export: `src/lib/onyx-source-evidence-export.ts` plus download action in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`; UI and formatter tests pass on this HEAD. Output is built only from the existing tenant-scoped evidence RPC and includes organization identity, snapshot/import relationship, source-file SHA-256, source IDs and bounded external-ID examples, truncation flags and explicit `NOT_RECORDED/NOT_AVAILABLE` states. CSV formula-like text is neutralized after scanning leading control/whitespace characters; CSV quoting is escaped.
- Onyx outbound order export: approved-order/tenant/actor checks remain server-side in `record_onyx_order_export`; `src/lib/onyx-export.ts` now embeds the returned persisted audit event ID in the resulting XLSX. The workbook deliberately reports compatibility `غير مثبت`; central audit proves preparation, not that a browser completed download or that Onyx accepted the file.
- Live Onyx connection/sync: **NOT PROVEN**. No live connection credential/response or successful live sync evidence is asserted. The evidence export uses `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and marks live sync time unavailable rather than inventing one.
- Source-backed finance printing: `scripts/test-database-migrations.mjs` now verifies admin/manager/accountant successful invoice and statement reads and issuer identity from the current organization; staff/customer denials; and cross-tenant isolation for invoice, statement, and an actual persisted credit memo. The credit memo path uses an actual invoice line, an approved return request, a received return via RPC, and `prepare_customer_return_credit_memo`; the authorized PDF RPC returns the original return-request, invoice, journal and line identities. The resulting journal remains `draft`; no financial posting was performed by printing.
- Financial values in the CI fixture reconcile to persisted source data: invoice total 370,000; payment 100,000; outstanding 270,000. The posted general-ledger totals remain unchanged by the draft return-credit journal. The role-based staff print RPC test does **not** claim that customer-facing price/total hiding has been verified; that remains explicitly assigned to the next price-privacy task.
- The ledger test initially failed at run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) because it assumed only one ledger entry after the new source-linked return fixture created a draft journal. Fixed on `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`: the test now checks both source entries, asserts the return journal is still draft, and preserves the posted-entry count and debit/credit totals. Exact-HEAD run #39485608035 passes.
- Earlier failures retained in chronology: run [39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) was the `no-control-regex` lint rejection; fixed using a character-code scan with lint policy intact. Run [39482609393](https://github.com/Report-Engainall/Nasr1/actions/runs/39482609393) exposed a finance-payment UI test selecting the wrong form and omitting mounted finance RPC mocks; fixed by scoping the form and adding specific test mocks. Run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) is also retained as described above.
- Customer activation remains integrated and exact-head tested: admin invitation dialog, generated `/customer/activate/$token` route, PostgreSQL guards using `auth.users.email_confirmed_at`, hash-only invitation token, tenant/email/role/expiry/replay guard, direct invitation-table DML denial and audit. P1 handoff: [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226).
- Browser and production axes remain separate: [Playwright Critical Paths #39485607806](https://github.com/Report-Engainall/Nasr1/actions/runs/39485607806) completed successfully, but its app setup/actual browser checks were skipped by the external-credentials/infrastructure gate. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Merge blocker remains: P1 PR #26's `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's tested activation migration is at `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and PR #26 concurrently. No P1-owned report or source ledger/audit files were modified.
- Archive discrepancy `2,329` tree entries versus `2,044` reported extracted files remains unresolved evidence, not proven loss or a closed issue. No archive re-download, extraction, or fingerprint recalculation was performed.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.

Source selection result: added target-native lineage export and XLSX audit correlation rather than copying donor components. The finance acceptance now exercises a real invoice line, received return, draft credit memo and draft journal as linked source records. It does not invent an Onyx external ID or successful live-sync event; price privacy remains the one active next task.

**Superseding single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

The saved 011 work now has exact-SHA CI evidence for source-provenance exports, Onyx order-export audit correlation, activation guards, and source-backed finance printing. Live Onyx synchronization remains unproven and must stay labeled as such; customer-facing price/total hiding policy is not yet verified by this finance-print batch.

**Next task only:** inspect PR #12 source evidence at HEAD `be595fc74b8bbf64b308b84210d86a9aa1d464b8` and CI `39463202326`, then implement/test price visibility on the P2 branch without editing any P1-locked path. PR #26 currently owns overlapping diffs in `src/components/Storefront.tsx`, `src/lib/auth.tsx`, `src/lib/auth-redirect.ts`, and `src/lib/api.ts`; do not touch these without explicit path-level coordination. Prioritize isolated backend/RPC and database acceptance work until the shared-path ownership is resolved. Do not merge PRs concurrently.



## P2 CURRENT CHECKPOINT — customer price privacy, invoice PDF masking, exact-SHA CI — 2026-10-20

- Target `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Exact code/test HEAD: `b261d49fe65c631b989ae68af58ecf64d1e7aa98`; base SHA `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI: [Aghbari Commerce checks #39488147019](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147019) — **SUCCESS** on `b261d49fe65c631b989ae68af58ecf64d1e7aa98`. Job steps: verified Bun lockfile, dependencies installed, unit tests PASS, all migrations/core workflow acceptance on isolated PostgreSQL 17 PASS, lint PASS, build PASS, preview smoke port 4173 PASS, dev smoke port 5173 PASS.
- Price-privacy database migration `supabase/migrations/20261020040000_customer_price_visibility_controls.sql` was added. It sets conservative defaults and puts visibility decisions in tenant-scoped server RPCs: `get_public_storefront_settings()`, `get_storefront_product_prices(uuid[], numeric)`, `preview_customer_order_pricing(jsonb, text)`, `get_customer_invoice_pdf(uuid)`. Direct raw monetary columns/RLS grants were not widened.
- Settings UI is integrated into the existing Storefront tab in `src/components/AdminPages.tsx` using persisted organization settings and existing `canManageStorefrontContent` authority. It exposes five controls: product-card price, cart/review pricing, order pricing, customer invoice amounts, and customer-tier visibility. Ordinary staff do not see the controls (test `src/test/admin-price-privacy-settings.test.tsx`).
- Invoice PDF flow is linked end-to-end from server response to PDF generation: `src/routes/api.invoice-pdf.$invoiceId.ts` requires an explicit server-returned `financial_details_visible` boolean; `src/lib/finance-document-pdf.ts` hides the per-line unit-price/line-total fields and totals section if false. `src/test/finance-document-pdf-source-reconciliation.test.ts` verifies that hidden data remains absent and the PDF text does not print the financial fields.
- The first privacy CI attempt exposed a stale existing PostgreSQL assertion that expected default customer invoice amounts. The server’s defined default is `show_price_in_invoice=false` and correctly omits `subtotal`, `tax_amount`, `total_amount`, `unit_price`, and `line_total` keys from RPC JSON. The old assertion was replaced with explicit key-absence assertions; exact-head run #39488147019 then passed.
- **Remaining integration dependency:** do not edit `src/components/Storefront.tsx` while P1 PR #26 owns its current diff. Customer-facing cards/cart/order review still need P1 to consume the server visibility/pricing RPCs and suppress hidden amounts (never format a non-price sentinel as zero). P2 has posted the contract/integration handoff in [PR #26 comment #6300246106](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300246106). This vertical slice is not yet claimed `BROWSER_PROVEN` or production-proven.
- `package.json` also overlaps P1. P2 currently wires the privacy acceptance script into `test:db`; PR #26 currently adds separate customer-cart persistence and admin-catalog acceptance scripts on its branch. Resolve this overlap only during the required sequential merge/rebase, retaining **all** scripts; do not call files/scripts from P1 that are not yet present in the checked-out branch.
- Playwright workflow [39488147057](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147057) returned workflow SUCCESS but its app install, launch and actual critical-path browser tests were **SKIPPED** by the external-infrastructure gate. Status: `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- Existing release blocker remains: P1 `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`. Keep PR #18 and PR #26 sequential; never merge both concurrently.
- Onyx live connection/sync remains `NOT PROVEN`; saved snapshot and import history are not treated as live sync evidence. Archive enumeration difference (2,329 versus 2,044 reported extracted files) remains unresolved evidence, not proof of data loss.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=SERVER+ADMIN SETTINGS+INVOICE PDF=YES`, `TESTED_EXACT_SHA=PASS`; `CUSTOMER_STOREFRONT_UI=BLOCKED_P1_SHARED_PATH`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


**Single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

Next action only: after P1 confirms its Storefront path is ready for integration, wire product cards and cart/order-review surfaces to the server pricing/visibility RPCs without changing P1 work blindly. Keep the server response authoritative; do not render hidden values or a sentinel as zero. Re-run exact-HEAD CI, then browser prove the enabled and disabled state once external credentials/infrastructure are available. In parallel, resolve `package.json` test script overlap only with a coordinated sequential rebase; preserve both P1 acceptance scripts and all P2 suites. Do not advance the pointer until customer-facing product/cart/order visibility is wired and verified.
