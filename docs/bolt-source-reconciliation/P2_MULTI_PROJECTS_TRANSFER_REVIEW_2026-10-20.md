# P2 — مراجعة مصادر NASR المستخرجة مقابل Nasr1
تاريخ المراجعة: 20 أكتوبر 2026  
المستهدف المقارن: Report-Engainall/Nasr1 على main عند SHA b54c87525d3b8c25c1d6ebf0c525636f82444ac1.  
المصدر: Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER على main عند SHA f7c0b8132f3e4bbe298c73d966ed6996b5cf989b.  
تقرير الاستخراج: blob 1f5e589344251129e5d96ed2e0b4bf886c8222f1.

## حدود الدليل
هذا الجرد تمت مراجعته عبر GitHub recursive tree ومقارنة Git blob SHA-1 للملفات، مع فتح الملفات الوظيفية الأساسية المذكورة أدناه. لا يعني جرد الشجرة تشغيل التطبيق أو اختبار كل ملف؛ أي سلوك runtime غير مذكور على أنه مثبت. هذه وثيقة P2 ولا تضاف نتائجها إلى سجلات P1 الثلاثة.

## 1. تعداد المصدر والتكرارات
- شجرة GitHub recursive: 2,329 entries، منها 2,024 blobs على مستوى المستودع كله، و2,011 blobs داخل مجلدات الأرشيف التسعة في EXTRACTED_PROJECTS.
- تقرير الاستخراج يعد 2,044 ملفًا. الفرق بين أعداد التقرير ومحتوى الشجرة المتاح حاليًا = 33 مسارًا. هذا **تباين يحتاج تسوية** وليس دليلًا كافيًا على فقد البيانات أو فساد الاستخراج؛ لم نعد تنزيل ZIPs أو إعادة استخراجها.
- عدد الملفات المسجل بالتقرير مقابل blobs الموجودة داخل المجلد:
| المشروع المستخرج | تقرير الاستخراج | مسارات blobs الحالية | الفرق |
|---|---:|---:|---:|
| project-bolt-github-7ctmfr27 | 494 | 494 | 0 |
| project-bolt-github-7sl6ykzz (3) | 359 | 358 | 1 |
| project-bolt-github-7wyze9ut (2) | 45 | 35 | 10 |
| project-bolt-github-7wyze9ut (3) | 45 | 35 | 10 |
| project-bolt-github-8ccbjvhg | 338 | 338 | 0 |
| project-bolt-github-gcrrtnzl | 274 | 273 | 1 |
| project-bolt-github-last | 376 | 375 | 1 |
| project-bolt-github-myh797q4 (4) | 72 | 71 | 1 |
| project-bolt-sb1-b5g7dtki (1) | 41 | 32 | 9 |
| **الإجمالي** | **2,044** | **2,011** | **33** |

تقرير المصدر يقول إن archive pair project-bolt-github-7wyze9ut (2)/(3) لهما SHA-256 واحد: 491a82420425128cec8de57544747a40f243bfbf9daae27a329b9099a8b6ae2a. وتؤكد شجرة الملفات الحالية أن الملفات الـ35 المسجلة تحت project/ في كل نسخة متطابقة جميعها في المسار وGit blob SHA (35/35). لذلك تُحتسب محتويات الزوج مرة واحدة. العدد 45 في تقرير ZIP لا يقابل إلا 35 ملفًا متتبعًا تحت project/ لكل مجلد حاليًا؛ تبقى العشرة المسارات غير الظاهرة في الشجرة جزءًا من تباين العدّ وليست سببًا لتكرار الدمج.

## 2. قياس تشابه المشاريع مع Nasr1/main
- project-bolt-github-7ctmfr27: 494 ملفًا؛ 493 مسارًا مشتركًا مع الهدف، 492 ملفًا متطابق المحتوى، ملف واحد مختلف (src/routeTree.gen.ts)، ملف source-only واحد، و20 ملفًا target-only.
- project-bolt-github-last: 375 ملفًا؛ 349 مسارًا مشتركًا، 306 محتوى متطابقًا، 43 ملفًا مختلفًا، 26 ملفًا source-only، و164 target-only.
- project-bolt-github-gcrrtnzl: 273 ملفًا؛ 17 مسارًا مشتركًا فقط، اثنان متطابقان، 15 مختلفة، و256 source-only. هذه الشجرة ذات طبقة تطبيق/مخطط أقدم؛ لا يُنقل مشروعها كاملًا أو SQLها آليًا.
- المشروع الحالي في Nasr1 يحوي بالفعل 513 ملفًا متتبعًا في الشجرة التي تمت مقارنتها. تداخل الأسماء لا يثبت تكافؤ السلوك؛ استُخدمت بصمات المحتوى ومراجعة موضعية حيث يلزم.

## 3. قرارات المكونات والميزات

