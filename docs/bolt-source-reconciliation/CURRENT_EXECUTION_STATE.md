# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**آخر نقطة كود:** [commit `ba9523fdbe643d7a6503dce54f6d1b740f3f06ca`](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).  
**CI للكود الحالي:** [Actions 39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217) — `PENDING` عند آخر قراءة: Bun والـlockfile نجحا، والتثبيت جارٍ؛ اختبارات الوحدة وPostgreSQL 17 وlint وbuild وpreview/dev smoke لم تُثبت بعد على هذا SHA.

## دفعة التنفيذ الحالية

- كشف الحساب PDF: `resolveCustomerStatementInvoiceStatus()` يستخدم حالة الفاتورة، وتاريخ الاستحقاق، والمبالغ المسددة لتحديد «متأخرة» و«متأخرة جزئيًا»، ويقيّم التاريخ على وقت توليد ثابت؛ يحتفظ بالتاريخ المفقود كحالة مستحقة غير مؤكدة، ولا يتجاوز حالة «ملغاة». [تنفيذ الدالة](https://github.com/Report-Engainall/Nasr1/commit/3c1bee5dea79cd055b3ac8d402adfbf7cf904f15).
- اختبارات القواعد: [commit `9b10d34b4b61c92871b8cc6d3874909d34f79e0a`](https://github.com/Report-Engainall/Nasr1/commit/9b10d34b4b61c92871b8cc6d3874909d34f79e0a) يختبر: متأخرة، متأخرة جزئيًا، استحقاق مستقبلي، تاريخ غير موجود، مدفوعة وفق الحالة، مدفوعة وفق الرصيد، وملغاة.
- فشل حقيقي ظهر في اختبار PDF الفردي لأن الدالة القديمة `statusLabel()` ما زالت مطلوبة من ذلك المستند. أعدنا رندر حالة الفاتورة الفردية كمكوّن مستقل مع إبقاء منطق كشف الحساب المشتق من الدفعات والاستحقاق. [تصحيح السبب](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- لا تسجّل نجاح هذا التغيير قبل نتيجة Actions النهائية على `ba9523f`؛ لا حاجة لإعادة قراءة أو إعادة فحص الميزات التي اجتازت بواباتها أدناه ما لم يتغير كودها.

## منجزات تم إثباتها — لا تُعد فحصها من البداية

- مركز المهام، توليد الأحداث ومنع تكرارها، حدود المؤسسة/الدور والإسناد: [Actions 39143265290 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ المشتركة بين القائمة والطباعة: [Actions 39144118407 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- أعمار الذمم: حساب الإجمالي والمدفوع والمتبقي من الفواتير والدفعات، فصل العملات، نطاقات التأخر، غياب due date، pagination والتحقق من الدور: [Actions 39144691226 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة أعمار الذمم RTL/A4 واختبار UI للعرض والطباعة/حجب RPC المالي عن غير المحاسب: [39144916657 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- رفض إجمالي فاتورة PDF السالب والدفعات الصفرية/السالبة: [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- قاعدة كل انطلاقة تتطلب إنجازًا برمجيًا/اختباريًا في `AGENTS.md`: [Actions 39144280302 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).
- سجل تفاصيل الأدلة والأسباب المكتشفة: [EXECUTION_LOG.md](./EXECUTION_LOG.md).

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-VERIFY-CI`
- اقرأ نتيجة `39145659217` فقط لهذا التغيير. إذا نجحت: حدّث حالتي `TESTED` ونقطة الاستئناف وسجل المتطلبات، ثم ابدأ بفجوة مستقلة. إذا فشلت: أصلح خطأ الاختبار/البناء المحدد، ولا تعد تحليل الأجزاء المكتملة أعلاه.

## حدود الإثبات

- لم يجر تحقق متصفح تفاعلي مباشر أو إثبات إنتاج مباشر. CI preview/dev smoke لا يثبت النشر الإنتاجي.
- قواعد البيانات المختبرة PostgreSQL 17 معزول في Actions؛ لم تُطبق migrations على Supabase الإنتاجية.
- لا يوجد ادعاء بأن الأرشيفات الثنائية فُكت بالكامل أو أن كل محتويات `READY_TO_REUSE` دُققت.
- لا اعتماديات أو خدمات مدفوعة جديدة.

حالات الإثبات مفصولة دائمًا: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.