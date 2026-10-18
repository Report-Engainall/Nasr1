# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع والفرع الهدف الوحيدان:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1) / `main`  
**كود التطبيق المختبر:** [`84e0f424351bd22a9f5fc468852a8fe07b5596a2`](https://github.com/Report-Engainall/Nasr1/commit/84e0f424351bd22a9f5fc468852a8fe07b5596a2)  
**CI المطابق:** [Actions 39146074209 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209)؛ نجح Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke والتنظيف النهائي.

## الإنجاز التنفيذي الأخير

- أضيف تاريخ الاستحقاق بجانب تاريخ الإصدار في كشف الحساب PDF، بصفّ ذي سطرين، وأضيفت اختبارات تنسيق التاريخ والـPDF متعدد الصفحات.
- اجتازت دفعة الكود CI المطابق أعلاه. إثبات المتصفح المباشر أو الإنتاج لم يُنفّذ ولا يُدّعى.
- سجل الأدلة والتغييرات: [EXECUTION_LOG.md](./EXECUTION_LOG.md).

## مرآة آخر كود داخل READY_TO_REUSE

- المسار: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`
- المحتويات: 9 ملفات كاملة (TaskCenter، CustomerWorkflows، اختبار واجهة أعمار الذمم، PDF المالي، اختبارات PDF، CSS الطباعة، migration أعمار الذمم، اختبارات قبول PostgreSQL، وAGENTS.md) مع `CURRENT_NASR1_IMPLEMENTED_FILES.csv`.
- جرت مقارنة blob SHAs لكل مسار حي على `main` مع نفس المسار عند commit `84e0f424351bd22a9f5fc468852a8fe07b5596a2`; تطابقت الملفات التسعة حرفيًا. النسخة المرآتية منفصلة عن `PROVENANCE_MANIFEST.csv` الخاص بملفات المانحين حتى لا يختلط مصدر النسخ.
- **CI لعملية إضافة مجلد النسخ نفسها: PENDING** حتى قراءة التشغيل المطابق للـcommit التوثيقي الجديد. لا يُنسب PASS قبلها.

## الأعمال المكتملة — لا تكرر تحليلها أو فحصها بلا سبب جديد

- مركز المهام، الأحداث ومنع تكرارها، عزل المؤسسة/الدور والإسناد: [Actions 39143265290 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر المهام للأولوية والمسؤول والتاريخ، مشتركة بين القائمة والطباعة: [Actions 39144118407 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- تقرير أعمار الذمم من الفواتير والدفعات المسجلة، فصل العملات والتصنيف والترقيم والتفويض: [Actions 39144691226 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة أعمار الذمم RTL/A4 واختبار الواجهة وحجب RPC عن غير المحاسب: [39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) — SUCCESS.
- رفض إجمالي فاتورة PDF السالب والدفعات الصفرية/السالبة: [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- حساب حالة التأخر وفق due_at والدفعات، مع فصل رندر PDF للفاتورة الفردية: [Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217).
- تاريخ الاستحقاق وترقيم صفحات كشف الحساب: [Actions 39146074209 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209).
- قاعدة الإنجاز الحقيقي في كل انطلاقة موجودة في [AGENTS.md](../../AGENTS.md).

## نقطة الاستئناف الوحيدة

- `next_task_id = NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`
- الخطوة التالية: تحقق مرة واحدة من CI الخاص بالـcommit الذي سيضيف مرآة الكود إلى READY_TO_REUSE. إن نجح، حدّث حالة النسخة المرآتية إلى VERIFIED ثم انتقل مباشرة إلى `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001`: إضافة ملخص المبالغ المتأخرة في PDF حسب العملة، محسوبًا من due_at والدفعات، مع اختبار العملات المختلطة والفواتير الملغاة وتاريخ الاستحقاق المفقود.
- لا تعِد فحص المهام أو الفلاتر أو تقرير أعمار الذمم أو الطباعة أو المبالغ السالبة أو تاريخ الفاتورة؛ كلها مغلقة بأدلة CI أعلاه. أعد اختبارًا فقط إذا تغيّر ملف المصدر أو ظهر فشل جديد.

## حدود الإثبات

- لم يُجر تحقق متصفح مباشر أو إثبات إنتاجي مباشر؛ preview/dev smoke داخل CI ليس دليل نشر إنتاجي.
- قاعدة الاختبار PostgreSQL 17 معزولة ضمن Actions؛ لم تُطبق migrations على Supabase الإنتاجية.
- لا يدّعي هذا السجل فك كل الأرشيفات الثنائية أو إكمال تدقيق جميع مواد READY_TO_REUSE.
- لم تضف هذه الدفعة اعتماديات أو خدمات مدفوعة.

تصنيفات الإثبات منفصلة: `IMPLEMENTED`، `TESTED` على SHA محدد، `BROWSER-PROVEN`، `PRODUCTION-PROVEN`.
