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
