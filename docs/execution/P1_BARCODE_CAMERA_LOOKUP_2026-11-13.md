# P1 — Complete barcode scan-to-product lookup — 2026-11-13

- Repository: `Report-Engainall/Nasr1`
- Base `main` SHA: `1b175ae24a1d9d7d6e618016fcf85f4543573fa3`
- Work branch: `feat/barcode-camera-auto-lookup-20261113`
- Code commit: `5ae3e1439fbdefcdf4c217b5b001e8f69f560f5c`

## Delivered

1. Camera detection now dispatches the detected value into the current asynchronous product lookup immediately. A ref keeps the scanner effect from invoking a stale callback when the entered value changes.
2. Manual and camera-supplied codes normalize Arabic-Indic and Persian digits to ASCII before exact matching.
3. Normalization is purpose-built for barcodes/QR payloads: punctuation, separators, letters and query-string characters are preserved. The decimal quantity normalizer is deliberately not reused.
4. The lookup continues to require the current tenant scope, an active product, exact barcode/item-code matching, and the existing server-resolved customer price path.

## Changed paths

- `src/components/CustomerWorkflows.tsx`
- `src/lib/localized-barcode-input.ts`
- `src/lib/localized-barcode-input.test.ts`

## Safety boundary

- No route, dependency, database schema, SQL, RPC, RLS, auth policy, tenant contract, cart persistence contract or pricing resolver was changed.
- Camera access still depends on browser support for `BarcodeDetector`, HTTPS and user camera permission. This commit does not claim physical-device camera acceptance.
- No Vercel deployment, production database write or external service was used.
- No third-party implementation was copied; the normalization helper is a small independent utility, so it introduces no new third-party license obligation.

## Acceptance status

- Focused unit tests were added for ASCII, Arabic-Indic, Persian, mixed QR payloads, punctuation preservation and whitespace trimming.
- Exact-HEAD P1 Vitest, strict TypeScript and production build: pending GitHub Actions.
- Exact-HEAD P2 browser/database acceptance: pending GitHub Actions. A browser without camera hardware cannot prove physical camera behavior; that remains a separate device-level check.
- Do not mark either workflow accepted until it reaches terminal success on the exact PR head.
