# بروتوكول تشغيل دورين — متجر الأغبري / Nasr1

الإصدار 2026-10-19. المستودع الهدف الوحيد Report-Engainall/Nasr1؛ التسليم النهائي إلى main عبر PR متسلسل، وليس كتابة مباشرة على main.

## 1. ترتيب الإقلاع
اقرأ رسالة دورك، ثم هذا البروتوكول، ثم WORK_COORDINATION.md وتقرير دورك. اقرأ CURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md بالقدر اللازم لتحديد أحدث next task ودليله. المواصفة الأصلية مرجع المبرمج 2، وسجل المصدر والبصمات مرجع المبرمج 1.

## 2. المسؤوليات غير المتداخلة

### المبرمج 1 — دمج الميزات من المشاريع الثلاثة (المبرمج الموازي)
المصادر فقط:
- Aghbari-Technologies/aghbari-commerce-evolved
- Report-Engainall/aghbari-commerce
- Report-Engainall/aghbari-store

يُكمل الميزات الناقصة المفيدة التي ثبت وجودها في مصادر هذه المستودعات، ويكيّفها داخل Nasr1. لا ينفذ جرد/مراجعة أرشيفي Bolt، ولا يعيد بناء تطبيق، ولا يستبدل Nasr1. يملك حصريًا SOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv وPROGRAMMER_1_CURRENT_REPORT.md. أي تحسين مستقل من المواصفة لا يتعلق بميزة مانحة يبلّغ عنه ولا يتولى تنفيذه ضمن هذا الدور.

### المبرمج 2 — أرشيفا Bolt ثم بقية المواصفة (ChatGPT)
مسؤول حصريًا عن:
1. مراجعة الفروقات غير المحسومة من الأرشيفين Nasr1_Bolt_Before_Failure.zip وNasr1_Bolt_Restored_Current.zip باستخدام أدلة الجرد المحفوظة، وإكمال دمج ميزات Bolt المفقودة فقط داخل Nasr1.
2. بعد إغلاق عناصر الأرشيف بدليل، متابعة next_task_id الحي في المواصفة الأصلية واستكمال جميع الوظائف والواجهات الفعلية غير المنجزة، بالتدرج وبلا توقف بعد وحدة واحدة.
3. يملك ARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md وPROGRAMMER_2_CURRENT_REPORT.md وWORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md ورسائل الإقلاع/المرجع الحاكم.

المبرمج 2 لا يعيد البحث عن ملفات الميزات في المستودعات الثلاثة؛ يستخدم تقرير المبرمج 1 وسجل قراراته. إذا كانت ميزة Bolt تتقاطع مع كود يعمل عليه المبرمج 1، لا يعدل مسار الكود نفسه بالتزامن؛ يسجل patch محددًا وقفل المسار ويواصل ملفًا مستقلًا حتى تحريره.

## 3. منع التعارض
1. لكل دور فرع مستمر واحد، يعاد استخدامه وتحديثه؛ لا إنشاء فرع جديد لكل جلسة. لا reset ولا clean ولا force-push ولا حذف تغييرات.
2. لا يكتب أي منهما مباشرة إلى main. افتح/حدّث PR من فرع الدور. لا تدمج PRs بالتوازي؛ تُدمج دفعة واحدة فقط بعد CI ناجح على head SHA المطابق، ثم يتأكد من main الجديد قبل تأسيس/تحديث PR التالي.
3. قبل تغيير أي ملف كود، تحقق من قائمة الملفات في PRs المفتوحة ومن القفل الحي أدناه؛ لا تعِد جلب محتوى الملف إن كان blob نفسه، يكفي metadata/diff. إذا تداخل مسار، اكتب طلب تعديل في WORK_COORDINATION.md (المبرمج 2 وحده يحرره) ولا تحفظ فوق عمل الآخر.
4. الملفات المحمية بالتنسيق: src/lib/api.ts، src/components/AghbariApp.tsx، src/routeTree.gen.ts، .github/workflows/commerce-checks.yml، scripts/test-database-migrations.mjs، CURRENT_EXECUTION_STATE.md، EXECUTION_LOG.md. المبرمج 2 هو صاحب تنسيق/دمج المسارات المشتركة؛ لا يعدل المبرمج 1 ملفات الحالة المشتركة. لا يحتكر قفل المسار أكثر مما يلزم؛ يحرر القفل بعد الدمج والاختبار.
5. لا تكتب على فرع تغير HEAD حقه: اقرأ head الحالي، واستخدم expected SHA/fast-forward. إذا تغير، أعد الدمج للأمام واحفظ جميع التغييرات، دون force.

