# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**الهدف الوحيد:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / main.
**آخر SHA كود اجتاز CI كاملًا:** `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75` — [commit](https://github.com/Report-Engainall/Nasr1/commit/dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75).
**CI المطابق للكود:** [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840), SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`; frozen Bun lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke PASS. تدقيق الأرشيفات: [Actions 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307) على SHA `92a948e83ebc05278b09d50aec410da490c76f7c`.
**نقطة الإقلاع:** [BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md](./BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md). أعد قراءة HEAD وCI بعد كل commit.
**فجوة المصادر:** تم تنزيل وفحص وفك أرشيفي Bolt، وسجل 717 عضوًا فعليًا. مسار/blob audit لجميع 69 صف READY_TO_REUSE مسجل؛ المراجعة الدلالية لعقود/imports/routes/RLS لكل صف لم تكتمل.
**النزاهة المالية:** لا توجد فواتير تاريخية سابقة مطلوب اختلاقها؛ لا تنشئ أرقامًا تجريبية.

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
- READY_TO_REUSE path/blob audit: 4 exact, 2 differing target contents, 63 target paths missing. This does NOT mean every donor feature is absent; semantic review of all 69 rows remains incomplete.
- The legacy audit screen was adapted to active route /admin/audit with actual columns, same-tenant admin/manager SELECT RLS, no direct authenticated DML, search and filtered printing. Code SHA bb08320b690203f7f9b1ce65287e389e847c2dea passed Actions run 39154450426.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on that exact code SHA. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. Production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.

## تكامل دلالي جزئي مثبت — تحقق مدخلات التحصيل

- تمت مراجعة المرشح `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/finance.ts` بدل نسخه كاملًا؛ عقده القديم `requireSupabase` وواجهات خدمته لا تطابق معمارية Nasr1 الحالية.
- كُيّفت قواعد التحقق الملائمة في `src/lib/finance-input.ts` ووُصلت فعليًا بنموذج التحصيل في `src/components/CustomerWorkflows.tsx`: المبلغ موجب بمنزلتين عشريتين، منع الصيغ الأسية/القيم غير الآمنة، حصر طرق الدفع في الخيارات الحالية، وحدود مرجع العملية والملاحظات.
- أضيفت `src/test/finance-input.test.ts` لاختبار الحدود السليمة والرفض. فحص الخادم/المعاملة ما زال المرجع الحاكم لحالة الفاتورة والرصيد المستحق وعزل المؤسسة؛ تحقق الواجهة دفاع إضافي وليس بديلًا عنه.
- [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840) على SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`: unit tests وPostgreSQL 17 migrations/RLS وlint/build وpreview/dev smoke PASS.
- هذا قرار `ADAPTED_PARTIAL_INTEGRATION` لمرشح واحد فقط؛ لا يعني دمج خدمة finance.ts كاملة ولا إغلاق مراجعة 69 ملفًا.

## نقطة الاستئناف الوحيدة

- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001
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
- أرشيفا Bolt اجتازا إعادة تحقق آلية على SHA `92a948e83ebc05278b09d50aec410da490c76f7c` في Actions 39157355307: الحجم وSHA-256 وممر CRC/فك الضغط لكل عضو وفحوص المسارات وحدود التوسع والاستخراج المؤقت المحدود PASS. لم تُشغّل ملفات الأرشيف ولم تُطبق SQL. التدقيق الدلالي لكل مواد المانحين ما زال مفتوحًا.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
