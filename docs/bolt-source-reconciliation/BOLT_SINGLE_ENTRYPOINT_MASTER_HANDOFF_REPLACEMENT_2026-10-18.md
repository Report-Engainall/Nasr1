# نقطة الدخول التنفيذية الوحيدة — متجر الأغبري | Nasr1
## أمر حاكم بديل — 18 أكتوبر 2026 — استخراج المصادر والدمج الفعلي

اقرأ هذه الوثيقة كاملة قبل تعديل الكود. هي نقطة الإقلاع الحالية الوحيدة وتتقدم على كل رسالة أو ملف تنفيذ أقدم متعارض. المواصفة الهندسية وسجلات التاريخ مراجع متطلبات، أما المهمة الحية فتؤخذ من CURRENT_EXECUTION_STATE.md بعد مطابقة HEAD وCI.

**هدف تعديل الكود الوحيد:** https://github.com/Report-Engainall/Nasr1 على main.
**مصادر القراءة فقط:** https://github.com/Report-Engainall/report-insight-engine
**أرشيفات استعادة Bolt:** https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17
**رسالة النسخ:** BOLT_BOOT_MESSAGE_2026-10-18.txt
**مؤشر الاستئناف:** CURRENT_EXECUTION_STATE.md
**السجل:** EXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv
**المواد الجاهزة:** READY_TO_REUSE/PROVENANCE_MANIFEST.csv وجميع الملفات الفعلية تحت READY_TO_REUSE

## تكليف P2 الإضافي — مصادر NASR المستخرجة وقبول المواصفة (20 أكتوبر 2026)

اقرأ ونفّذ أيضًا docs/bolt-source-reconciliation/P2_ADDITIONAL_ACCEPTANCE_MANDATE_2026-10-20.md. هذا نطاق إضافي لا يلغي next_task_id الحي ولا يكرر ملكية المبرمج 1. مصدر القراءة الإضافي هو Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER/EXTRACTED_PROJECTS فقط؛ لا تعِد استخراج الملفات الموجودة ولا تعدّ الأرشيفين المتطابقين مرتين. يجب مراجعة الوظائف المرشحة مقابل Nasr1 الحالي ثم دمج الفجوات المثبتة فقط واختبارها.


## 1. حواجز إلزامية

1. Nasr1/main هو الهدف الوحيد. لا تنشئ متجرًا أو مستودعًا أو قاعدة بيانات أو Supabase project بديلًا، ولا تنقل التنفيذ إلى Report-Advisor أو Aghbari-Technologies/aghbari-commerce-evolved. بقية المستودعات والفروع وPRs والأرشيفات مصادر للقراءة والمقارنة فقط.
2. لا تستخدم reset أو clean أو force-push أو إعادة كتابة التاريخ، ولا تمحُ عملًا غير محفوظ. افحص الحالة واحفظ التغييرات. إن تقدم main، أعد القراءة وابنِ على الرأس الجديد.
3. حافظ على الكود والواجهات الحالية وهوية Nasr1 وRTL؛ أكمل فوق الموجود ولا تعِد البناء من الصفر.
4. لا تنشئ بيانات وهمية أو أزرارًا شكلية. **لا توجد فواتير تاريخية سابقة مطلوب افتراضها أو اختلاقها.** لا تضف فواتير أو دفعات أو أرصدة افتتاحية تجريبية. اعرض الحالة الفارغة إن لم توجد معاملات حقيقية.
5. لا تضف خدمات أو APIs أو مكتبات أو خطط قد تفرض تكلفة أو فوترة تلقائية. استخدم الموجود والبدائل المجانية فقط.
6. قراءة ملف أو نسخه إلى مجلد مرجعي أو ذكره في تقرير ليست دمجًا. الدمج يعني إدخاله في الوحدة الفعلية، وربطه بالخدمات والمسارات والبيانات والصلاحيات اللازمة، ثم اختباره.

## 2. إقلاع الجلسة والتنفيذ

1. تحقق من main HEAD الحي وbranch وحالة الشجرة وGitHub Actions المطابق لذلك SHA. إن لم تتوفر workspace محلية، اكتب git fetch/status والاختبارات المحلية NOT RUN بدل ادعاء تشغيلها.
2. اقرأ CURRENT_EXECUTION_STATE.md وقارنه بالحالة الحية، وصحح المؤشر القديم. استخدم next_task_id واحدًا فقط؛ لا تكرر إنجازًا مثبتًا ما لم يتغير مصدر/مدخل/اعتماد أو يظهر فشل أو regression أو ثغرة.
3. اقرأ EXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وكل ملف من READY_TO_REUSE.
4. نفّذ تغيير كود مترابطًا ذا معنى؛ التلخيص والخطة وتغيير الحالة وحده لا يكفي. شغّل الاختبارات المتعلقة وأصلح الفشل، ثم احفظ commit آمنًا في main. أعد قراءة SHA النهائي وCI المطابق له بصورة مستقلة.
5. إذا تعذر مصدر، سجّل الرابط وطريقة المحاولة ورسالة الخطأ الحرفية وما بقي غير مفحوص، ثم نفذ في الجلسة نفسها أقرب عمل مستقل ممكن بدل التوقف.

