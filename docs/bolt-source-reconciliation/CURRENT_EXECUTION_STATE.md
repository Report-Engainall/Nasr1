# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الهدف الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**آخر كود اجتاز جميع بوابات CI:** [`98a80df80b366e811923b80d53fe06a519e754d0`](https://github.com/Report-Engainall/Nasr1/commit/98a80df80b366e811923b80d53fe06a519e754d0)  
**CI المطابق:** [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503) — unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke.

## آخر إنجاز برمجي حقيقي

- استُبدل الاكتفاء بحساب أعمار الذمم من صفحات التفاصيل المحدودة بملخص كامل من الخادم داخل `get_customer_account_statement()`.
- RPC يعيد `summary_as_of_utc` وملخصًا منفصلًا لكل عملة من دفتر الفواتير والمدفوعات الكامل: إجمالي الفواتير، المدفوع، المتبقي، المتأخر وعدده، والرصيد الذي لا يملك تاريخ استحقاق صالحًا وعدده.
- تفاصيل أول 200 فاتورة تحمل `paid_amount` و`outstanding_amount` محسوبين على كل مدفوعات تلك الفاتورة، حتى لو لم تقع بعض الدفعات ضمن قائمة أحدث 500 دفعة المعروضة.
- PDF يفضّل ملخص RPC الموثوق، ويستخدم وقت الخادم ذاته لوسم التأخر؛ إذا كان backend قديمًا لا يرسل الملخص، يعود للحساب من السجلات المعادة ويضع تنبيهًا واضحًا. لم تتم إضافة RPC موازٍ أو اعتماديات جديدة.
- اختبارات الملخص تشمل دقة bigint للأرقام الكبيرة، المجاميع المختلطة، التحقق من الحقول، عزل عميل عن الآخر، المطابقة للمجاميع المسجلة في PostgreSQL، والحدود القائمة. [CI 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503).

## تحديث مرآة READY_TO_REUSE

- المسار: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`
- تُحدّث المرآة الآن إلى نفس SHA المختبر `98a80df80b366e811923b80d53fe06a519e754d0` وتشمل 10 ملفات؛ manifest منفصل محدث بالبصمات.
- دليل اختبار المصدر: [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503). نتيجة CI للـcommit الذي يحدّث المرآة والوثائق نفسها **PENDING** حتى التحقق من تشغيله المطابق.
- ملف `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الأصلي للمصادر المانحة محفوظ بدون تعديل.

## أعمال مغلقة — لا تُعد فحصها دون سبب جديد

- مركز المهام والأحداث ومنع التكرار والإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- RPC أعمار الذمم للمؤسسة وفصل العملات والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة RTL/A4 واختبارات واجهة التقرير: [39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) — SUCCESS.
- رفض مبالغ PDF غير الصحيحة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- وسم التأخر وتاريخ الاستحقاق في PDF: [39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217)، [39146074209](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209) — SUCCESS.
- ملخص الأعمار حسب العملة والحساب الخادمي الكامل: [39148856503 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503).

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001`
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`: [commit `cbbcce4b1db64530f8234e82523e2b2aebbe6f53`](https://github.com/Report-Engainall/Nasr1/commit/cbbcce4b1db64530f8234e82523e2b2aebbe6f53) و[Actions 39149188875 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39149188875). المهمة الحالية `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001`: اختبر أن ملخص العميل يظل كاملًا عندما يتجاوز دفتره 200 فاتورة أو 500 دفعة، بينما قوائم التفاصيل تظل مقيدة. لا تعِد الاختبارات السابقة المغلقة.
- لا تعُد تدقيق مركز المهام أو فلاتره أو RPC أعمار الذمم للمؤسسة أو طباعة التقرير أو المبالغ السالبة أو حالات التأخر/الاستحقاق، ما لم يتغير كودها أو يظهر فشل جديد.

## حدود الإثبات

- لا يوجد اختبار متصفح تفاعلي مباشر أو إثبات نشر إنتاجي؛ preview/dev smoke داخل CI لا يثبت النشر.
- ترحيلات قاعدة البيانات اختُبرت في PostgreSQL 17 معزول ضمن CI، ولم تُطبق على Supabase الإنتاجية.
- لم يثبت فك جميع الأرشيفات الثنائية أو مراجعة كامل مواد المانحين.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
