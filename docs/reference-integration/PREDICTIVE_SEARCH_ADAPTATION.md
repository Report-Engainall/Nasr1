# Predictive search adaptation

**Target:** `Report-Engainall/Nasr1`  
**Implementation date:** 2026-11-13  
**Target base:** `ee2a70c5d7af59abff44c1ac50c2626c76f00862`

## Reference source inspected

- Repository: [Shopify Hydrogen](https://github.com/Shopify/hydrogen)
- Branch: `main`
- Pinned commit: `043094b0ab0b5b01299e75da33d3f4e2914fda6a`
- Search UI: `templates/react-router/app/components/SearchDrawer.tsx`, blob `800a73cf230a6885136d003c41f93575ec51ed35`
- Search request contract: `templates/react-router/app/lib/predictive-search-handlers.ts`, blob `260ea874eefcefb8e911f7454f246819037a18eb`
- Result announcements: `templates/react-router/app/lib/predictive-search.ts`, blob `70cc640d1cba1590748085f29d8f652da90fcfd8`
- Template license: `templates/react-router/LICENSE`, blob `bf165a7b356128f2dee05ee629364263f98c4d2e` — MIT, read at the same pinned commit.

## Adapted to Nasr1

- A persistent combobox presents a query action, active category matches, and product suggestions.
- Keyboard users can move through suggestions with Arrow Up/Down, commit with Enter, and dismiss with Escape.
- Results are sourced only from the current authorized, paginated Nasr1 catalog snapshot. The component does not issue a second request and rejects stale snapshots by matching the query, category, availability filter, loading/error state, online state and authenticated identity already bound to the Storefront request.
- Product suggestions show only the product label, item code and optional image. No price, stock, tenant identifier or private product field is added to the suggestion UI.
- Selecting a product uses the existing product route; selecting a category or query uses the existing catalog route and URL-backed filters.
- The suggestion panel uses Nasr1's existing semantic color tokens and Arabic RTL shell.

## Transfer and license decision

No Hydrogen source code, package, image or runtime was copied. Its UI and server-side rate-limit/predictive-search patterns were independently adapted to Nasr1's React, TanStack Router, existing Supabase catalog RPC and tenant-aware snapshot logic. MIT license review is recorded for the specific template files above; the application continues to use its existing dependencies only.

## Validation boundary

This change adds isolated component regression coverage for grouped suggestions, Arabic active-category filtering, keyboard selection, stale-result suppression, error handling, Escape and the five-product cap. It does not claim hosted Supabase, authenticated checkout, or browser/database acceptance.
