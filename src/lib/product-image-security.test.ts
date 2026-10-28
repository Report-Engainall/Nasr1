import { describe, expect, it } from "vitest";
import { extractOwnedProductImageObjectPath } from "./product-image-security";
import {
  hasAllowedProductImageRole,
  isSafeProductImageRequest,
  isValidProductImageObjectPath,
  isWebpPayload,
  PRODUCT_IMAGE_MAX_BYTES,
} from "@/lib/product-image-security";

const ORG = "a0000000-0000-0000-0000-000000000001";
const PRODUCT = "a1000000-0000-0000-0000-000000000001";
const OBJECT = "b1000000-0000-4000-8000-000000000001";
describe("server-authoritative product image security contract", () => {
  it("accepts only safe organization/product UUID request identifiers", () => {
    expect(isSafeProductImageRequest(PRODUCT, ORG)).toBe(true);
    expect(isSafeProductImageRequest("../../other", ORG)).toBe(false);
    expect(isSafeProductImageRequest(PRODUCT, null)).toBe(false);
  });
  it("rejects cross-tenant, wrong-product and path traversal cleanup requests", () => {
    expect(isValidProductImageObjectPath(ORG + "/" + PRODUCT + "/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(true);
    expect(isValidProductImageObjectPath("b0000000-0000-0000-0000-000000000001/" + PRODUCT + "/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(false);
    expect(isValidProductImageObjectPath(ORG + "/../../other/" + OBJECT + ".webp", ORG, PRODUCT)).toBe(false);
    expect(isValidProductImageObjectPath(ORG + "/" + PRODUCT + "/notes.txt", ORG, PRODUCT)).toBe(false);
  });
  it("extracts only the HTTPS object URL owned by the expected tenant and product", () => {
    const publicUrl = `https://project.example.test/storage/v1/object/public/product-images/${ORG}/${PRODUCT}/${OBJECT}.webp`;
    expect(extractOwnedProductImageObjectPath(publicUrl, ORG, PRODUCT)).toBe(`${ORG}/${PRODUCT}/${OBJECT}.webp`);
  });

  it.each([
    ["foreign organization", `https://project.example.test/storage/v1/object/public/product-images/b0000000-0000-0000-0000-000000000001/${PRODUCT}/${OBJECT}.webp`],
    ["foreign product", `https://project.example.test/storage/v1/object/public/product-images/${ORG}/b1000000-0000-4000-8000-000000000002/${OBJECT}.webp`],
    ["wrong bucket", `https://project.example.test/storage/v1/object/public/other-bucket/${ORG}/${PRODUCT}/${OBJECT}.webp`],
    ["encoded path", `https://project.example.test/storage/v1/object/public/product-images/${ORG}/${PRODUCT}/%2e%2e%2f${OBJECT}.webp`],
    ["HTTP URL", `http://project.example.test/storage/v1/object/public/product-images/${ORG}/${PRODUCT}/${OBJECT}.webp`],
    ["query string", `https://project.example.test/storage/v1/object/public/product-images/${ORG}/${PRODUCT}/${OBJECT}.webp?token=secret`],
    ["external legacy image", "https://images.example.test/legacy/product.png"],
  ])("does not schedule cleanup for %s", (_case, value) => {
    expect(extractOwnedProductImageObjectPath(value, ORG, PRODUCT)).toBeUndefined();
  });

  it("checks actual WebP RIFF/WEBP signature and explicit byte ceiling", () => {
    const valid = new Uint8Array(12);
    valid.set([0x52,0x49,0x46,0x46], 0); valid.set([4,0,0,0], 4); valid.set([0x57,0x45,0x42,0x50], 8);
    expect(isWebpPayload(valid)).toBe(true);
    expect(isWebpPayload(new Uint8Array([0x52,0x49,0x46,0x46]))).toBe(false);
    expect(isWebpPayload(new TextEncoder().encode("<html>"))).toBe(false);
    expect(PRODUCT_IMAGE_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
  it("limits upload to actual staff roles", () => {
    expect(hasAllowedProductImageRole(["manager"])).toBe(true);
    expect(hasAllowedProductImageRole(["staff"])).toBe(true);
    expect(hasAllowedProductImageRole(["customer"])).toBe(false);
    expect(hasAllowedProductImageRole([])).toBe(false);
  });
});
