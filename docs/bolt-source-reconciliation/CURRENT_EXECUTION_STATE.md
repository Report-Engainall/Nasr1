# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**آخر دفعة تطبيقية اجتازت جميع بوابات CI:** [`437527ff30bc44ce9a1cdf170c89edd5fc5b3104`](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104)  
**دليل CI المطابق:** [Actions 39144691226 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226). نجح frozen Bun lock/install، اختبارات الوحدة، ترحيلات PostgreSQL 17 وقبول مسارات العمل، ESLint، build، production-preview smoke وdev-server smoke. هذا يثبت دفعة أعمار الذمم الأساسية، وليس اختبار المتصفح أو الإنتاج.

## آخر منجزات مثبتة

- `NASR1-OPS-TASK-CENTER-001`: مركز مهام واحد فوق `ai_tasks` الحالية؛ أحداث الطلبات والمخزون والفواتير وعروض الأسعار والاستيراد؛ منع تكرار الحدث؛ صلاحيات مؤسسة/دور؛ RPCs مدققة؛ المسار `/admin/tasks` والطباعة RTL/A4.
- `NASR1-TASK-ASSIGNMENT-001`: دليل إسناد خادمي محدود بالمؤسسة وبالمسؤول/المدير، مع تحقق من دور الموظف عند إنشاء المهمة. [CI 39143265290 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- `NASR1-OPS-TASK-FILTERS-001`: فلاتر الأولوية، الموظف/غير المسندة، وفترة الإنشاء؛ القائمة ونسخة الطباعة تستخدمان مجموعة النتائج المفلترة نفسها. [CI 39144118407 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- `NASR1-FINANCE-COLLECTION-AGING-001`: إضافة RPC مالي خادمي يحسب المتبقي من الفواتير والدفعات المحفوظة، يستبعد الفواتير الملغاة، يفصل العملات، يصنف فترات التأخر، يعرض تاريخ الاستحقاق المفقود منفصلًا، ويضبط ترقيم الصفحات. أضيفت اختبارات الحساب والتفويض والحدود. [التنفيذ الأساسي](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104) و[CI المطابق الناجح](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- جرى تصحيح فشل حقيقي في اختبار الذمم: افترضت النسخة الأولى عمود `company_name` غير الموجود؛ تمت مراجعة المخطط canonical وإصلاح الاستعلام إلى `business_name` و`contact_name`. لم تُخفّض الاختبارات ولم تُطبّق ترحيلات على قاعدة الإنتاج.
- `AGENTS.md` يحتوي الآن قاعدة دائمة تمنع الانطلاقة الخالية من الإنجاز: يجب تنفيذ تغيير برمجي/اختباري مفيد في كل جلسة، ومحاولة اختبار حقيقي، وتسجيل SHA والنتيجة والخطوة التالية. [Commit القاعدة](https://github.com/Report-Engainall/Nasr1/commit/f575fbac840f490781da3c1f7e32041ab60062c8) و[CI 39144280302 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

## الدفعة النشطة — طباعة تقرير أعمار الذمم

- أضيف زر طباعة إلى التقرير في `src/components/CustomerWorkflows.tsx`؛ ويستخدم طباعة المتصفح المجانية.
- أضيفت قواعد CSS للطباعة RTL والأبيض والأسود ومقاس A4 وإخفاء زر الطباعة.
- النسخة المطبوعة تجمع ملخص المؤسسة الكامل وصفحة التفاصيل المعروضة حاليًا، ولا تدّعي أن تفاصيل الصفحات الأخرى طُبعت. يبقى ملخص الإجماليات منفصلًا حسب العملة.
- commits الكود: [واجهة الطباعة](https://github.com/Report-Engainall/Nasr1/commit/393ca96b73c3b0d642bc5fc9b05681e84c6611d6) و[CSS للطباعة](https://github.com/Report-Engainall/Nasr1/commit/6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b).
- **حالة اختبار دفعة الطباعة:** PENDING عند آخر قراءة؛ لا يجوز نقل PASS من SHA أقدم إلى هذه الدفعة. تحقّق من نتيجة Actions المطابقة بعد اكتمال تشغيلها.

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-FINANCE-AGING-PRINT-001-VERIFY-CI`
- الخطوة العملية التالية: اقرأ CI الخاص بأحدث SHA في `main`. أصلح أي فشل متعلق بالطباعة أو البناء وأعد الاختبار. بعد نجاحه، انتقل إلى `NASR1-FINANCE-AGING-PRINT-002-TESTS`: أضف/أكمل اختبارًا يثبت وجود زر الطباعة ومحتوى التقرير إذا أمكن تغطيته بأدوات الاختبار القائمة، ثم تابع مراجعة المستندات المالية والتصدير.
- آخر سجل تفصيلي: [EXECUTION_LOG.md](./EXECUTION_LOG.md).

## الحدود التي لم تُغلق

- لم يُجر تحقق متصفح تفاعلي مباشر أو تحقق إنتاجي مباشر؛ preview/dev smoke في CI ليسا إثباتًا لذلك.
- لم يثبت فك الأرشيفات الثنائية كاملة أو اكتمال مراجعة كل مواد `READY_TO_REUSE`.
- لا يُدّعى تطبيق أي migration على Supabase الإنتاجية.
- لا توجد اعتماديات أو خدمات مدفوعة أضيفت في هذه الدفعة.

تمييز الحالة إلزامي: `IMPLEMENTED` تغيير محفوظ؛ `TESTED` نتيجة اختبار على SHA محدد؛ `BROWSER-PROVEN` تحقق تفاعلي مباشر؛ `PRODUCTION-PROVEN` دليل من الإنتاج المنشور.
