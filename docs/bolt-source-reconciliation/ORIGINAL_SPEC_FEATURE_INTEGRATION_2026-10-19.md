# تكامل ميزة من المواصفة الأصلية — أوامر الشراء والاستلام

**الحالة الحالية:** IMPLEMENTED + INTEGRATED + TESTED (exact-SHA CI PASS). هذه ميزة مقتبسة من وثيقة مواصفات المتجر، لا من ملفات ZIP، ولا يعني إنجازها إكمال المواصفة كلها.

## واجهات / API

- `/admin/purchase-orders` تعرض أوامر الشراء المحفوظة من المؤسسة الحالية، مع فلتر حالة وطباعة، وتتيح إنشاء مسودة من مورد ومخزن وأصناف فعلية.
- أوامر الإدارة: `create_purchase_order`, `submit_purchase_order`, `cancel_purchase_order`, `receive_purchase_order`, `fetch_purchase_orders`.
- واجهة React/API تتصل مباشرة بـRPC المخولة وتتحقق من الرد والأرقام وحالة الكمية؛ لا تُعرض مسودة أو إيصال كأنه نجاح قبل رد الخادم.

## حدود السلامة والمال

- هوية المنفذ والمؤسسة مشتقة في PostgreSQL من الجلسة والملف النشط، لا من org id مرسل من المتصفح؛ الإدارة للـadmin/manager وفق RBAC المتاح حاليًا.
- جداول أوامر الشراء والإيصالات RPC-only بالنسبة إلى `authenticated`; العميل العادي لا يستطيع تنفيذ RPC أو قراءة جداول الشراء مباشرة.
- إنشاء أمر شراء أو اعتماده لا يغيّر المخزون ولا يرسل رسالة للمورد تلقائيًا.
- إيصال مادي بكمية معتمدة هو وحده الذي يحدّث الرصيد؛ ترحيل الحركة وسجل الإيصال يتّحدان في معاملة. يوجد تحقق من الكمية المطلوبة، الكمية المستلمة والمتبقي.
- مفاتيح idempotency مربوطة ببصمة الحمولة: replay مطابق آمن، وإعادة استخدام المفتاح ببيانات مختلفة مرفوضة. تكلفة الوحدة/الإجمالي غير المعروف يبقى `NULL`؛ لا يُحوّل إلى صفر.
- الأحداث تغيّر مركز المهام: مهمة استلام واحدة لكل أمر شراء عبر `source_event_key`, تتحدث idempotently وتُغلق بعد الاستلام الكامل أو الإلغاء. الأوامر والإيصالات تسجل أحداث التدقيق وحركات المخزون.

## ملفات التنفيذ

- `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`
- `src/lib/purchase-orders.ts`
- `src/lib/api.ts`
- `src/components/PurchaseOrdersPage.tsx`
- `src/routes/admin_.purchase-orders.tsx`
- `src/components/AghbariApp.tsx`
- `src/components/TaskCenter.tsx`
- `src/test/purchase-orders.test.ts`
- `src/test/purchase-orders-page.test.tsx`
- `scripts/test-database-migrations.mjs`
- `.github/workflows/commerce-checks.yml`

## دليل الاختبار

[GitHub Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500) على SHA exact `2986f59c3350f313eaa53b529a7507da47192773`.

- Vitest: 41/41 ملفات و317/317 اختبار.
- PostgreSQL 17: جميع migrations وقبول RLS/الدورات التشغيلية، وتشمل أمر شراء متكرر بنفس المفتاح، تعارض الحمولة، تكلفة غير معروفة، رفض زيادة الاستلام، استلام جزئي، replay بلا مضاعفة المخزون، استلام كامل، حركات مخزون وسجل تدقيق، إنشاء/إغلاق مهمة مخزن واحدة، ورفض العميل من RPC والجداول.
- Lint: PASS.
- Build: PASS.
- Production preview smoke على 4173: PASS.
- Dev server smoke على 5173: PASS.

## ما لم يثبت بعد

- `BROWSER-PROVEN=NOT RUN`: لم يُنفذ اختبار تفاعلي بجلسة متصفح حقيقية.
- `PRODUCTION-PROVEN=NOT RUN`: لم يُنشر الترحيل على قاعدة إنتاج أو يثبت التشغيل الحي.
- الاعتماد داخلي، لا يوجد اتصال رسمي لإرسال بريد/رسالة إلى المورد؛ الواجهة تعرض ذلك صراحة.
- دورة أمر الشراء لا تضيف موردين أو أصنافًا وهمية ولا تولد فواتير تاريخية.
- `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` ما زالت مفتوحة لاستكمال الواجهات الأخرى في المواصفة.