## 3. READY_TO_REUSE — كل ملف، بلا استثناء

افحص كل صف وكل ملف مادي من PROVENANCE_MANIFEST.csv وجميع المجلدات الفرعية، لا README أو أسماء الملفات وحدها. كان العدد المرصود سابقًا 69 صفًا؛ أعد العد من manifest الحي.

لكل عنصر: راجع repository/branch/commit/blob/path والبصمة والمحتوى، قارنه بالكود الحي في Nasr1 وتتبع imports والخدمات والعقود والـroutes والاختبارات والـSQL/RLS/RPC والتبعيات. احتفظ بالأصل المرجعي كما هو.

يجب تسجيل قرار مستقل لكل ملف: ALREADY_PRESENT_EXACT، ALREADY_PRESENT_BETTER، INTEGRATE_AS_IS، ADAPT_AND_INTEGRATE، COMPLETE_EXISTING، KEEP_AS_REFERENCE، DUPLICATE_PROVEN، EXCLUDED_SECURITY، INCOMPATIBLE_WITH_EVIDENCE، BLOCKED. سجّل المصدر والبصمة ومسار الهدف والسبب والتبعيات وأمر الاختبار ونتيجته ورابط الدليل. لا تترك ملفًا مفحوصًا دون قرار؛ لا تستخدم DUPLICATE دون مسار النسخة الأفضل، ولا BLOCKED بلا URL ومحاولة ورسالة خطأ محددة.

ادمج/كيّف كل فائدة مثبتة غير موجودة أو ناقصة داخل الوحدة الفعلية في Nasr1 ووصل imports/services/routes/UI/schema/security/tests اللازمة. لا تهمل helpers وtests وvalidators وretry/idempotency وOutbox وSQL/RLS والتوثيق الأمني. لا تطبق SQL من مصدر مانح مباشرة؛ افحص مخطط Nasr1 وترتيب migrations والقيود وRLS/grants/RPC/search_path وعزل tenant قبل الدمج.

## 4. تنزيل واختبار وفك أرشيفي Bolt

المجلد: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17

- Nasr1_Bolt_Before_Failure.zip — حجم metadata المرصود 1,003,172 بايت؛ Git blob SHA-1: 7c35f3ecde19dc5596fd22053be61924ef3d5318.
- Nasr1_Bolt_Restored_Current.zip — حجم metadata المرصود 997,589 بايت؛ Git blob SHA-1: f01684a56e093a33a173b0965d1d7239c48f0936.
- README_AR.md.

metadata لا تثبت تنزيل البايتات أو اختبار CRC أو فك المحتوى أو الدمج؛ Git blob SHA-1 ليس SHA-256 للـZIP.

حاول جلب البايتات الفعلية في بيئة Bolt/workspace بأداة مجانية (raw GitHub أو API/CLI أو curl/wget). لكل ZIP قِس الحجم، احسب SHA-256، نفذ unzip -t أو اختبار integrity مكافئ وسجّل النتيجة. افحص المسارات لمنع zip-slip والروابط الرمزية غير الآمنة، واستخرج إلى مجلد مؤقت خارج التطبيق. راجع السكربتات قبل تشغيلها، ولا تنقل .env أو secrets أو tokens أو بيانات العملاء إلى Git.

بعد الاستخراج الفعلي فقط، اكتب أعضاء ARCHIVE_MEMBERS.csv بمساراتها وأحجامها وSHA-256 ونوعها وحالة الاستخراج والقرار. لا تخمّن الأعضاء أو البصمات. قارن Before_Failure مع Restored_Current ملفًا بملف، ثم قارن كليهما مع Nasr1/main وجميع READY_TO_REUSE؛ حدد الملفات المفقودة والجديدة والمتغيرة والمكررة بحسب المحتوى والبصمات. ادمج كل فائدة ثبت غيابها ووصلها فعليًا واختبرها. نسخ الملفات إلى مجلد مرجعي لا يساوي الدمج.

إذا تعذر تنزيل binary، سجّل URL والطريقة ورسالة الخطأ الحرفية، ثم واصل فورًا بمصدر نصي متاح أو إصلاح مستقل؛ لا تتوقف ولا تدّعِ فكًا لم يحدث.

## 5. كل الفروع وPRs واللقطات والأرشيفات

