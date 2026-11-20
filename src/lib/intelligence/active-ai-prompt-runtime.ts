const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sessionIdFromVerifiedJwt(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const value = claims.session_id;
    return typeof value === "string" && SESSION_ID.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifiedActivePromptContent(value: unknown): Promise<string> {
  if (value === null || value === undefined) throw new Error("active_prompt_missing");
  if (!isRecord(value)) throw new Error("active_prompt_response_invalid");
  const content = value.content;
  const expectedHash = value.content_sha256;
  if (
    typeof content !== "string" ||
    content.length < 16 ||
    content.length > 8000 ||
    typeof expectedHash !== "string" ||
    !CONTENT_SHA256.test(expectedHash)
  ) {
    throw new Error("active_prompt_response_invalid");
  }
  if (await sha256Hex(content) !== expectedHash) throw new Error("active_prompt_integrity_failed");
  return content;
}
