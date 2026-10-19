# تقرير الاستئناف — المبرمج 1 / دمج مصادر المشاريع الثلاثة

المستودع الهدف: Report-Engainall/Nasr1  
ملكية التقرير: المبرمج 1 فقط.  
task الحالي: NASR1-SOURCE-INTEGRATION-INV-TRANSFER-001.

## نقطة الاستئناف المسجلة
- main آخر رأس موثق: 0c089585d27665680dcc4ad2520dd4affc875804؛ CI [39311791227 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227) كان مطابقًا لذلك الرأس وقت التسجيل. تحقق من metadata فقط لأن الرأس قد يتقدم.
- PR #3 تحويل الدفعات: https://github.com/Report-Engainall/Nasr1/pull/3، فرع integration/inventory-transfer-batches-20261019-rebased، آخر head موثق bf31eea06d020955b0912d252087c72f98e023f5؛ CI [39314953094 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/39314953094). الدليل: `permission denied for table inventory_transfer_batches` أثناء فحص قاعدة البيانات. لا تغير grants/RLS لتجاوز الاختبار؛ افصل قراءة الاختبار المميزة عن negative test الذي يثبت منع authenticated من SELECT مباشر.
- PR #2 نسخة قديمة مكررة: https://github.com/Report-Engainall/Nasr1/pull/2، ولا تدمجها. قارن فرقها الفريد مرة واحدة مع PR #3؛ احتفظ بالتغييرات الفريدة الصحيحة فقط ثم أغلق القديم بعد إثبات عدم فقد شيء.
- فحص المصدر المسجل: Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1، src/services/inventory.ts، blob 3506707a656e0db491b860d5e11ad28daeded5cf، ونسخة READY_TO_REUSE لها blob مطابق. لا تعِد جلبها.

## المطلوب بعد إصلاح PR #3
- أكمل عناصر SOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv للمصادر الثلاثة، بالترتيب من أول حالة PENDING/غير محسومة فقط.
- لا تعِد قراءة blob له قرار موثق. لا تعِد فحص كل الفروع أو الجرد الكامل إذا لم تتغير قائمة المصدر/head. اقرأ اختلافات blobs الجديدة فقط.
- أنت وحدك تعدل سجل دمج المصادر، جرد READY_TO_REUSE، وهذا التقرير. لا تعدل سجل الأرشيف أو الحالة التنفيذية أو تقرير المبرمج 2.
- افحص ملفات PRs للمعرفة بالتداخل فقط؛ لا تدخل على نطاق Bolt archive ولا تنفذ بنود المواصفة التي لا ترتبط بميزة من مصدر مانح.
- نفذ الميزة إلى حد route/service/schema/RLS/RPC/tests متصلة، وشغّل CI على SHA نفسه.

## ما يكتب في كل حفظ
task ID، repo/ref/commit/blob/path، قرار، تبعيات، مسارات Nasr1 المتأثرة، أمر اختبار ونتيجة، رابط CI المطابق، الفشل وإصلاحه، next_source_task_id واحد.
