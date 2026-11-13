// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArchitectureRegistryPanel } from "./ArchitectureRegistryPanel";
import {
  buildArchitectureRegistry,
  getCurrentArchitectureRegistry,
} from "@/lib/reference-model/observability/architecture-registry";

describe("reference-model architecture registry", () => {
  it("preserves route nodes when generated route IDs repeat across route scopes", () => {
    const registry = getCurrentArchitectureRegistry();
    expect(registry.source).toBe("TANSTACK_ROUTER_FILE_TREE");
    expect(registry.routes.length).toBeGreaterThan(0);
    expect(registry.routes.some((route) => route.path === "/checkout")).toBe(true);
    expect(registry.routes.some((route) => route.path === "/admin/ai")).toBe(true);
    expect(registry.warnings).toContain("DUPLICATE_ROUTE_ID");
    expect(registry.routes.filter((route) => route.routeId === "/").length).toBeGreaterThan(1);
  });

  it("deduplicates the same object reference without dropping distinct routes", () => {
    const repeatedNode = { id: "/admin_/ai", path: "/admin/ai" };
    const registry = buildArchitectureRegistry({
      id: "__root__",
      path: "/",
      children: [repeatedNode, repeatedNode],
    });

    expect(registry.routes.filter((route) => route.routeId === "/admin_/ai")).toHaveLength(1);
    expect(registry.warnings).toContain("DUPLICATE_ROUTE_NODE");
  });

  it("classifies an API route supplied by the router tree", () => {
    const registry = buildArchitectureRegistry({
      id: "__root__",
      path: "/",
      children: [{ id: "/api/statement-pdf", path: "/api/statement-pdf" }],
    });

    const apiRoute = registry.routes.find((route) => route.routeId === "/api/statement-pdf");
    expect(apiRoute).toMatchObject({
      routeId: "/api/statement-pdf",
      path: "/api/statement-pdf",
      surface: "API",
    });
  });

  it("joins admin routes to the existing navigation groups instead of duplicating them", () => {
    const registry = getCurrentArchitectureRegistry();
    const aiRoute = registry.routes.find((route) => route.path === "/admin/ai");
    const categoryRoute = registry.routes.find((route) => route.path === "/admin/categories");

    expect(aiRoute).toMatchObject({
      surface: "ADMIN",
      viewId: "ai",
      navigationGroup: { id: "operations", label: "البيانات والتشغيل" },
      navigationAccess: { source: "ROLE_PAGE_ACCESS", roles: ["admin", "manager", "staff"] },
    });
    expect(categoryRoute).toMatchObject({
      surface: "ADMIN",
      viewId: "categories",
      navigationGroup: { id: "catalog", label: "الكتالوج والتسعير" },
    });
  });

  it("projects admin navigation roles from the existing role access matrix", () => {
    const registry = getCurrentArchitectureRegistry();
    const aiRoute = registry.routes.find((route) => route.path === "/admin/ai");
    const financeRoute = registry.routes.find((route) => route.path === "/admin/finance");
    const categoryRoute = registry.routes.find((route) => route.path === "/admin/categories");

    expect(aiRoute?.navigationAccess).toEqual({
      source: "ROLE_PAGE_ACCESS",
      roles: ["admin", "manager", "staff"],
    });
    expect(financeRoute?.navigationAccess).toEqual({
      source: "ROLE_PAGE_ACCESS",
      roles: ["admin", "manager", "accountant"],
    });
    expect(categoryRoute?.navigationAccess?.roles).not.toContain("customer");
    expect(categoryRoute?.navigationAccess?.roles).not.toContain("accountant");
  });

  it("does not invent navigation roles for an unmapped admin route", () => {
    const registry = buildArchitectureRegistry({
      id: "__root__",
      path: "/",
      children: [{ id: "/admin_/not-registered", path: "/admin/not-registered" }],
    });

    expect(registry.routes[0].navigationAccess).toBeNull();
    expect(registry.warnings).toContain("ADMIN_VIEW_NOT_MAPPED");
  });

  it("counts route parameters without treating them as live customer data", () => {
    const registry = getCurrentArchitectureRegistry();
    const productRoute = registry.routes.find((route) => route.path === "/product/$id");

    expect(productRoute?.dynamicSegmentCount).toBe(1);
    expect(productRoute?.surface).toBe("PUBLIC");
  });

  it("renders a read-only inventory and clearly states its evidence boundary", () => {
    render(<ArchitectureRegistryPanel />);

    expect(screen.getByRole("region", { name: "سجل معمارية التطبيق" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "المسارات المسجلة في TanStack Router" })).toBeInTheDocument();
    const aiRouteCell = screen.getByText("/admin/ai");
    const aiRouteRow = aiRouteCell.closest("tr");
    expect(aiRouteRow).not.toBeNull();
    if (!aiRouteRow) throw new Error("admin_ai_route_row_missing");
    expect(aiRouteRow).toHaveTextContent("البيانات والتشغيل");
    expect(aiRouteRow).toHaveTextContent("مدير النظام، مدير، موظف تشغيل");
    expect(screen.getByText(/لا تمثل إثباتاً لتفويض الخادم أو RLS/)).toBeInTheDocument();
  });
});
