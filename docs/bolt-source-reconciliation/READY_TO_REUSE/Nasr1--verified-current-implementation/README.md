# Nasr1 — مرآة النسخة الحالية المُدمجة والمختبرة

**المستودع:** `Report-Engainall/Nasr1` / `main`  
**Commit الكود المختبر:** [`f830678ea99f4bb2318305a5f2e70ee761dbea1e`](https://github.com/Report-Engainall/Nasr1/commit/f830678ea99f4bb2318305a5f2e70ee761dbea1e)  
**CI المطابق:** [Actions 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166)  
**Manifest:** `CURRENT_NASR1_IMPLEMENTED_FILES.csv`

## الغرض والمحتويات
مرآة من 9 ملفات فعلية من التطبيق الحالي، لا أمثلة مولدة: مركز المهام وفلاتره؛ شاشة تقرير أعمار الذمم؛ اختبار واجهته؛ مولد PDF المالي واختباراته؛ CSS الطباعة؛ migration أعمار الذمم؛ اختبارات قبول PostgreSQL؛ وقاعدة الإنجاز في كل انطلاقة.

## إثبات التطابق والاختبار
- كل Git blob في العمودين target/snapshot متطابق (`git_blob_identical=YES`) مع الكود في commit `f830678ea99f4bb2318305a5f2e70ee761dbea1e`.
- أُضيف إلى PDF ملخص المتأخر حسب العملة، محسوبًا من الفواتير والدفعات وتاريخ توليد المستند، مع استبعاد الملغاة والمدفوعة بالكامل، وفصل المستحق ذي التاريخ المفقود.
- الاختبارات تغطي YER/USD/EUR، دفعات جزئية وكاملة، فاتورة ملغاة ومدفوعاتها، تاريخ مستقبلي ومفقود.
- [CI 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166) اجتاز unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke.
- Git blob SHA ليست SHA-256 لأرشيف ثنائي. الملفات تحت `docs/` نسخ مرجعية لا تُستورد مجددًا إلى runtime.
- `PROVENANCE_MANIFEST.csv` الأصلي يظل منفصلًا عن مرآة Nasr1 ولم يتم تعديله.

## الاستئناف
ابدأ من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. لا تُعد فحص وظيفة مكتملة إلا إذا تغيّر مصدرها أو كشف CI عن regression.
