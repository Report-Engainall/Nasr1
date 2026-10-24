import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

function makeRouter() {
  return createRouter({ routeTree, context: { queryClient: new QueryClient() } });
}

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const matches = makeRouter().matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  // /admin/exports is an explicitly tracked P1 route-tree generator handoff;
  // do not hand-edit routeTree.gen.ts or hide that known missing registration.
  it.each([
    "/addresses",
    "/cart",
    "/catalog",
    "/categories",
    "/category/route-smoke-test-category",
    "/category/route-smoke-test-category/subcategory/route-smoke-test-subcategory",
    "/checkout",
    "/collections",
    "/compare",
    "/company/accept-invitation",
    "/company/contacts",
    "/company/members",
    "/customer/activate/route-smoke-test-token",
    "/forgot-password",
    "/invite/route-smoke-test-token",
    "/login",
    "/offers",
    "/product/route-smoke-test-product",
    "/products",
    "/register",
    "/reset-password",
    "/search",
    "/search/advanced",
    "/store",
    "/wishlist",
    "/assistant",
    "/barcode",
    "/invoices",
    "/statement",
    "/quotes",
    "/reorder",
    "/offline",
    "/admin",
    "/admin/ai",
    "/admin/audit",
    "/admin/customers",
    "/admin/data",
    "/admin/devices",
    "/admin/finance",
    "/admin/inventory-transfers",
    "/admin/notifications",
    "/admin/offers",
    "/admin/operations",
    "/admin/orders",
    "/admin/pricing",
    "/admin/products",
    "/admin/purchase-orders",
    "/admin/quotes",
    "/admin/reports",
    "/admin/settings",
    "/admin/suppliers",
    "/admin/stock-count",
    "/admin/tasks",
    "/orders",
    "/orders/route-smoke-test",
  ])("registers the route %s", (path) => {
    const matches = makeRouter().matchRoutes(path as never);
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
