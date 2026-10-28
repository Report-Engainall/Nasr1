import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
  events: [] as string[],
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateResponse: null as { data: { id: string } | null; error: unknown | null } | null,
  deleteResponse: null as { data: { deleted?: boolean } | null; error: unknown | null } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
  getCurrentTenantScope: mocks.getCurrentTenantScope,
  getStorefrontDataScope: mocks.getStorefrontDataScope,
}));

import {
  ProductImageCleanupError,
  removeProductImage,
  uploadProductImage,
} from "@/lib/api";

const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const PRODUCT_ID = "a1000000-0000-0000-0000-000000000001";
const OLD_OBJECT_ID = "b1000000-0000-4000-8000-000000000001";
const NEW_OBJECT_ID = "b1000000-0000-4000-8000-000000000002";
const OLD_PATH = `${ORGANIZATION_ID}/${PRODUCT_ID}/${OLD_OBJECT_ID}.webp`;
const NEW_PATH = `${ORGANIZATION_ID}/${PRODUCT_ID}/${NEW_OBJECT_ID}.webp`;
const OLD_URL = `https://storage.example.test/storage/v1/object/public/product-images/${OLD_PATH}`;
const NEW_URL = `https://storage.example.test/storage/v1/object/public/product-images/${NEW_PATH}`;

function setup() {
  mocks.events.splice(0);
  mocks.updates.splice(0);
  mocks.updateResponse = { data: { id: PRODUCT_ID }, error: null };
  mocks.deleteResponse = { data: { deleted: true }, error: null };
  mocks.getCurrentTenantScope.mockResolvedValue({
    organizationId: ORGANIZATION_ID,
    warehouseId: "d0000000-0000-0000-0000-000000000001",
    isStaff: true,
  });
  mocks.getStorefrontDataScope.mockResolvedValue({
    organizationId: ORGANIZATION_ID,
    warehouseId: "d0000000-0000-0000-0000-000000000001",
    isStaff: true,
  });
  mocks.from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      mocks.events.push("database-update");
      mocks.updates.push({ table, payload });
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.select = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => {
      mocks.events.push("database-update-confirmed");
      return mocks.updateResponse;
    });
    return builder;
  });
  mocks.invoke.mockImplementation(async (_name: string, options: { body?: unknown }) => {
    const body = options.body as { action?: string } | undefined;
    if (body?.action === "delete") {
      mocks.events.push("storage-delete");
      return mocks.deleteResponse ?? { data: { deleted: true }, error: null };
    }
    mocks.events.push("storage-upload");
    return { data: { public_url: NEW_URL, object_path: NEW_PATH }, error: null };
  });
}

describe("product image lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("links a replacement before deleting the prior owned image", async () => {
    const image = new Blob(["valid webp fixture"], { type: "image/webp" });

    await expect(uploadProductImage(PRODUCT_ID, image, OLD_URL)).resolves.toBe(NEW_URL);

    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: NEW_URL } }]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[1][1].body).toEqual({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: OLD_PATH,
    });
    expect(mocks.events.indexOf("database-update-confirmed")).toBeLessThan(
      mocks.events.indexOf("storage-delete"),
    );
  });

  it("does not delete an image belonging to a different tenant or product", async () => {
    await uploadProductImage(
      PRODUCT_ID,
      new Blob(["valid webp fixture"], { type: "image/webp" }),
      "https://storage.example.test/storage/v1/object/public/product-images/b0000000-0000-0000-0000-000000000099/" +
        PRODUCT_ID + "/" + OLD_OBJECT_ID + ".webp",
    );

    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: NEW_URL } }]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the new image linked and reports only the old-object cleanup failure", async () => {
    mocks.deleteResponse = { data: { deleted: false }, error: null };

    await expect(
      uploadProductImage(PRODUCT_ID, new Blob(["valid webp fixture"], { type: "image/webp" }), OLD_URL),
    ).rejects.toMatchObject({ name: "ProductImageCleanupError", imageLinked: true });

    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: NEW_URL } }]);
  });

  it("removes the database URL before requesting deletion of the validated object", async () => {
    await expect(removeProductImage(PRODUCT_ID, OLD_URL)).resolves.toBeUndefined();

    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: null } }]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: OLD_PATH,
    });
    expect(mocks.events.indexOf("database-update-confirmed")).toBeLessThan(
      mocks.events.indexOf("storage-delete"),
    );
  });

  it("clears a legacy or foreign URL without turning it into a storage-delete path", async () => {
    await expect(
      removeProductImage(PRODUCT_ID, "https://images.example.test/legacy/product.png"),
    ).resolves.toBeUndefined();

    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: null } }]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("reports a partial removal accurately if storage cleanup fails after the URL is cleared", async () => {
    mocks.deleteResponse = { data: null, error: new Error("provider error") };

    await expect(removeProductImage(PRODUCT_ID, OLD_URL)).rejects.toMatchObject({
      name: "ProductImageCleanupError",
      imageLinked: false,
    });
    expect(mocks.updates).toEqual([{ table: "products", payload: { image_url: null } }]);
  });

  it("cleans the newly uploaded object when the product URL write is not confirmed", async () => {
    mocks.updateResponse = { data: null, error: null };

    await expect(
      uploadProductImage(PRODUCT_ID, new Blob(["valid webp fixture"], { type: "image/webp" }), OLD_URL),
    ).rejects.toThrow("تعذر ربط صورة المنتج بالسجل");

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[1][1].body).toEqual({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: NEW_PATH,
    });
  });

  it("denies upload and removal for non-staff before any storage mutation", async () => {
    mocks.getCurrentTenantScope.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      warehouseId: "d0000000-0000-0000-0000-000000000001",
      isStaff: false,
    });

    await expect(
      uploadProductImage(PRODUCT_ID, new Blob(["valid webp fixture"], { type: "image/webp" }), OLD_URL),
    ).rejects.toThrow("صلاحية إدارة المنتجات مطلوبة");
    await expect(removeProductImage(PRODUCT_ID, OLD_URL)).rejects.toThrow("صلاحية إدارة المنتجات مطلوبة");

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the typed cleanup error contract instead of misreporting a failed link", () => {
    const error = new ProductImageCleanupError("cleanup pending", true);
    expect(error).toBeInstanceOf(Error);
    expect(error.imageLinked).toBe(true);
  });
});
