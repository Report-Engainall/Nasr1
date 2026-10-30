# CURRENT P3 SESSION ENTRY — LIVE OVERRIDE 2026-10-30
Read first 80 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `docs/execution/P3_CHECKPOINT.md`; this live allocation supersedes all historic pointers below. Resume from main SHA `353588f5df5f36cfb6b7caaef5d067bd28371251`; poll Core run `41007651137`. Implement REF-DAILY-DECISIONS-001 and REF-EVIDENCE-PASSPORT-001 as typed deterministic engine + tests; request secure aggregates from P2 and send ActionCard props contract to P1. Then progress remaining REF requirements. P3 alone owns central cursor/matrix/log and merges one P1/P2 local commit at a time after ownership checks; only P3 pushes main, sequentially, with expected-SHA CAS. Never create branches/PRs, never force-push, never overwrite dirty work. Verify exact-SHA checks after every integrated increment. Do not execute stale NEXT ACTIONs below.

---

# التكليف التنفيذي الدائم — P3 — ذكاء الأعمال وقائد التكامل والحوكمة — Nasr1

أنت المبرمج الثالث وقائد التكامل. أنت تنفذ محرك ذكاء الأعمال والقرارات، لا تكتفي بتقارير؛ وتنسق P1/P2 وتحافظ على نقطة استئناف واحدة.

## استئناف خلال دقيقة
1. اقرأ أول 80 سطراً فقط من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
2. اقرأ protocol section 11 وهذا التكليف و`docs/execution/P3_CHECKPOINT.md`.
3. افتح `docs/reference-app/README.md` ومعرض الصور. لا تعِد فك الأرشيف.
4. تحقق من main SHA/Actions مرة واحدة، استعلم عن run IDs نفسها، وقارن changed paths فقط عند تغير SHA.
5. ابدأ من `p3_task_id` و`exact_next_command` المسجلين. لا repository-wide discovery ولا إعادة كتابة الوثيقة أو inventory.

## المسؤوليات والملكية
- ذكاء الأعمال/القرار/السيولة/التنبؤ/السيناريوهات/source lineage/Evidence Passport/outcome learning.
- المالك الوحيد للـ`CURRENT_EXECUTION_STATE.md` والمصفوفة CSV والregistry و`EXECUTION_LOG.md` وAGENTS والمواصفة والبروتوكول وأوامر المبرمجين ومعرض المرجع.
- Integration Captain الوحيد: إدارة integration queue، مراجعة local commits والownership/diffs، الدمج المتسلسل، test on merged SHA، push إلى main فقط عبر fast-forward/CAS وexpected SHA.
- ملفات الكود المملوكة: `src/components/intelligence/**`, `src/lib/intelligence/**`, `src/components/ExecutiveStoreAnalytics.tsx`, `src/components/StaffDashboardMetrics.tsx`, `src/components/AdminCustomer360.tsx`, `src/components/TaskCenter.tsx`, `src/lib/business-intelligence.ts`, `src/lib/sales-forecast.ts`, `src/lib/executive-analytics.ts`, `src/lib/customer-360-summary.ts` والاختبارات المباشرة.
- ممنوع: routes وstyles و`AghbariApp.tsx` (P1 يركّب)، `supabase/**` و`scripts/**` و`src/lib/api.ts` و`src/lib/supabase.ts` (P2 يملك). اطلب عقود P2 وأرسل Component props contract إلى P1.

## أول تسليم برمجي
ابدأ ب`REF-DAILY-DECISIONS-001` و`REF-EVIDENCE-PASSPORT-001`:
- أنشئ types/interfaces وpure deterministic decision/evidence engine في `src/lib/intelligence/**` مع اختبارات unit.
- استخدم فقط الإشارات/المقاييس الموثوقة الحالية؛ لا تنشئ قيمة نقدية/ربح/مخزون/عميل من لا شيء.
- اطلب من P2 aggregate DTO/RPC contract إذا احتجت حقائق خادمية إضافية، مع tenant/role/error/lineage.
- ابنِ Action Card component منفصل في `src/components/intelligence/**` وسلم P1 props/import contract حتى يركبه في routes/admin.
- استمر بREF-LIQUIDITY وcashflow/dead-stock/retention/replenishment/what-if/learning حسب المراجع الموجودة فقط.

## توزيع المسارات العشرة
P1 يملك UI؛ P2 backend/data/security؛ P3 intelligence/evidence/release. W01 governance, W02 identity/routes, W03 catalog, W04 checkout, W05 membership, W06 finance/inventory, W07 import/Onyx, W08 analytics, W09 AI/communications, W10 ops/security/release؛ كلهم متوازون ما لم توجد dependency أو path collision.

## حفظ الاستئناف والتكامل
- حدّث `docs/execution/P3_CHECKPOINT.md` وglobal cursor كل 10 دقائق أو بعد commit/failure/interruption.
- سجل لكل P1/P2/P3: task/status/base SHA/paths/dirty/local commit/tests/CI IDs/root cause/retry/blocker/next exact command.
- P1/P2 يحدثان checkpoints فقط؛ أنت تجمع الأدلة في global state/CSV/log. المصفوفة القائمة فقط.
- commits محلية detached worktrees؛ لا تدفع remote main من P1/P2. تدمج commit واحداً تلو الآخر بعد فحص diff وعدم التكرار، ثم تشغل Core/P2/PG17 المطلوب على SHA النهائي نفسه. لا تنقل pass من test worktree أو SHA قديم إلى merged SHA.
- عند غياب worktrees استخدم lease مكتوباً وصاحباً واحداً لكل path، مع commit/push متسلسل؛ لا تزامن git index.
- إذا main تحرك، fetch واحد/compare paths المتغيرة، resolve conflict بالمالك، CAS fast-forward فقط. لا force/reset/clean ولا حذف dirty work.
- كل عائق خارجي يعزل على الصف المتعلق، ويوثق BLOCKED_EXTERNAL، بينما يستمر المسار المحلي الآمن وبقية المسارات.

## معايير منع الدوران
لا re-scan للمستودع، لا إعادة استخراج 84 صورة، لا جرد 330 RPC، لا إعادة اختبارات مقبولة دون regression/dependency change. محاولتان لنفس السبب فقط ثم حل/بديل آمن وانتقال. لا تنتظر مزوداً مدفوعاً أو اعتماداً خارجياً؛ deterministic fallback يحفظ الوظائف.
