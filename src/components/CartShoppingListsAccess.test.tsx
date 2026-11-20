// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={to} {...props}>{children}</a>,
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("cart shopping-list summary synchronization", () => {
  it("refreshes category groups and quantities only after a confirmed server-cart sync event", async () => {
    fetchCustomerCartMock
      .mockResolvedValueOnce({ items: [{ product_id: productId, quantity: 2 }], updated_at: "2026-11-20T01:00:00Z" })
      .mockResolvedValueOnce({ items: [{ product_id: productId, quantity: 6 }], updated_at: "2026-11-20T01:01:00Z" });
    fetchProductDetailsMock.mockResolvedValue([product]);
    fetchCategoriesMock.mockResolvedValue([]);

    render(<CartShoppingListsAccess />);

    const number = (value: number) => new Intl.NumberFormat("ar-YE").format(value);
    expect(await screen.findByText(`${number(2)} كيس`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${number(2)}\\s+مجموع كميات البنود`))).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(CUSTOMER_CART_SYNCED_EVENT));
    });

    await waitFor(() => expect(fetchCustomerCartMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(`${number(6)} كيس`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${number(6)}\\s+مجموع كميات البنود`))).toBeInTheDocument();
  });
});
