/**
 * The only Supabase project authorized for the Nasr1 application.
 *
 * Validate every browser and server client before it sends a request. This prevents
 * stale Bolt/Lovable environment values from silently connecting the application
 * to the retired Aghbari project or another tenant database.
 */
export const CANONICAL_SUPABASE_PROJECT_REF = 'tfdwtuwkdddnzgyhcoyy';
const CANONICAL_SUPABASE_HOST = `${CANONICAL_SUPABASE_PROJECT_REF}.supabase.co`;

export function assertCanonicalSupabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(
      `SUPABASE_URL must target the canonical Nasr1 Supabase project (${CANONICAL_SUPABASE_HOST}). No database request was sent.`,
    );
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== CANONICAL_SUPABASE_HOST ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      `SUPABASE_URL must target the canonical Nasr1 Supabase project (${CANONICAL_SUPABASE_HOST}). No database request was sent.`,
    );
  }

  return `https://${CANONICAL_SUPABASE_HOST}`;
}


/**
 * Validate the browser-only Supabase endpoint used by the isolated local P2 suite.
 * This does not expand the canonical production/server allow-list.
 */
export function assertLocalSupabaseE2EUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Local Supabase E2E URL must be a valid loopback HTTP URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "http:" ||
    (host !== "127.0.0.1" && host !== "localhost") ||
    parsed.port === "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("Local Supabase E2E URL must use HTTP, an explicit port, and only localhost or 127.0.0.1. No database request was sent.");
  }

  return parsed.origin;
}

/**
 * Browser-client URL selection. The local override is opt-in at build time and
 * must still pass the strict loopback-only validator.
 */
export function assertClientSupabaseUrl(value: string, allowLocalSupabaseE2E = false): string {
  return allowLocalSupabaseE2E
    ? assertLocalSupabaseE2EUrl(value)
    : assertCanonicalSupabaseUrl(value);
}