## 4. عدم تكرار الاستكشاف أو الاختبارات
- لكل فحص/جلب/استخراج/اختبار سجل دائم يحوي URL، commit SHA وblob SHA/بصمة، المسار، القرار، الأمر، النتيجة ورابط الدليل.
- إذا تطابقت بصمة المصدر والهدف والقرار مثبت، لا تعِد فتح الملف أو جلبه أو تعداد المشروع. استخدم الدليل السابق.
- يسمح بفحص metadata للـHEAD والـPR والـCI الحالية، أو ملف تغير SHA، أو failure جديد محدد، أو دليل واضح أن سجلًا سابقًا ناقص. لا تعِد فحص archive ZIP كاملًا.
- لا تعِد اختبار SHA بلا تغير/فشل جديد. كل commit يغير الملفات المتأثرة يحتاج CI جديدًا مطابقًا. غير المشغل يكتب NOT RUN.
- لا تُلغِ أو تحذف فشلًا سابقًا؛ أضف فشل/إصلاح جديدًا مع الرابط والدليل.

## 5. الأرشيفات — أدلة موجودة
دليل Action 39294387493 سجّل التحقق من ZIPين: Before_Failure 1,003,172 bytes، SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365؛ Restored_Current 997,589 bytes، SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214. مجموع الأعضاء 717: 340 مطابقًا، 18 متغيرًا، واحد Before-only. CRC/path safety/extraction PASS في Action المذكور. لا يعاد التنزيل أو استخراج الزوج على نفس source SHA.

ميزة التحليلات الناقصة من الأرشيف سبق تكييفها في get_store_executive_analytics في commit 55c1d970496c69db36d01197a109a5afd7c6aa04؛ CI 39303848194 SUCCESS على ذلك SHA. لا تعاد. المبرمج 2 يراجع ARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md ويكمل فقط الصفوف CHANGED/BEFORE_ONLY/PENDING التي لا قرارًا ولا دليل هدف/اختبار لها. إذا كانت كل الفروقات حُسمت، يوثق ذلك بالدليل ثم ينتقل مباشرة إلى المواصفة.

## 6. التقارير وملكية الملفات
- المبرمج 1: PROGRAMMER_1_CURRENT_REPORT.md، SOURCE_INTEGRATION_LEDGER.csv، READY_TO_REUSE_FILE_AUDIT.csv فقط (إضافة كود بفرعه مسموح).
- المبرمج 2: PROGRAMMER_2_CURRENT_REPORT.md، ARCHIVE_MANIFEST.csv، ARCHIVE_MEMBERS.csv، ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md، WORK_COORDINATION.md، CURRENT_EXECUTION_STATE.md، EXECUTION_LOG.md.
- لا يعدل أي دور تقرير أو سجل الطرف الآخر. يتلقى P2 ملخصًا من P1 عند دمج ميزة ذات أثر على حالة المواصفة، ويسجل هو الحالة المشتركة.
- لا يدمج مبرمج PR الآخر من غير قراءة owner/path state في WORK_COORDINATION أولًا. إذا كانت الملكية غير محسومة، سجلها OWNER_UNCONFIRMED واعمل في ملفات مستقلة.

## 7. تعريف الإنجاز والانتقال
الإنجاز: كود حقيقي موصول بالواجهة والخدمة والبيانات والتفويض/RLS والاختبارات، ثم CI PASS على SHA نفسه. صفوف الأرشيف: INTEGRATED/EXCLUDED/ALREADY_PRESENT تحتاج مسار هدف وسبب واختبار أو دليل مصدر بديل. لا تدّع Onyx/WhatsApp/production/browser proof بلا تشغيل فعلي. بعد إنهاء أرشيف Bolt، يبدأ المبرمج 2 فورًا من next_task_id الأصلي الحي؛ المهمة الأم NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 وتظل مفتوحة حتى حسم متطلبات المواصفة، لا لمجرد تجهيز شاشة.
