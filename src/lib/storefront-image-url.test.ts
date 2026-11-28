import { describe, expect, it } from "vitest";
import { isSafeStorefrontImageUrl } from "./storefront-image-url";

describe("isSafeStorefrontImageUrl", () => {
  it("accepts stable public HTTPS image URLs, including harmless transform parameters", () => {
    expect(isSafeStorefrontImageUrl("https://example.test/storage/v1/object/public/products/item.webp")).toBe(true);
    expect(isSafeStorefrontImageUrl("https://cdn.example.test/item.webp?width=640&quality=80")).toBe(true);
  });

  it("rejects non-HTTPS, malformed, whitespace-padded and credential-bearing URLs", () => {
    expect(isSafeStorefrontImageUrl("http://example.test/item.webp")).toBe(false);
    expect(isSafeStorefrontImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeStorefrontImageUrl("not a URL")).toBe(false);
    expect(isSafeStorefrontImageUrl(" https://example.test/item.webp")).toBe(false);
    expect(isSafeStorefrontImageUrl("https://example.test/item.webp ")).toBe(false);
    expect(isSafeStorefrontImageUrl("https://user:password@example.test/item.webp")).toBe(false);
    expect(isSafeStorefrontImageUrl("https://user@example.test/item.webp")).toBe(false);
  });

  it("rejects private and signed URL query parameters without exposing their values", () => {
    const privateKeys = [
      "token",
      "signature",
      "sig",
      "apikey",
      "api_key",
      "authorization",
      "access_token",
      "refresh_token",
      "jwt",
      "credential",
      "X-Amz-Signature",
      "X-Amz-Credential",
      "X-Goog-Signature",
      "X-Goog-Credential",
    ];

    for (const key of privateKeys) {
      expect(
        isSafeStorefrontImageUrl(`https://cdn.example.test/item.webp?${encodeURIComponent(key)}=secret`),
        key,
      ).toBe(false);
    }
  });

  it("rejects oversized URLs and accepts unknown harmless query keys", () => {
    expect(isSafeStorefrontImageUrl("https://example.test/" + "a".repeat(2050))).toBe(false);
    expect(isSafeStorefrontImageUrl("https://example.test/item.webp?version=2")).toBe(true);
    expect(isSafeStorefrontImageUrl(null)).toBe(false);
    expect(isSafeStorefrontImageUrl(undefined)).toBe(false);
  });
});
