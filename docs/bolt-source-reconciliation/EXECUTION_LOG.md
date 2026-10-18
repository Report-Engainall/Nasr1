# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-BOOT-001 — مواءمة البناء مع TanStack Start
- المستودع والفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- الدليل الأساسي: [CI 38971144752](https://github.com/Report-Engainall/Nasr1/actions/runs/38971144752) أخفق عند `bun install --frozen-lockfile --dry-run` قبل بدء الاختبارات. log يشير إلى عدم تطابق overrides في manifest وlock.
- اكتشف الفحص أن manifest وnpm lock قديمان (React Router/Vite 5)، بينما lock وroutes وtests/workflow تعتمد TanStack Start/Vite 8/Vitest.
- التغييرات: manifest من lock الحالي، scripts موجودة للـCI، Vite config wrapper مع مدخل server، تعديل اسم workspace فقط في lock، نقل root HTML وnpm lock المتعارضين إلى REFERENCE_ONLY مع الاحتفاظ بالمحتوى.
- الاعتماديات: صفر اعتماديات جديدة؛ استخدمت الموجود في Bun lock.
- الاختبار على SHA الجديد: pending GitHub Actions؛ لم يُشغّل شيء من checkout محلي.
- المانع: الأرشيفات الثنائية لم تُنزّل/تُفك في هذا batch؛ حالتها التاريخية موثقة دون ادعاء جديد.
- next_task_id: `NASR1-BOOT-001` حتى اجتياز التثبيت والبناء؛ ثم `NASR1-OPS-TASK-CENTER-001`.


## 2026-10-18 — NASR1-MISSING-MODULES-001 — استعادة وحدات من provenance
- SHA المختبر السابق: `790afce1aa2a78a4692d6f990599ed99a495515b` — [Actions run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150) = FAIL في unit tests بعد نجاح التثبيت.
- Vitest: 9 test files failed، 6 passed، و48 tests passed ضمن الملفات التي تم تشغيلها.
- أسباب missing imports: `customer-addresses.ts`, `customer-company-members.ts`, `finance-document-pdf.ts`, `unified-import.ts`, و`routes/api.invoice-pdf.$invoiceId.ts`. routeTree كان يشير بالفعل إلى route ملفه مفقود.
- مصدر الملفات الخمسة: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`. تمت مقارنة blob SHAs مع READY_TO_REUSE/PROVENANCE_MANIFEST.csv قبل الإضافة، وتُحفظ النسخ المرجعية دون تعديل.
- اختبار ما بعد الاستعادة: PENDING على SHA التالي؛ لا ادعاء PASS قبل قراءة Actions.
- next_task_id: `NASR1-MISSING-MODULES-001` حتى اختبارات الوحدات والـPDF والمسارات تجتاز.

## 2026-10-18 — NASR1-SUPABASE-CLIENT-001 — استعادة عقد عميل Supabase الصحيح
- SHA الأساس: `2f523b729c6ed28aff06fbeddabd18cd79a25131`; CI المرتبط به: [run 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558) = FAIL عند استيراد عميل Supabase أثناء اختبار route matching.
- الأدلة: frozen Bun lock PASS؛ التثبيت PASS؛ Vitest 14 ملفات PASS وملف واحد FAIL، 133 اختبارًا PASS. الاستثناء `supabaseUrl is required` من العميل القديم في `src/lib/supabase.ts`.
- المصدر: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, الملف `src/lib/supabase.ts`, source blob `430fd42b111f26e5bd1104c9a19b4350a39de7fb`. الكود يربط بطبقة العميل الموجودة في Nasr1 ويضيف نطاق المؤسسة الذي تتوقعه API، دون أخذ IDs من browser أو إضافة اعتماديات.
- القرار: استبدال العميل القديم الذي لا يطابق عقد التطبيق النشط؛ حفظ قرار المصدر والبصمة في ledger.
- اختبار هذه الدفعة: `PENDING_REMOTE_CI`؛ لم تُشغّل أوامر محلية لأن checkout غير متاح.
- next_task_id يبقى `NASR1-SUPABASE-CLIENT-001` حتى قراءة CI الجديد.
