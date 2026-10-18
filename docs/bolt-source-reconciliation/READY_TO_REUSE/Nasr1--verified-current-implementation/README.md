# Nasr1 — مرآة الكود الحالي المُدمج والمختبر

**المستودع والفرع:** `Report-Engainall/Nasr1` / `main`  
**Commit الكود المختبر:** [`98a80df80b366e811923b80d53fe06a519e754d0`](https://github.com/Report-Engainall/Nasr1/commit/98a80df80b366e811923b80d53fe06a519e754d0)  
**CI المطابق:** [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503)  
**Manifest:** `CURRENT_NASR1_IMPLEMENTED_FILES.csv`

## ما تحويه المجموعة
هذه مرآة من 10 ملفات من التطبيق نفسه، وليست شيفرة مولّدة: مركز المهام وفلاتره، شاشة أعمار الذمم، اختبار الواجهة، مولّد PDF المالي واختباراته، CSS الطباعة، مهاجرتا أعمار الذمم/كشف الحساب، اختبارات قبول PostgreSQL، وقاعدة العمل الدائمة.

- `src/components/TaskCenter.tsx` — مركز المهام وفلاتر الأولوية والمسؤول والتاريخ والطباعة.
- `src/components/CustomerWorkflows.tsx` — تقرير أعمار الذمم وملخص العملات وتفاصيل الرصيد والطباعة.
- `src/components/CustomerWorkflows.finance-aging.test.tsx` — اختبار واجهة أعمار الذمم والطباعة وحدود صلاحية المالية.
- `src/lib/finance-document-pdf.ts` — PDF مالي: ملخص دفتر العميل الكامل ودقة الرصيد لكل فاتورة.
- `src/lib/finance-document-pdf.test.ts` — اختبارات ملخص RPC الخادمي والدقة العددية والعملات والترقيم.
- `src/styles.css` — طباعة RTL/A4 لتقرير أعمار الذمم.
- `supabase/migrations/20261018030000_staff_receivables_aging.sql` — RPC أعمار الذمم للمؤسسة مع عزل الصلاحيات والعملات.
- `supabase/migrations/20261018040000_customer_statement_full_aging_summary.sql` — ملخص كامل لدفتر العميل داخل RPC الحالي مع قوائم تفاصيل محدودة.
- `scripts/test-database-migrations.mjs` — اختبارات PostgreSQL 17 لمجاميع RPC والدفعات والتفويض وعزل العملاء.
- `AGENTS.md` — إنجاز برمجي واختباري حقيقي في كل انطلاقة وحفظ نقطة الاستئناف.

## ملخص كشف الحساب: مصدر الحقيقة
- RPC العميل الحالي `get_customer_account_statement()` يعيد `summary_as_of_utc` وملخصًا كاملًا حسب العملة محسوبًا من سجل الفواتير والدفعات كله، وليس من قوائم التفاصيل المقيدة.
- كل فاتورة ضمن تفاصيل أول 200 فاتورة تحمل `paid_amount` و`outstanding_amount` من دفتر المدفوعات الكامل، لذلك لا تفقد حساب الرصيد بسبب حد عرض آخر 500 دفعة.
- تفاصيل الفواتير ما زالت محدودة بـ200 والتفاصيل الدفعات بـ500؛ PDF يوضح أن المجاميع شاملة للدفتر، وأن صفوف التفاصيل مقتصرة على الحدود المذكورة.
- الأموال تُحوّل إلى وحدات صغرى باستخدام `bigint`، ولا تجمع العملات المختلفة. الفواتير الملغاة لا تدخل في ملخص الأرصدة، وتواريخ الاستحقاق المفقودة في بند مستقل.
- CI المطابق 39148856503 نجح في unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke.

## إثبات التطابق
- تمت مطابقة Git blob SHA لكل مسار فعلي في `main` مع SHA النسخة تحت هذا المجلد؛ كل الصفوف موسومة `git_blob_identical=YES`.
- بصمات Git blob ليست SHA-256 لأرشيف ZIP/RAR.
- هذه ملفات مرآة داخل `docs/` للتسليم والمصالحة، وليست نسخ runtime إضافية.
- `PROVENANCE_MANIFEST.csv` الخاص بالمصادر المانحة بقي كما هو، منفصلًا عن provenance كود Nasr1.

## قاعدة الاستئناف
ابدأ من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. لا تُعد فحص ميزة مغلقة إلا إذا تغير كودها أو ظهر فشل جديد.
