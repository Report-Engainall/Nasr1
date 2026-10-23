# فهرس رسائل الإقلاع — متجر الأغبري | Nasr1
التحديث: 23 أكتوبر 2026
المستودع الوحيد: https://github.com/Report-Engainall/Nasr1

## القرار الحاكم
- المطلوب إكمال المواصفة الأصلية ومتطلبات المشروع غير المنجزة فقط.
- استعادة أعمال Bolt وتنزيل/فك/فحص أي أرشيف Bolt خارج النطاق، ولا تُكلّف بها P1 أو P2.
- استخدام Bolt New يقتصر على جلسة قبول الواجهات النهائية بعد إكمال البرمجة.

## رسائل الإقلاع الحاكمة للمتبقي فقط
- P1 — رسالة المبرمج 1: PROGRAMMER_1_REMAINING_WORK_BOOT_2026-10-23.txt
- P2 — رسالة المبرمج 2: PROGRAMMER_2_REMAINING_WORK_BOOT_2026-10-23.txt
- خطة تقسيم العمل المتبقي ومنع التعارض: REMAINING_WORK_PLAN_2026-10-23.md
- طلب المراجعة والتثبيت على main: https://github.com/Report-Engainall/Nasr1/pull/65

## المراجع القائمة
- مصفوفة الشاشات والقبول: REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv
- مؤشر الاستئناف الوحيد: CURRENT_EXECUTION_STATE.md
- خطة التنسيق والأقفال: WORK_COORDINATION.md
- أمر التنفيذ الكامل: FULL_APPLICATION_PARALLEL_EXECUTION_MANDATE_2026-10-22.md
- Bolt New / Browser UAT: BOLT_NEW_BROWSER_ACCEPTANCE_BOOT_2026-10-22.txt — لا تُشغّل جلسة UAT قبل إكمال الكود.

## قواعد الاستئناف
- رسالتا 23 أكتوبر تتقدمان على رسائل الإقلاع الأقدم عند التعارض في تقسيم الملكية أو توقيت Bolt، ولا تستبدلان المواصفة الأصلية ولا مؤشر الاستئناف الديناميكي.
- لا تعِد عملًا مثبتًا. اقرأ main وPRs الحية مرة واحدة، ثم تابع من مصفوفة الإغلاق.
- لا تستخدم رسائل قديمة لتحديد HEAD أو next_task_id. حالة GitHub وActions على SHA المحدد هي الفيصل.