### ALREADY_PRESENT_BETTER — لا تنسخ الملفات المتطابقة
| القدرة | دليل الهدف والمصدر | القرار |
|---|---|---|
| مركز لقطات Onyx | src/components/OnyxSnapshotCenter.tsx blob 538bc4234530419cd2c75761822811705ae5f035 مطابق في project-bolt-github-7ctmfr27 وproject-bolt-github-last | التطبيق الحالي يقرأ snapshots ويعرض التحليلات ويمتنع عن تعديل الرصيد في وضع المقارنة الحالي. لا تكرر المركز. |
| التحليل الموحد لـOnyx | src/components/UnifiedOnyxAnalysisPanel.tsx blob b8c87fbdfb19c2ea0d6768f46d697f524c13f710 مطابق في المشروعين المذكورين | لا تنشئ واجهة ثانية. تحقق لاحقًا من مصدر البيانات/حالة آخر مزامنة الحية كفجوة سلوكية مستقلة. |
| مركز المهام | src/components/TaskCenter.tsx blob 295f4dcb3f98f1f2673644bb90390c7103dff3a8 مطابق في 7ctmfr27 وlast | لا تنقل المكون؛ متطلبات الطباعة حسب الدور/الموظف والفلاتر تبقى بوابة قبول وظيفية. |
| تصدير Onyx واختباره | src/lib/onyx-export.ts blob b8e284194984516c4a33602fb848425449633e62، واختباره cb4f482d9a93c1a306d657cb6b5215750db6a0b2، مطابقان في عدة snapshots | التصدير الحالي يكتب المعرّفات كسلاسل بدل صيغ؛ لا تعِد المحرك. |
| CSV/XLSX لشبكة الأسعار | src/lib/price-grid-csv.ts blob 68d3e869818e64a1aa6447769dc6c670a72223af، وsrc/lib/price-grid-xlsx.ts blob 5dbf56b3f754a633f0d4a8949faf58e22a9eb11f؛ ملفات اختبارات CSV/XLSX المقابلة موجودة ومطابقة في snapshots | تنفيذ CSV يضيف حماية للخلايا ذات شكل الصيغ، ويصدر الأكواد النصية؛ XLSX يصدر identifiers كـ inline strings لا كمعادلات. لا تنقل الملفات أو الاختبارات المتطابقة ثانية. يلزم التحقق من مسارات التصدير الأخرى بالاختبار. |
| AI Gateway code | supabase/functions/ai-gateway/logic.ts blob 7858b8a487857a6b97a1e9c1ba1b2e9b0f387e25 وindex.ts blob 3152d79fa62bc793bedec34d2a80db18541c3f3a، متطابقان في 7ctmfr27 و7sl6ykzz(3) و8ccbjvhg وlast | البنية ليست جديدة. وجود adapter أو دوال usage لا يثبت fallback الفعلي أو أن كل استدعاء يسجل في ledger؛ اختبار تلك العقود حيًّا جزء من القبول. |
| أسس قاعدة البيانات والتحليل الحتمي | supabase/migrations/20261009070000_platform_spec_foundations.sql blob 4e61abdb9c45c92bb031514d2fa7075daf0b9a61، و20261009090000_onyx_deterministic_analytics.sql blob 6f6cf3811d287369832d418ad9c66701ab3805b5 متطابقتان في عدة snapshots | لا تعِد تطبيق migration ولا تعتبر وجودها إثبات مزامنة Onyx الخارجية. |

### ADAPT_AND_INTEGRATE — تكييف صغير تم حفظه على فرع PR #18، والاختبار ينتظر CI
- المصدر المقارن: EXTRACTED_PROJECTS/project-bolt-github-last/project/src/lib/unified-import.ts blob caa411e6fa3354a6b435c67a6392cebdd440bd9e (672 سطرًا).
- الهدف الأصلي قبل التعديل: src/lib/unified-import.ts blob 7fa69c332256e1c6a3c40a14303964404324a586 (901 سطرًا)؛ التنفيذ الهدف أكثر تحفظًا في حد الأعمدة/حجم الرفع، حجم chunks، التحقق من تسلسل/حجوم/hash شرائح الاستئناف، streaming SHA-256، وحد توسّع XLSX. لذلك لم يُستبدل الملف القديم بالنسخة الأقصر.
- فائدة محددة تم تكييفها في الهدف: تطبيع Unicode NFKC، إزالة التشكيل والتطويل، توحيد أشكال الألف/الألف المقصورة، وتوسعة الأسماء القياسية للباركود والوحدة والفئة والوصف والاسم؛ كما أصبح تطبيع مفاتيح قاموس synonyms المخصص يعمل حتى لو كان المفتاح مكتوبًا بتشكيل/ألف بديلة.
- ملفات الهدف المحفوظة على فرع P2: src/lib/unified-import.ts (تعديل؛ commit 477217f7131fbe015212a800273d36f142f05cc4) وsrc/test/unified-import-safety.test.ts (اختبارات جديدة؛ آخر تعديل test commit 49fa336b6a04db3d3272ac78d78cc17b89bc7a89). حالات الاختبار تشمل Unicode fullwidth وArabic diacritics/tatweel وaliases للباركود والوحدة والفئة والإيراد وقاموس synonyms مخصص.
- الحالة الحالية: IMPLEMENTED على فرع P2؛ TESTED_EXACT_SHA = PENDING/NOT RUN حتى اكتمال CI على رأس الفرع النهائي؛ لا يُنقل نجاح CI أقدم إلى هذه التغييرات.

