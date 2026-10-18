# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الهدف الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**كود التطبيق المختبر:** [`f830678ea99f4bb2318305a5f2e70ee761dbea1e`](https://github.com/Report-Engainall/Nasr1/commit/f830678ea99f4bb2318305a5f2e70ee761dbea1e)  
**CI المطابق:** [Actions 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166) — Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.

## آخر إنجاز برمجي
- أضيف ملخص أعمار الذمم داخل كشف الحساب PDF حسب العملة: الفواتير، المدفوع، المتبقي، المتأخر مع عدد الفواتير، والرصيد الذي لا يملك تاريخ استحقاق صالحًا مع العدد.
- الحساب مبني من الفواتير والدفعات المسجلة ووقت توليد المستند؛ العملات لا تُجمع معًا. الفاتورة الملغاة والمدفوعة بالكامل لا تدخل ضمن المتأخر. التاريخ الفارغ/غير الصالح يبقى رصيدًا بلا استحقاق معروف.
- اختبارات YER/USD/EUR تشمل الدفعات الجزئية والكاملة، فاتورة ملغاة ومدفوعاتها، استحقاقًا مستقبليًا وتاريخًا مفقودًا. YER: invoiced 19000 minor units، paid 8000، outstanding 11000، overdue 7500، unknown-due 3500.
- [Exact-SHA CI 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166).

## مرآة READY_TO_REUSE
- المجلد: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`
- حُدثت المرآة إلى SHA المختبر `f830678ea99f4bb2318305a5f2e70ee761dbea1e` في 9 ملفات فعلية مع manifest مستقل؛ تمت مطابقة blob SHAs للمصدر والنسخة.
- الإصدار الأول للمرآة اجتاز [Actions 39146625789](https://github.com/Report-Engainall/Nasr1/actions/runs/39146625789). تحديث المرآة الحالي يتضمن ملخص أعمار الذمم الجديد؛ **CI الخاص بcommit المجلد/الوثائق الجديد PENDING** حتى التحقق من التشغيل المطابق.
- `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الأصلي لم يتغير؛ لا تخلط بيانات المانحين مع provenance كود Nasr1.

## الأعمال المغلقة — لا تعِد فحصها دون سبب جديد
- مركز المهام والأحداث ومنع التكرار والإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- RPC تقرير أعمار الذمم وفصل العملات والفئات والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة أعمار الذمم RTL/A4 واختبار الواجهة والصلاحية: [39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) — SUCCESS.
- رفض مبالغ PDF غير الممكنة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- حالة التأخر في كشف PDF: [39145659217 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217).
- تاريخ الاستحقاق وترقيم صفحات PDF: [39146074209 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209).
- ملخص أعمار الذمم داخل PDF حسب العملة: [39147039166 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166).
- قاعدة الإنجاز الحقيقي في كل انطلاقة محفوظة في [AGENTS.md](../../AGENTS.md).

## نقطة الاستئناف الوحيدة
- `next_task_id = NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`
- تم إغلاق بوابة تحديث المرآة: [Actions 39147434273 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147434273)، والملفات التسعة والـmanifest قُرئت مجددًا وتطابقت. واصل الآن `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`: افحص عقد RPC الحالي مرة واحدة، وأضف اختبارًا محددًا للمطابقة إذا كانت البيانات المعادة متوافقة مباشرة. لا تعِد تنفيذ أو فحص RPC أعمار الذمم السابق.
- لا تعِد فحص مركز المهام أو فلاتره أو تقرير أعمار الذمم السابق أو الطباعة أو مبالغ PDF السالبة أو حالة التأخر أو تاريخ الاستحقاق، إلا إذا تغيّر مصدرها أو ظهر فشل جديد.

## حدود الإثبات
- لا يوجد تحقق متصفح مباشر أو إثبات نشر إنتاجي مباشر؛ preview/dev smoke داخل CI لا يثبت نشرًا إنتاجيًا.
- اختبارات قاعدة البيانات في PostgreSQL 17 معزول؛ لم تُطبق migrations على Supabase الإنتاجية.
- لم يثبت فك كل الأرشيفات الثنائية أو اكتمال مراجعة كل ملفات المانحين.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
