// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartShoppingListsAccess } from "./CartShoppingListsAccess";
import { CUSTOMER_CART_SYNCED_EVENT } from "@/lib/customer-cart";

const { fetchCustomerCartMock, fetchProductDetailsMock, fetchCategoriesMock } = vi.hoisted(() => ({
  fetchCustomerCartMock: vi.fn(),
  fetchProductDetailsMock: vi.fn(),
  fetchCategoriesMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "auth-user-cart-summary",
      profileId: "customer-profile-cart-summary",
      isStaff: false,
      roles: ["customer"],
    },
    ready: true,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(async () => undefined),
}));

vi.mock("@/lib/api", () => ({ fetchCategories: fetchCategoriesMock }));
vi.mock("@/lib/customer-cart", () => ({
  CUSTOMER_CART_SYNCED_EVENT: "aghbari:customer-cart-synced",
  fetchCustomerCart: fetchCustomerCartMock,
}));
vi.mock("@/lib/storefront-cart-products", () => ({
  fetchStorefrontCartProductDetails: fetchProductDetailsMock,
}));
vi.mock("@/lib/customer-shopping-lists", () => ({
  saveCustomerShoppingList: vi.fn(),
}));
vi.mock("@/lib/offline-cart", () => ({
  loadOfflineCartDraft: vi.fn(() => []),
  offlineCartStorageKey: vi.fn(() => "offline-cart"),
}));

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const product = {
  id: productId,
  name: "أرز بسمتي",
  item_code: "RICE-01",
  unit: "كيس",
  category_id: null,
  status: "active",
};

function localized(value: number): string {
  return new Intl.NumberFormat("ar-YE").format(value);
}

function snapshot(quantity: number) {
  return {
    items: [{ product_id: productId, quantity }],
    updated_at: "2026-11-20T01:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("cart shopping-list summary synchronization", () => {
  it("refreshes category groups and quantities only after a confirmed server-cart sync event", async () => {
    fetchCustomerCartMock
      .mockResolvedValueOnce(snapshot(2))
      .mockResolvedValueOnce(snapshot(6));
    fetchProductDetailsMock.mockResolvedValue([product]);
    fetchCategoriesMock.mockResolvedValue([]);

    render(<CartShoppingListsAccess />);

    expect(await screen.findByText(`${localized(2)} كيس`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${localized(2)}\\s+مجموع كميات البنود`))).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(CUSTOMER_CART_SYNCED_EVENT));
    });

    await waitFor(() => expect(fetchCustomerCartMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(`${localized(6)} كيس`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${localized(6)}\\s+مجموع كميات البنود`))).toBeInTheDocument();
  });

  it("does not let an older in-flight refresh overwrite a newer confirmed snapshot", async () => {
    const older = deferred<ReturnType<typeof snapshot>>();
    const newer = deferred<ReturnType<typeof snapshot>>();
    fetchCustomerCartMock
      .mockResolvedValueOnce(snapshot(2))
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    fetchProductDetailsMock.mockResolvedValue([product]);
    fetchCategoriesMock.mockResolvedValue([]);

    render(<CartShoppingListsAccess />);
    expect(await screen.findByText(`${localized(2)} كيس`)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(CUSTOMER_CART_SYNCED_EVENT));
      window.dispatchEvent(new Event(CUSTOMER_CART_SYNCED_EVENT));
    });
    await waitFor(() => expect(fetchCustomerCartMock).toHaveBeenCalledTimes(3));

    await act(async () => { newer.resolve(snapshot(6)); });
    expect(await screen.findByText(`${localized(6)} كيس`)).toBeInTheDocument();

    await act(async () => { older.resolve(snapshot(4)); });
    await waitFor(() => expect(screen.getByText(`${localized(6)} كيس`)).toBeInTheDocument());
    expect(screen.queryByText(`${localized(4)} كيس`)).not.toBeInTheDocument();
  });
});
