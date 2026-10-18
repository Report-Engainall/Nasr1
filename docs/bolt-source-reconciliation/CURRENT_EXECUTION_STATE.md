# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**الهدف الوحيد:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / main.
**آخر SHA حي فُحص قبل دفعة الإقلاع:** 154ec48397164473010d40bd3b509c24f188030e — [commit](https://github.com/Report-Engainall/Nasr1/commit/154ec48397164473010d40bd3b509c24f188030e).
**CI المطابق:** [Actions 39150932901 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150932901). يخص SHA المذكور فقط ويتضمن إصلاح أعمار الذمم بحسب يوم UTC واختبار استحقاق اليوم.
**نقطة الإقلاع:** [BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md](./BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md). أعد قراءة HEAD وCI بعد كل commit.
**فجوة المصادر:** READY_TO_REUSE/PROVENANCE_MANIFEST.csv فيه 69 صفًا. سجل الدمج السابق لا يثبت قرارًا لكل ملف. ARCHIVE_MEMBERS.csv لم يكن يحوي أعضاء مستخرجة. تنزيل أرشيفي Bolt وSHA-256 واختبار ZIP والاستخراج = NOT RUN في آخر تحقق.
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

## نقطة الاستئناف الوحيدة

- next_task_id = NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001
- نزّل البايتات الحقيقية للأرشيفين من https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17، احسب SHA-256، افحص سلامة ZIP، استخرج بأمان، ثم قارن Before_Failure وRestored_Current وNasr1/main وREADY_TO_REUSE ملفًا بملف.
- أضف في SOURCE_INTEGRATION_LEDGER.csv قرارًا مستقلًا ومسار هدف واختبارًا ودليلًا لكل مادة فُحصت. حدّث ARCHIVE_MEMBERS.csv بالأعضاء الفعلية بعد الاستخراج فقط.
- افحص الفروع وPRs ولقطات Bolt والأرشيفات الأخرى. إذا تعذر binary، سجّل المحاولة ورسالة الخطأ الحقيقية وواصل أقرب مهمة كود مستقلة فورًا.
- تم إغلاق NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001 على SHA 154ec48397164473010d40bd3b509c24f188030e وActions 39150932901 SUCCESS؛ لا تكررها دون تغير مؤثر أو فشل جديد.

## حدود الإثبات
- لا يوجد متصفح تفاعلي أو إثبات إنتاج مباشر؛ preview/dev smoke ليس إثبات نشر.
- PostgreSQL 17 معزول في Actions فقط؛ لم تُطبق migrations على Supabase الإنتاجية.
- لم يثبت فك جميع الأرشيفات الثنائية أو تدقيق كل مواد المانحين.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