### ADAPT_AND_INTEGRATE — مصالحة المخزون المقيدة، غير منفذة بعد
- المرشح: EXTRACTED_PROJECTS/project-bolt-github-gcrrtnzl/project/supabase/migrations/20260909005534_inventory_reconciliation_controlled_apply_rollback.sql.
- المخطط المانح يعتمد onyx_datasets/onyx_dataset_rows/inventory_reconciliations وأعمدة quantity/delta/source_type؛ Nasr1 يعتمد onyx_snapshots/onyx_snapshot_rows/inventory_reconciliation_runs/items وأرصدة quantity_on_hand/quantity_reserved/quantity_available وحركات movement_type/quantity/balance_after/reference_type.
- النتيجة: SQL الخام غير متوافق ولا ينسخ. قيمة الفكرة المحتملة هي دورة preview → approve → apply → compensating rollback. قبل التنفيذ يجب إعادة فحص رصيد المخزن وحجزه وحداثته تحت locks في معاملة ذرية، إنشاء حركات stock/audit، فرض idempotency وصلاحيات tenant/role، ومنع rollback من الكتابة فوق أي حركة لاحقة. الحالة: REFERENCE_ONLY / ADAPT_AND_INTEGRATE_PENDING.
- المركز الحالي ينفذ المقارنة التحليلية عبر run_inventory_reconciliation(p_snapshot_id) فقط ولا يغيّر الأرصدة؛ لا تدّع وجود اعتماد أو تطبيق أو تراجع.

### ADAPT_AND_INTEGRATE_PENDING — اختبارات متصفح حرجة
- المرشح: EXTRACTED_PROJECTS/project-bolt-github-gcrrtnzl/project/e2e/critical-path.spec.ts؛ لا يوجد مسار مطابق في شجرة Nasr1/main عند SHA المذكور.
- الاختبار المانح يعتمد E2E_EMAIL/E2E_PASSWORD وE2E_EMAIL_B/E2E_PASSWORD_B، ونصوص/مسارات هوية قديمة. يحتاج تكييفًا على عقد تسجيل الدخول والروابط الفعلية في Nasr1، مع إثبات سيناريو catalog→cart→order→refresh وعزل المؤسسات. لا تُضمّن أسرار حسابات في المستودع؛ غياب أسرار CI يساوي NOT RUN/BLOCKED وليس skip صامتًا.
- حالة الاختبار من هذا الفحص: NOT RUN.

## 4. عناصر قبول لم تُغلق بهذه المراجعة
1. تسوية تباين 33 ملفًا بين تقرير الاستخراج وشجرة المستودع. لا تعتبره نقص ZIP مؤكّدًا حتى يتضح أصل العدد.
2. دورة تطبيق مصالحة Onyx والتراجع التعويضي الآمن مع PostgreSQL concurrency/RLS acceptance.
3. تكييف Playwright، وإثبات المسارات الفعلية ببيئة حسابات E2E مناسبة.
4. استكمال طباعة الفواتير وكشوف الحساب والإشعارات الدائنة حسب المؤسسة/الدور؛ ومتطلبات طباعة كل المهام بفلاتر الشاشة.
5. تأكيد إعدادات عرض السعر عبر مسار PR #12 بعد إصلاح/تفسير CI: Action 39339667293 فشل على SHA b3daf67de14c935fdafb0c2bf06c2f02e6be6ec5. لا تستخدمه دليل PASS، ولا تكرر ميزة الخصوصية قبل قراءة سبب الفشل.
6. مراجعة هوية العلامة في الشاشات/metadata/PWA/PDF/Excel والإشعارات، والتحقق من ربط آخر حالة/وقت مزامنة Onyx بدليل حقيقي؛ لم يثبت ذلك بالكامل في هذا الفحص.
7. إكمال التحقق السلوكي من AI provider fallback وUsage Ledger؛ blobs المتطابقة وحدها لا تثبت التشغيل/configuration.

## 5. الحالة والخطوة التالية
هذه الجولة حسمت بعض قرارات المصدر وربطت تحسينًا صغيرًا في normalization، لكنها لا تعني اكتمال فحص كل ميزة في جميع المشاريع ولا اكتمال المواصفة.
- الحالة: source tree reviewed; selected contracts checked by blob and file content; one target-native import enhancement IMPLEMENTED on P2 PR branch.
- Build/tests/CI after import changes: PENDING؛ لا local checkout أو runner مستخدم في هذه الجولة.
- main لم يُعدل؛ جميع التعديلات على فرع PR #18 الحالي.
- next_task_id remains NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004. لا تغيّر مؤشر الاستئناف بسبب هذا الجرد وحده.