افحص كل الفروع وPRs وcommits وdiffs المتاحة مع pagination حتى نهاية القوائم، من Nasr1 والمصادر المانحة ذات الصلة. افحص لقطات Bolt المتاحة أيضًا. آخر حالة مرصودة أظهرت recovery/bolt-snapshot-2026-10-17 وPR #1 كمسودة؛ أعد فحصها حيًا وقارن الملفات، ولا تدمج فرعًا أو PR كاملًا عميانيًا.

راجع incoming-archives/commerce-source-reconciliation والأرشيفات وأدوات الجرد والـworkflows التابعة لها إذا ظلت متاحة. لا تخلطها بمجلد recovery الجديد ولا تعتمد على حجم تاريخي أو اسم بدل البايتات الفعلية. لكل ملف مصدر/عضو أرشيف صف مستقل في SOURCE_INTEGRATION_LEDGER.csv، ولا تختصر مجموعة ملفات في قرار جماعي.

## 6. بناء النسخة الشاملة الموحدة بالترتيب

**أولًا — الأمان وصحة البيانات:** عزل tenant، RLS وRPC وتفويض الخادم، منع تزوير الأسعار والإجماليات من المتصفح، دقة النقدية والمدفوعات والذمم، التزامن ومنع التكرار وسجل التدقيق.

**ثانيًا — التجارة والمخزون والاستيراد والتكامل:** كتالوج وسلة وطلبات ومشتريات وحركات مخزون وجرد وتنبيهات؛ أسعار جملة الجملة/الجملة/التجزئة يحددها الخادم بحسب تصنيف العميل؛ CSV/Excel validation/preview/hash/resume؛ retries/Outbox؛ Onyx Pro عبر external IDs ووقت/حالة آخر مزامنة وسجل الأخطاء. لا تدّعِ Onyx حيًا دون دليل اتصال ومزامنة فعليين.

**ثالثًا — المحاسبة ولوحة الإدارة والتحليلات:** المستندات المالية، دليل الحسابات وقيود اليومية/دفتر الأستاذ وميزان المراجعة والأرباح والخسائر والمركز المالي والتدفق النقدي حين يدعمها النموذج، النقدية والبنوك والمصروفات والذمم وأعمارها وتخصيص الدفعات والمرتجعات والتسويات وإقفال الفترة والتدقيق. إن نقص المخطط فنفّذ migrations/services/permissions/tests؛ لا تضع صفحة أو زرًا شكليًا.

**مركز المهام:** يولّد من أحداث محفوظة فعلية فقط، بمنع التكرار idempotency ومصالحة وإسناد وتدقيق حسب tenant/role. الطباعة لكل المهام أو حسب المبيعات/المحاسبة/المخزن/المشتريات/الإدارة يجب أن تستخدم الفلاتر والصلاحيات نفسها المستخدمة في الشاشة ولا تتجاوز RLS أو تكشف مهامًا مخفية. لا تولّد مهام demo.

## 7. الاختبارات والتسليم

شغّل الاختبارات المرتبطة: frozen install/lock، unit/Vitest، TypeScript/lint، PostgreSQL migrations/acceptance، RLS/RPC/tenant isolation، build، routes، preview/dev smoke، والمتصفح إن توفرت الأداة. أصلح الفشل من جذره؛ غير المشغّل = NOT RUN. لا تختبر بتغييرات مباشرة على الإنتاج.

افصل الحالات: IMPLEMENTED، INTEGRATED، TESTED، BROWSER-PROVEN، PRODUCTION-PROVEN؛ كل منها يتطلب دليلًا منفصلًا. حدّث CURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وفق ما تحقق فقط. سلّم SHA ورابط commit وCI المطابق والملفات المتغيرة والأوامر والنتائج والمصادر المدمجة ومساراتها واختباراتها وما بقي مرجعًا/محجوبًا ولماذا، ثم next_task_id واحدًا. لا تدعِ اكتمال المصالحة أو التطبيق ما دام عنصر جوهري غير مفحوص أو غير مثبت.


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

### Resume command
Read this checkpoint and `PROGRAMMER_2_CURRENT_REPORT.md`, then execute only `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Do not revisit the closed Onyx CSV substep unless its exact-head tests regress. Re-read and verify the new code/test SHA separately from any later documentation-only HEAD; never label a doc-only successor as CI-tested without a matching run.



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

### Superseding resume command

Read `CURRENT_EXECUTION_STATE.md` and `PROGRAMMER_2_CURRENT_REPORT.md`, then execute only `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. This supersedes the older resume command that promoted task 010 before the 011 source-lineage and finance-print substeps were verified. The 011 code/test checkpoint is exact-SHA `6360029af6f382c19d7e42b68eb4b7ad35c0bce2` and CI `39485608035`. Do not revisit the completed source CSV/audit correlation work unless its tests regress. Avoid P1-owned UI/auth paths until explicit coordination. Read back any state changes and keep the live-sync claim marked NOT PROVEN.

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
