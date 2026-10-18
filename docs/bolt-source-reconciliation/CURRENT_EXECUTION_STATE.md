# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الهدف الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**آخر كود اجتاز جميع بوابات CI:** [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814)  
**CI المطابق:** [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395) — unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke.

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
- `next_task_id = NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001`
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`: [commit `c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a`](https://github.com/Report-Engainall/Nasr1/commit/c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a) اجتاز [Actions 39150638459 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150638459). المهمة الجديدة `NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001`: وحّد مقارنة تاريخ الاستحقاق مع `fetch_staff_receivables_aging` على مستوى يوم UTC، وأضف اختبارًا يثبت أن فاتورة تاريخ استحقاقها اليوم ليست متأخرة حتى اليوم التالي. لا تعِد اختبار الحد 200/500؛ لقد اجتاز CI أعلاه.
- لا تكرر أي فحص من المهام أو الفلاتر أو RPC الأعمار أو طباعة التقرير أو مبالغ PDF أو حالة التأخر أو تاريخ الاستحقاق إلا بتغير المصدر أو فشل جديد.

## حدود الإثبات
- لا يوجد متصفح تفاعلي أو إثبات إنتاج مباشر؛ preview/dev smoke ليس إثبات نشر.
- PostgreSQL 17 معزول في Actions فقط؛ لم تُطبق migrations على Supabase الإنتاجية.
- لم يثبت فك جميع الأرشيفات الثنائية أو تدقيق كل مواد المانحين.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
