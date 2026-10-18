# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الوحيد:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**آخر HEAD مرصود قبل تحديث هذا الملف:** `dcb1993e2f51126cc303b2856ffff21b0e1a38e2`  
**آخر دفعة كاملة اجتازت CI:** اختبارات UI أعمار الذمم/الطباعة على [SHA `cf2b5893e20b5a9d500249ba215feab5c67b6c21`](https://github.com/Report-Engainall/Nasr1/commit/cf2b5893e20b5a9d500249ba215feab5c67b6c21)، [Actions 39145164044 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).

## منجز ومثبت بالاختبار

- `NASR1-OPS-TASK-CENTER-001`: مركز تشغيل موحد فوق `ai_tasks` الحالية، منشّط بالأحداث الحقيقية، مع idempotency وصلاحيات مؤسسة/دور وRPCs مدققة ومسار `/admin/tasks` وطباعة RTL/A4.
- `NASR1-TASK-ASSIGNMENT-001`: دليل موظفين خادمي مقيد بالمؤسسة والمسؤول/المدير؛ الخادم يتحقق من توافق دور الموظف عند الإسناد. [Actions 39143265290 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- `NASR1-OPS-TASK-FILTERS-001`: فلاتر الأولوية، المسؤول/غير المسندة، وتاريخ الإنشاء مطبقة على نفس مجموعة النتائج المعروضة والمطبوعة. [Actions 39144118407 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- `NASR1-FINANCE-COLLECTION-AGING-001`: تقرير أعمار الذمم يحسب الرصيد من الفواتير والدفعات المسجلة خادميًا، يستبعد الفواتير الملغاة، يفصل العملات، يصنف فترات التأخر، ويعرض غياب تاريخ الاستحقاق كفئة مستقلة. اختبارات القبول تؤكد إجمالي 370000 والمدفوع 100000 والمتبقي 270000 وحدود الصفحات ورفض عميل غير مخول. [SHA `437527ff30bc44ce9a1cdf170c89edd5fc5b3104`](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104) — [Actions 39144691226 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة التقرير RTL/A4 عبر المتصفح دون مكتبة جديدة؛ CI للزر وCSS نجح في [Actions 39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657) و[39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394).
- اختبار الواجهة `src/components/CustomerWorkflows.finance-aging.test.tsx` غطى عرض فاتورة بمبلغ مستحق وتاريخ استحقاق مفقود، استدعاء الطباعة، ومنع مستخدم بلا دور مالي من استدعاء RPC. عولجت حساسية تنسيق الأرقام بحسب اللغة في commit `cf2b5893e20b5a9d500249ba215feab5c67b6c21`; [Actions 39145164044 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- قاعدة «إنجاز حقيقي في كل انطلاقة» موجودة دائمًا في [AGENTS.md](https://github.com/Report-Engainall/Nasr1/blob/main/AGENTS.md) وتتطلب تعديلًا برمجيًا/اختباريًا مفيدًا في كل جلسة، اختبارًا حقيقيًا، وسجل SHA ونتيجة وخطوة تالية. [Commit `f575fbac840f490781da3c1f7e32041ab60062c8`](https://github.com/Report-Engainall/Nasr1/commit/f575fbac840f490781da3c1f7e32041ab60062c8) — [Actions 39144280302 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

## دفعة نشطة — تشديد تحقق PDF المالي

- `src/lib/finance-document-pdf.ts`: رفض إجمالي فاتورة سالب ورفض دفعات كشف الحساب التي قيمتها صفر أو سالبة قبل إنشاء PDF؛ المخطط القائم يفرض أصلًا إجماليًا غير سالب ودفعة موجبة.
- `src/lib/finance-document-pdf.test.ts`: اختبارات رجعية لهذه الحالات.
- التنفيذ محفوظ في [commit `c6f67a8ee45ee6da04a1760d663a32d1cf697b06`](https://github.com/Report-Engainall/Nasr1/commit/c6f67a8ee45ee6da04a1760d663a32d1cf697b06)، والاختبارات في [commit `4e8e8a70f8d987585e436f1c8e6877dbb9276e58`](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- CI للتغيير ولنسخة الاختبار كان **PENDING عند آخر قراءة**: [39145321118](https://github.com/Report-Engainall/Nasr1/actions/runs/39145321118) و[39145334417](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417). لا يُسجل PASS قبل التحقق من النتائج النهائية.

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-FINANCE-PDF-VALIDATION-VERIFY-CI`
- الخطوة العملية التالية: اقرأ نتائج التشغيلين المذكورين؛ إن فشل اختبار أو build، استخرج سبب الفشل الحقيقي وأصلحه، ثم أعد التحقق من SHA النهائي. عند النجاح، حدّث سجل المتطلبات و`EXECUTION_LOG.md`، ثم انتقل إلى فجوة مالية أو تشغيلية مستقلة غير محجوبة.

## حدود الإثبات

- لا يوجد تحقق متصفح تفاعلي مباشر أو تحقق إنتاجي مباشر؛ preview/dev smoke داخل CI ليس دليل إنتاج.
- اختبارات قاعدة البيانات جرت في PostgreSQL 17 معزول ضمن Actions؛ لم تُطبق migration على قاعدة إنتاج.
- لم يثبت فك الأرشيفات الثنائية كاملة أو المراجعة الكاملة لكل مواد `READY_TO_REUSE`.
- لا اعتماديات أو خدمات مدفوعة أضيفت في هذه الدفعات.

حالات الإثبات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.