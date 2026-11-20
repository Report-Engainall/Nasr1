# Storefront Product Questions — Execution Checkpoint — 2026-11-13

- Repository: \`Report-Engainall/Nasr1\`
- Base: \`main\` at \`125da763fdac7be251e6808c16abd26144d0d19f\` (verified product-review merge).
- Branch: \`feat/storefront-product-questions-20261113\`
- State at implementation commit: source and test suite staged for exact-SHA P1/P2 acceptance; this document must be updated only from actual workflow results.
- Scope: first-party customer questions and merchant answers in existing Storefront Product Detail and Products workspace; no duplicate route, auth, tenant, order, or role model.
- Security: tenant-scoped Supabase RPCs, RLS enabled with direct browser table access revoked; public read returns answered-only allow-listed fields; customer context returns only own questions; same-tenant admin/manager queue and moderation; actor-attributed audit events.
- Functional rules: customer may ask before or after purchase; server marks whether a delivered same-product purchase exists. Answers require 5–1500 characters. Rejection requires a 5–500 character reason. Pending/rejected questions are never public.
- Files: migration \`20261113130000_storefront_product_questions.sql\`, service, public component, moderation component, component/service tests, P2 local PostgreSQL acceptance script, workflow integration, and reference/third-party-license notes.
- External code/licensing: no external source code, images, package, dependency, or paid provider copied or introduced. Existing NASR1 patterns were extended independently.
- No deployment, no Vercel, no hosted Supabase migration or write.
- Acceptance must be recorded against the exact final PR head: full Vitest, strict TypeScript, production build, public Playwright, local PostgreSQL 17 migration/RPC/tenant/audit test, and cleanup/artifact boundary.
- External secret-gated hosted E2E remains a separate gate and must not be marked as passed if skipped.
