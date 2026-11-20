import { describe, expect, it } from "vitest";
import {
  sessionIdFromVerifiedJwt,
  verifiedActivePromptContent,
} from "./active-ai-prompt-runtime";

const sessionId = "00000000-0000-4000-8000-000000000123";
function tokenWithClaims(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return "header." + payload + ".signature";
}
async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("active AI prompt runtime boundary", () => {
  it("extracts only a valid session_id claim from a JWT payload", () => {
    expect(sessionIdFromVerifiedJwt(tokenWithClaims({ session_id: sessionId }))).toBe(sessionId);
    expect(sessionIdFromVerifiedJwt(tokenWithClaims({ session_id: "not-a-uuid" }))).toBeNull();
    expect(sessionIdFromVerifiedJwt(tokenWithClaims({ sub: sessionId }))).toBeNull();
    expect(sessionIdFromVerifiedJwt("not-a-jwt")).toBeNull();
  });

  it("returns the active prompt only when its SHA-256 matches the exact content", async () => {
    const content = "أجب بالعربية ولا تخمّن بيانات الأعمال. استخدم الأدلة الموثقة فقط.";
    expect(await verifiedActivePromptContent({
      prompt_key: "assistant.system",
      content,
      content_sha256: await digest(content),
    })).toBe(content);
  });

  it("fails closed when an active prompt hash does not match", async () => {
    await expect(verifiedActivePromptContent({
      content: "تعليمات نظام صالحة لكن بصمة المحتوى غير مطابقة.",
      content_sha256: "a".repeat(64),
    })).rejects.toThrow("active_prompt_integrity_failed");
  });

  it("rejects malformed or oversized active prompt payloads", async () => {
    await expect(verifiedActivePromptContent({ content: "too short", content_sha256: "a".repeat(64) }))
      .rejects.toThrow("active_prompt_response_invalid");
    await expect(verifiedActivePromptContent({ content: "x".repeat(8001), content_sha256: "a".repeat(64) }))
      .rejects.toThrow("active_prompt_response_invalid");
    await expect(verifiedActivePromptContent(null)).rejects.toThrow("active_prompt_missing");
  });
});
