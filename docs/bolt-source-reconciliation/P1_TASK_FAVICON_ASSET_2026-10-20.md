# P1 Source Integration — Restore Existing Aghbari Commerce Favicon
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/restore-verified-brand-favicon-20261020`  
**Base SHA:** `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`  
**Source:** `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`

## Evidence
- Target `src/routes/__root.tsx` already declares `{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }`.
- The target `public/` tree did not contain `favicon.ico`; the browser's configured icon URL was therefore broken.
- The same-product donor has `public/favicon.ico` at blob `3c01d69713f9c184e92b74f5799e6dff2f500825`.
- Copied the original asset as a Git binary blob. The target blob is required to equal the donor blob SHA exactly; no recompression or image editing was used.
- No saved-address functionality was changed: the customer-address service, tests and SQL migrations were already present in Nasr1 with blob SHAs matching the donor.

## Files changed
- Add `public/favicon.ico`, a bit-for-bit copy from the reviewed source.
- Add `src/test/favicon-asset.test.ts` to validate the ICO directory header, image table and byte bounds, and assert the root-route icon link points to the same path.
- Add a source-decision row to the P1-owned `SOURCE_INTEGRATION_LEDGER.csv`.
- Add the source/target blob trace to the P1-owned `READY_TO_REUSE_FILE_AUDIT.csv`.

## Safety and validation
- No runtime application logic, metadata, route behavior, authorization, database migration, secret or donor repository was changed.
- Visual/pixel-level logo review was **NOT RUN**; this is a static asset from the same Aghbari Commerce donor and is copied without modification.
- Local tests are **NOT RUN** in this session; CI must pass on the exact PR head before merge.
- No P2-owned report file or Bolt archive was touched.

## Next task
Continue the existing P1 source ledger from the oldest remaining item that is marked partial or deferred and not already covered by a target-native equivalent. Do not import the legacy global webhook worker without tenant-scoped destination ownership, SSRF/egress controls, signing/secrets, retry and idempotency requirements.
