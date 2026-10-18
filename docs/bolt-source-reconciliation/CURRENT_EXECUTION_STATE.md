# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**الهدف الوحيد:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / main.
**آخر SHA كود اجتاز CI كاملًا:** `a38e43f4da656da6cc10abdb476b0023dd029440` — [commit](https://github.com/Report-Engainall/Nasr1/commit/a38e43f4da656da6cc10abdb476b0023dd029440).
**CI المطابق للكود:** [Actions 39173352654 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39173352654), exact SHA `a38e43f4da656da6cc10abdb476b0023dd029440`; frozen Bun lock، unit tests، isolated PostgreSQL 17 migrations/RLS acceptance، lint، build، production-preview smoke (4173) وdev smoke (5173) كلها PASS. هذا إثبات CI فقط؛ لا يثبت متصفحًا تفاعليًا أو نشر الإنتاج. تدقيق الأرشيفات: [Actions 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307) على SHA `92a948e83ebc05278b09d50aec410da490c76f7c`.
**نقطة الإقلاع:** [BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md](./BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md). أعد قراءة HEAD وCI بعد كل commit.
**فجوة المصادر:** أدلة فحص ZIP/CRC والاستخراج الآمن تاريخية على Actions 39157355307، بينما إعادة التنزيل في جلسة 2026-10-19 لم تكتمل (أخطاء موثقة في ARCHIVE_MANIFEST.csv). تمت مراجعة المحتوى والعقود ومخاطر التوافق للصفوف الـ69 وتوثيق قرار كل صف في READY_TO_REUSE_FILE_AUDIT.csv؛ لا يعني ذلك تشغيل كود كل مانح.
**النزاهة المالية:** لا توجد فواتير تاريخية سابقة مطلوب اختلاقها؛ لا تنشئ أرقامًا تجريبية.


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

## نقطة الاستئناف الوحيدة

- completed_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001 (all 69 candidate rows classified; cash expenses adapted and exact-SHA tested).
- next_task_id = NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002
- Review each of 69 READY_TO_REUSE candidates against live app contracts and implement useful missing behavior only. Prioritize security/data correctness, commerce/inventory/import/Onyx, then finance/admin/analytics.
- Do not blind-copy old React Router screens or apply legacy SQL with DROP FUNCTION ... CASCADE. Do not invent historical invoices or demo data. No paid services.

## إعادة تحقق أرشيفات Bolt

- أضيفت روابط raw immutable للأرشيفين إلى `scripts/reconcile-source-release-snapshots.py` مع التحقق من الحجم وSHA-256 المنشورين.
- `NASR1-BOLT-RECOVERY-01`: 1,003,172 bytes; SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`; 359 عضوًا. `NASR1-BOLT-RECOVERY-02`: 997,589 bytes; SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`; 358 عضوًا.
- [Archive audit 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307) على SHA `92a948e83ebc05278b09d50aec410da490c76f7c`. تم التحقق من أعضاء ZIP حتى EOF، CRC، المسارات الآمنة وحدود الحجم/نسبة الضغط، واستخراج ملفات مصدر/نصوص محددة مؤقتًا خارج التطبيق. هذا إثبات سلامة أرشيف، لا إثبات دمج جميع وظائفه.
- ملفات الحالة والسجل والجرد تُحدّث في commits توثيقية تالية؛ يجب التحقق من CI المطابق للرأس النهائي قبل إعلان الإقفال.

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
