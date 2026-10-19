# تقرير الاستئناف — المبرمج 2 / Bolt archive ثم المواصفة

المستودع الهدف الوحيد: Report-Engainall/Nasr1.  
task الحالي الوحيد: NASR1-BOLT-ARCHIVE-DELTA-001.  
task التالي بعده مباشرة: NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 (الحالة الحية هي المرجع إذا تغير HEAD/المواصفة).

## دليل أرشيف Bolt المثبت — لا يعاد
- المصدر: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17
- Action التحقق: [39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493). هدف تاريخي SHA d20c1aced5f6595b1b2a81bb017c153a260c5a0d، مصدر مثبت b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure ZIP: 1,003,172 bytes؛ SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365؛ 359 عضوًا.
- Restored_Current ZIP: 997,589 bytes؛ SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214؛ 358 عضوًا.
- المقارنة: 717 عضوًا مجموعًا، 340 مطابقًا، 18 متغيرًا، عضو واحد Before-only؛ تنزيل/سلامة CRC/فحص المسارات الآمنة/الاستخراج المؤقت اجتازت الاختبار السابق.
- commit ميزة التحليل الناقصة: [55c1d970496c69db36d01197a109a5afd7c6aa04](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04); CI [39303848194 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194) على SHA المطابق. `get_store_executive_analytics` تم تكييفه إلى نموذج Nasr1؛ ثلاث RPCs أخرى كانت موجودة بالفعل بتنفيذ target-native أفضل.

## العمل الحالي
- افتح ARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md واستعمل البصمات/القرارات المسجلة. لا تعِد تنزيل ZIPs أو استخراجها أو إعادة حساب SHA/CRC أو إعادة تعداد جميع الأعضاء.
- راجع فقط rows الموسومة CHANGED / BEFORE_ONLY / PENDING أو التي لا تملك قرارًا مبرهنًا. إذا لم تحمل المصفوفة الدليل الدلالي اللازم، عالج عنصرًا واحدًا محددًا فقط من المادة التي سبق استخراجها؛ لا تعِد عملية الزوج كاملة. قارن كل اختلاف بالكود الحالي، ثم سجّل ALREADY_PRESENT_BETTER أو ADAPT_AND_INTEGRATE أو EXCLUDED_SECURITY أو INCOMPATIBLE_WITH_EVIDENCE مع path/source blob/tests/decision.
- تحقق من current HEAD/PR/CI metadata؛ لا تعتبر نجاحًا على SHA تاريخي نجاحًا للرأس الحالي. لا تحرر كود/مسار في PR يعمل عليه المبرمج 1. اقفل المسار عبر WORK_COORDINATION أو اعمل في ملفات مستقلة.

## الانتقال الإلزامي إلى المواصفة
عند إثبات حسم اختلافات الأرشيف، حدّث سجل الأرشيف، ثم تابع فورًا NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 من CURRENT_EXECUTION_STATE.md، دون توقف أو طلب موافقة. أكمل الواجهات والوظائف غير المنجزة تدريجيًا: كود/خدمة/DB/RLS/route/اختبار؛ لا mock/demo أو زر شكلي، ولا أرصدة وهمية ولا خدمات مدفوعة. لا تدّع Onyx/WhatsApp/production/browser proof دون اختبار مباشر.

## ملكية السجلات
هذا التقرير لك وحدك. أنت وحدك تعدل WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md. لا تعدل SOURCE_INTEGRATION_LEDGER.csv أو READY_TO_REUSE_FILE_AUDIT.csv أو تقرير المبرمج 1.

## الاختبار والتسليم
كل تعديل يحتاج unit/integration/DB/security المناسب وCI على SHA نفسه. غير المشغل NOT RUN. لا تحذف الفشل السابق؛ أضف إصلاحًا بدليل. احفظ commit/PR ورابط CI والمسارات والبصمات والنتائج، وحدّث next_task_id واحدًا فقط.
