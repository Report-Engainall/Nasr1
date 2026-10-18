# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الهدف الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**آخر SHA للكود اجتاز جميع بوابات CI:** [`ba9523fdbe643d7a6503dce54f6d1b740f3f06ca`](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca)  
**الاختبار المطابق:** [GitHub Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217). نجح Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، production-preview smoke وdev-server smoke.

## الإنجاز الفعلي الأخير

- أصلحنا عرض حالة التحصيل في PDF. الحالة أصبحت مشتقة من حالة الفاتورة المسجلة، وتاريخ الاستحقاق، ومجموع الدفعات. تظهر «متأخرة» و«متأخرة جزئيًا» إذا مضى الاستحقاق وبقي رصيد؛ يحافظ الكود على «مدفوعة» و«ملغاة»، ولا يختلق تاريخ استحقاق عند فقدانه.
- أضيفت اختبارات حتمية للتأخر الكامل والجزئي، والاستحقاق المستقبلي، والتاريخ المفقود، والمدفوع والملغى.
- فشل اختبار سابق لأن الفاتورة الفردية كانت تستخدم `statusLabel()` الذي استُبدل من غير إبقاء الدالة القديمة؛ أصلحناه بفصل رندر حالة الفاتورة الفردية عن حالة كشف الحساب. لا يوجد فشل متبقٍ على SHA `ba9523f`؛ CI المطابق نجح.
- التفاصيل وسبب الفشل ومحاولات CI موجودة في [EXECUTION_LOG.md](./EXECUTION_LOG.md)؛ المتطلبات فيها سجل `TESTED / CI SUCCESS`.

## سجل المكتمل — ممنوع الرجوع إليه دون سبب جديد

هذه الأعمال أُنجزت واختُبرت في هذه الجلسة. لا تكرر التحليل أو الجرد أو الاختبارات من البداية في الانطلاقة التالية؛ تابع من المهمة الجديدة. أعد اختبار شيء بعينه فقط إذا تغيّر كوده أو فشل CI مرتبط به:

- مركز المهام: أحداث المصدر ومنع التكرار، صلاحيات المؤسسة/الدور، دليل إسناد الموظفين. [Actions 39143265290 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ التي تطبق على القائمة والطباعة معًا. [Actions 39144118407 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- تقرير أعمار الذمم: الفواتير والدفعات الفعلية، العملات المنفصلة، فئات الأعمار، غياب due date، pagination، وحماية RPC. [Actions 39144691226 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة تقرير أعمار الذمم RTL/A4 واختبار واجهته ومنع وصول غير المحاسب إلى RPC المالي. [39144916657 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- منع إنشاء PDF بفاتورة سالبة أو دفعة صفرية/سالبة. [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- تصحيح وسم الفاتورة في كشف الحساب PDF، وفصل مسار الفاتورة الفردية ثم اجتياز البوابة الكاملة. [Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217).
- القاعدة الدائمة «إنجاز برمجي/اختباري حقيقي في كل انطلاقة» محفوظة في `AGENTS.md`. [Actions 39144280302 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001`
- الفجوة الجديدة: تاريخ `due_at` موجود في بيانات كشف الحساب، لكنه غير ظاهر حاليًا ضمن جدول فواتير PDF؛ أضفه بجوار تاريخ الإصدار بصياغة عربية RTL واضحة دون ضغط الأعمدة أو إفساد ترقيم الصفحات. أضف اختبارًا حتميًا، شغّل CI، أصلح أي فشل فعلي، ثم سجّل SHA ونتيجته.
- ابدأ في الانطلاقة التالية بقراءة هذا المؤشر فقط، وتحقق من `main` ونتيجة الاختبار المطابق مرة واحدة؛ لا تعاود فحص المهام أو أعمار الذمم أو قواعد المبالغ السالبة لأنها مكتملة أعلاه.

## حدود الإثبات

- لا يوجد تحقق متصفح تفاعلي مباشر أو إثبات من نسخة الإنتاج؛ preview/dev smoke داخل CI ليس إثبات نشر إنتاج.
- اختبارات البيانات تمت داخل PostgreSQL 17 معزول في Actions؛ لم تُطبق migrations على قاعدة إنتاج.
- لم يثبت فك الأرشيفات الثنائية بالكامل ولا تدقيق جميع مواد `READY_TO_REUSE`.
- لا اعتماديات أو خدمات مدفوعة أضيفت.

التصنيفات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.