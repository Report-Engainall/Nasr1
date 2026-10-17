# استعادة آمنة لنسختي Bolt — 17 أكتوبر 2026

تم بناء هذا الفرع من main دون تعديل main. استُخدم كود النسخة المستعادة كقاعدة، ثم أعيدت مكونات واجهة مختارة من نسخة ما قبل الخلل لأنها أغنى بصريًا ومتوافقة على مستوى العرض؛ لم تُستعد ملفات نموذج البيانات أو المصادقة أو الأسعار أو الطلبات القديمة بشكل أعمى.

## الحماية
- استُبعدت ملفات البيئة .env.
- لم يجر تشغيل أو تطبيق أي migration.
- بقيت ملفات SQL الإضافية في منطقة حجر خارج المسار النشط، وملفا role/password محفوظان كبصمات وبيانات وصفية فقط.
- لم تُنسخ ملفات TypeScript المولدة.

## نسخ واجهة ما قبل الخلل
- src/components/store/BannerSlider.tsx — 1621 bytes; SHA-256 f6daa6979bcfad5904cee04939cde0f79472eba15bddd85fe926541612c331b5
- src/components/store/ProductCard.tsx — 2522 bytes; SHA-256 71685c4ca5b93555e764e0d15b050c4f8934ccab59293700d3f27393028a3858
- src/components/store/StoreFooter.tsx — 3998 bytes; SHA-256 d705d3f8aeefd90583a4d81761b7f3f85823707fc3177d98adf0e327d812901d
- src/components/store/StoreHeader.tsx — 4153 bytes; SHA-256 ed0ce07697dd6394255db2b3175b29dcf78528ed29666a423c792d34542c8b9b
- src/pages/store/HomePage.tsx — 7302 bytes; SHA-256 1f357a5daa06e153f3298acdb80fbde7f342aaca9906498b245dfe00e13a6207
- src/pages/admin/AdminLayout.tsx — 3748 bytes; SHA-256 6bf2bd4a6469bbdc43d7c5408927eb47dcf4097be5f5171a665c9c39c087dd3d
- src/styles.css — 2191 bytes; SHA-256 2ed9d8a05c1e842a53928f98145f9835843ff89449fd9f004a5cf533c693717b
- src/styles/premium-ui.css — 40052 bytes; SHA-256 c51a60bc517760c4706c2050b7b8df70e64efeaa5e13c3b9ffa441d39dd6dd9b
- package.json — 643 bytes; SHA-256 06e643337977273a564d22f207443e3c25d7dbefd47373df48a1b48737bb49ba
- package-lock.json — 66536 bytes; SHA-256 993e51711497ca0ede338398393ff3f90d1b069b31fdf495b2e4f6afc7e40f50

## جرد موجز
- ملفات المصدر في نسخة Bolt المستعادة: 358
- ملفات المصدر في نسخة ما قبل الخلل: 359
- ملفات النسخة الحالية التي نُقلت بعد الاستبعادات: 315
- الشاشات الإضافية تشمل إدارة المخزون والموردين والتسعير والتقارير والإشعارات وسجل التدقيق وعميل 360 ومساعد المتجر والمفضلة والمقارنة؛ ما زال يلزم اختبار الربط الفعلي والـ build.

## ملفات SQL المعزولة
- supabase/migrations/20261017003140_grant_admin_role_777530851.sql.sql — 983 bytes; SHA-256 020e33ec53010a83bf5b7055337071b46eabd3a68c0da3e2be11c9fcdc9ddd9a; quarantined_not_applied
- supabase/migrations/20261017003200_set_admin_password_777530851.sql.sql — 244 bytes; SHA-256 9c1aa10e7178db0909b428e60580dd9b984b3e87860198fcb19cebffd13e9c3b; quarantined_not_applied
- supabase/migrations/20261017003522_executive_analytics_and_customer_360.sql.sql — 18105 bytes; SHA-256 e4ae70f59b56802e4faf23dea3fa861dde2e4ac9d724c6a1ee3727d73c93df1c; quarantined_not_applied
- supabase/migrations/20261017012307_20261017040000_fix_missing_rpcs_and_analytics.sql — 10730 bytes; SHA-256 7eb7fd644371ad206aded1b8ef4f13c4181979cb774520ebe0ec5b7c095dc693; quarantined_not_applied

هذا الفرع للإصلاح والمراجعة فقط؛ لا يمثل شهادة أن التطبيق قابل للنشر.
