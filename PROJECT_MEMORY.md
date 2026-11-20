# PROJECT MEMORY — متجر الأغبري | Aghbari Commerce — Nasr1

## Canonical source and documents

- Repository: `https://github.com/Report-Engainall/Nasr1`.
- Active branch: `main` only. Fetch the actual current SHA; never assume a remembered SHA is still head.
- Product: متجر الأغبري | Aghbari Commerce.
- Permanent instructions: `AGENTS.md`.
- Active resume cursor: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
- Sole acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- Master specification: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.
- Stable requirement index: `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`.
- API/RPC/Edge contracts: `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md`.
- Archive branch: `nasr1-reference-archive-2026-11-08`, read-only. Restore only exact needed files; never merge it wholesale. Historical SHA/status claims are not current truth.

## Approved Supabase project

- Name: `aghbari-commerce-nasr1`.
- Project ref: `tfdwtuwkdddnzgyhcoyy`.
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`.
- Retired project: `aghbari-commerce`, ref `mrcyqezbhpncuvaehwgf`; never connect to it.
- Latest direct inspection (2026-11-08): ACTIVE_HEALTHY, PostgreSQL 17.11; 145 public relations with RLS enabled; 273 migration records (latest `20261108194404`); four buckets; 437 public-schema routines and a PostgREST cache event of 349 RPCs (different catalogs); six Edge Function sources in main and zero deployed.
- Operational initialization: one active organization; zero Auth users, profiles, roles/admins, branches, warehouses, categories and products. Do not invent or seed these.
- Two migrations applied in the 2026-11-08 continuation: `20261108193554_public_storefront_categories_rpc` and `20261108194404_first_admin_bootstrap_rpc`. Never replay them.

## Current connection, guest storefront and administrator

- Browser/server Supabase clients fail closed unless URL is the canonical project. Browser client rejects an `sb_secret_` key. URL guard cannot prove a publishable key belongs to the URL; check the real Bolt runtime `apikey`/network request at connection.
- `get_current_tenant_context()` exists with zero args and remains authenticated-only. Do not duplicate it, add dummy parameters or grant anon.
- Guest reads must use public-safe RPCs and must not resolve tenant/warehouse IDs or read tenant tables directly. `get_public_storefront_categories()` is anon-only, six public fields; guest product pages use `get_storefront_catalog_page()`.
- `bootstrap_first_admin_profile(uuid,text,text)` is service-role-only and requires matching invited/verified Auth UUID/email, exactly one active org and no previous admin. `bootstrap-first-admin` Edge Function source is in main but NOT deployed. Owner email/name, Auth invite delivery and high-entropy `NASR1_BOOTSTRAP_SECRET` remain prerequisites. No first admin has been created.

## Product boundaries

- B2B commerce, Arabic RTL by default and English localization.
- Server-selected customer price tier and server-authoritative prices, orders, inventory, credit and finance.
- Hidden price is omitted/NULL, never zero. Do not leak costs, margins, another customer/tier prices, tenant/warehouse IDs or financial data through API, DOM, PWA/cache, PDF, XLSX or print.
- Tenant/role/RLS authorization must hold in database/server boundaries; UI hiding is insufficient.
- Orders, finance and stock changes require successful online server confirmation. Offline cache and cart drafts are non-authoritative.
- Preserve immutable order amendment/version, cancellation, return/credit, supplier finance, liquidity/reconciliation, replenishment, task/service, Customer 360, Onyx, analytics and export modules. Inspect before extending; do not rebuild completed work.
- P1 owns UI/operational client workflows; P2 owns database/RPC/RLS/finance/inventory/integrations; P3 owns intelligence/rule engines. Do not duplicate engines.

## Non-negotiable operating rules

- No reset/drop/truncate/seed/demo data, default passwords, fabricated admin, role assignments, branches, warehouse, categories or products.
- Do not rerun applied migrations. New DDL must be additive, justified and tested on isolated PostgreSQL 17 first.
- Service-role keys and bootstrap secrets remain server-side; never commit them or place them in `VITE_*`.
- Paid AI spend stays zero. Do not spend Bolt/Vercel credits on routine source work or deploy automatically because code changed.
- Never claim build/test/browser/production PASS unless it ran on the exact relevant SHA and environment.
- At session end update the existing execution pointer and sole matrix; do not add parallel status files.
