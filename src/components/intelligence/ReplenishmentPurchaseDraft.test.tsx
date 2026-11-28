// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReplenishmentPurchaseDraft } from "./ReplenishmentPurchaseDraft";

const mocks = vi.hoisted(() => ({
  createPurchaseOrder: vi.fn(),
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchProducts: vi.fn(),
  fetchSuppliers: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createPurchaseOrder: mocks.createPurchaseOrder,
  fetchActiveInventoryWarehouses: mocks.fetchActiveInventoryWarehouses,
  fetchProducts: mocks.fetchProducts,
  fetchSuppliers: mocks.fetchSuppliers,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: ["manager"] } }),
}));

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_ID = "33333333-3333-4333-8333-333333333333";

const recommendation = {
  productRef: PRODUCT_ID,
  status: "VERIFIED" as const,
  action: "RECOMMEND" as const,
  quantityUnit: "كرتون",
  availableToPromise: 2,
  incomingPurchaseQuantity: 0,
  coveredAfterIncoming: 2,
  reorderPoint: 10,
  dailyDemand: 1,
  leadTimeDemand: 7,
  targetStock: 10,
  recommendedQuantity: 8,
  formulaId: "inventory.replenishment-target",
  formulaVersion: "1.2.0",
  evidenceIds: ["evidence-1"],
  warnings: [],
  automaticPurchase: false as const,
  demandSource: "HISTORICAL" as const,
  demandTrend: null,
  forecastLeadTimeDemand: null,
  forecastEvidenceIds: [],
  forecastMetricKeys: [],
  forecastFormulaVersions: [],
};

describe("ReplenishmentPurchaseDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSuppliers.mockResolvedValue([
      { id: SUPPLIER_ID, name: "مورد موثوق", supplier_code: "SUP-01", status: "active" },
    ]);
    mocks.fetchActiveInventoryWarehouses.mockResolvedValue([
      { id: WAREHOUSE_ID, name: "المخزن الرئيسي", code: "WH-01" },
    ]);
    mocks.fetchProducts.mockResolvedValue([
      { id: PRODUCT_ID, name: "سكر", item_code: "S-01", unit: "كرتون", status: "active" },
    ]);
    mocks.createPurchaseOrder.mockResolvedValue({
      purchase_order: { purchase_order_number: "PO-20261117-000001" },
      idempotent_replay: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reuses the exact draft key after ambiguous failures and changes it only when the payload changes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const randomUUID = vi.fn()
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
      .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    vi.stubGlobal("crypto", { randomUUID });

    mocks.createPurchaseOrder
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        purchase_order: { purchase_order_number: "PO-20261117-000001" },
        idempotent_replay: false,
      });

    const idempotencyKeys = new Map<string, string>();
    const firstRender = render(
      <ReplenishmentPurchaseDraft recommendations={[recommendation]} idempotencyKeys={idempotencyKeys} onClose={vi.fn()} />,
    );

    await screen.findByText("سكر");
    fireEvent.change(screen.getByLabelText("المورد"), { target: { value: SUPPLIER_ID } });
    fireEvent.change(screen.getByLabelText("المخزن المستلم"), { target: { value: WAREHOUSE_ID } });
    fireEvent.change(screen.getByLabelText("كمية سكر"), { target: { value: "8" } });

    const createButton = screen.getByRole("button", { name: "تأكيد وإنشاء مسودة أمر الشراء" });
    fireEvent.click(createButton);
    await waitFor(() => expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(1));
    await screen.findByText("network timeout");
    await waitFor(() => expect(createButton).toBeEnabled());
    const firstRequest = mocks.createPurchaseOrder.mock.calls[0][0];
    expect(firstRequest.idempotencyKey).toBe("replenishment-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa");
    expect(firstRequest.notes).toContain("inventory.replenishment-target@1.2.0");
    expect(firstRequest.notes).toContain("SKU=" + PRODUCT_ID);
    expect(firstRequest.notes).toContain("evidence=evidence-1");

    // Closing the modal unmounts this form. The parent workspace retains the
    // shared key map, so reopening the exact same draft must replay the same request.
    firstRender.unmount();
    const secondRender = render(
      <ReplenishmentPurchaseDraft recommendations={[recommendation]} idempotencyKeys={idempotencyKeys} onClose={vi.fn()} />,
    );
    await screen.findByText("سكر");
    fireEvent.change(screen.getByLabelText("المورد"), { target: { value: SUPPLIER_ID } });
    fireEvent.change(screen.getByLabelText("المخزن المستلم"), { target: { value: WAREHOUSE_ID } });
    fireEvent.change(screen.getByLabelText("كمية سكر"), { target: { value: "8" } });

    const reopenedCreateButton = screen.getByRole("button", { name: "تأكيد وإنشاء مسودة أمر الشراء" });
    fireEvent.click(reopenedCreateButton);
    await waitFor(() => expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(2));
    const retryRequest = mocks.createPurchaseOrder.mock.calls[1][0];
    expect(retryRequest.idempotencyKey).toBe(firstRequest.idempotencyKey);
    await waitFor(() => expect(reopenedCreateButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText("كمية سكر"), { target: { value: "9" } });
    fireEvent.click(reopenedCreateButton);
    await waitFor(() => expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(3));
    const editedRequest = mocks.createPurchaseOrder.mock.calls[2][0];
    expect(editedRequest.idempotencyKey).toBe("replenishment-bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb");
    expect(editedRequest.idempotencyKey).not.toBe(firstRequest.idempotencyKey);
    expect(editedRequest.lines).toEqual([{ product_id: PRODUCT_ID, quantity: 9, unit_cost: null }]);

    expect(await screen.findByText("مسودة أمر الشراء: PO-20261117-000001")).toBeInTheDocument();
    expect(randomUUID).toHaveBeenCalledTimes(2);

    // A confirmed success resolves that key. A later intentional, identical order
    // is a new command and must receive a fresh idempotency key.
    secondRender.unmount();
    render(
      <ReplenishmentPurchaseDraft recommendations={[recommendation]} idempotencyKeys={idempotencyKeys} onClose={vi.fn()} />,
    );
    await screen.findByText("سكر");
    fireEvent.change(screen.getByLabelText("المورد"), { target: { value: SUPPLIER_ID } });
    fireEvent.change(screen.getByLabelText("المخزن المستلم"), { target: { value: WAREHOUSE_ID } });
    fireEvent.change(screen.getByLabelText("كمية سكر"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد وإنشاء مسودة أمر الشراء" }));
    await waitFor(() => expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(4));
    const nextIntent = mocks.createPurchaseOrder.mock.calls[3][0];
    expect(nextIntent.idempotencyKey).toBe("replenishment-cccccccccccc4ccc8ccccccccccccccc");
    expect(nextIntent.idempotencyKey).not.toBe(editedRequest.idempotencyKey);
    expect(randomUUID).toHaveBeenCalledTimes(3);
  });

  it("persists forecast calculation and evidence provenance in the purchase-order draft", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("crypto", { randomUUID: () => "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    const forecastRecommendation = {
      ...recommendation,
      demandSource: "FORECAST" as const,
      demandTrend: "INCREASING" as const,
      dailyDemand: 4,
      leadTimeDemand: 24,
      recommendedQuantity: 24,
      forecastLeadTimeDemand: { horizonDays: 30 as const, lowQuantity: 18, expectedQuantity: 24, highQuantity: 36 },
      forecastEvidenceIds: ["forecast-current", "forecast-baseline"],
      forecastMetricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
      forecastFormulaVersions: ["demand.quantity@1.0.0", "demand.sample@1.0.0"],
      evidenceIds: ["inventory-evidence", "forecast-current", "forecast-baseline"],
    };
    render(
      <ReplenishmentPurchaseDraft
        recommendations={[forecastRecommendation]}
        idempotencyKeys={new Map()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText("سكر");
    fireEvent.change(screen.getByLabelText("المورد"), { target: { value: SUPPLIER_ID } });
    fireEvent.change(screen.getByLabelText("المخزن المستلم"), { target: { value: WAREHOUSE_ID } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد وإنشاء مسودة أمر الشراء" }));
    await waitFor(() => expect(mocks.createPurchaseOrder).toHaveBeenCalledTimes(1));
    const request = mocks.createPurchaseOrder.mock.calls[0][0];
    expect(request.notes).toContain("inventory.replenishment-target@1.2.0");
    expect(request.notes).toContain("توقعات مستخدمة فعلياً: 1 من 1 بنداً");
    expect(request.notes).toContain("lead=24 كرتون");
    expect(request.notes).toContain("range=18-36");
    expect(request.notes).toContain("forecastEvidence=forecast-current|forecast-baseline");
    expect(request.notes).toContain("demand.quantity@1.0.0");
    expect(request.lines).toEqual([{ product_id: PRODUCT_ID, quantity: 24, unit_cost: null }]);
  });

  it("fails closed when a secure idempotency key cannot be generated", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("crypto", {
      randomUUID: () => { throw new Error("secure random source failed"); },
    });
    render(
      <ReplenishmentPurchaseDraft recommendations={[recommendation]} idempotencyKeys={new Map()} onClose={vi.fn()} />,
    );

    await screen.findByText("سكر");
    fireEvent.change(screen.getByLabelText("المورد"), { target: { value: SUPPLIER_ID } });
    fireEvent.change(screen.getByLabelText("المخزن المستلم"), { target: { value: WAREHOUSE_ID } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد وإنشاء مسودة أمر الشراء" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/تعذر إنشاء مفتاح آمن لمنع تكرار مسودة الشراء/);
    expect(mocks.createPurchaseOrder).not.toHaveBeenCalled();
  });
});
