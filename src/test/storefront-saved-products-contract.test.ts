import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261020200000_storefront_saved_products.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/saved-products.ts"), "utf8");
const storefront = readFileSync(join(process.cwd(), "src/components/Storefront.tsx"), "utf8");

describe("storefront saved-products integration contract", () => {
  it("derives profile and tenant from auth.uid and denies browser direct-table access", () => {
    expect(migration).toContain("ALTER TABLE public.storefront_saved_products ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.storefront_saved_products FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("p.auth_user_id = auth.uid()");
    expect(migration).toContain("p.is_active = true");
    expect(migration).toContain("p.organization_id = v_organization_id");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.list_storefront_saved_products() TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.set_storefront_saved_product(uuid, boolean) TO authenticated");
  });

  it("makes save/remove repeat-safe and audits only effective state transitions", () => {
    expect(migration).toContain("UNIQUE (organization_id, profile_id, product_id)");
    expect(migration).toContain("ON CONFLICT (organization_id, profile_id, product_id) DO NOTHING");
    expect(migration).toContain("storefront.saved_product.added");
    expect(migration).toContain("storefront.saved_product.removed");
    expect(migration).toContain("GET DIAGNOSTICS v_rows = ROW_COUNT");
  });

  it("uses RPCs and a profile-specific local queue instead of the donor's unscoped table contract", () => {
    expect(service).toContain("list_storefront_saved_products");
    expect(service).toContain("set_storefront_saved_product");
    expect(service).toContain("aghbari:wishlist-pending:v1:");
    expect(service).toContain("sessionData.session?.user.id !== authUserId");
    expect(service).toContain("navigator.onLine === false");
    expect(storefront).toContain("savedProductCacheKey(user.profileId)");
    expect(storefront).toContain("syncStorefrontSavedProducts(user.id, user.profileId)");
    expect(storefront).toContain("setStorefrontSavedProduct(user.id, user.profileId, productId, saved)");
    expect(storefront).toContain("ستُعاد مزامنتها عند عودة الاتصال");
  });
});
