import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArchitectureRegistryPanel } from "./ArchitectureRegistryPanel";
import { getCurrentArchitectureRegistry } from "@/lib/reference-model/observability/architecture-registry";

describe("reference-model architecture registry", () => {
  it("derives the inventory from the current router tree without duplicate route IDs", () => {
    const registry = getCurrentArchitectureRegistry();
    const ids = registry.routes.map((route) => route.routeId);

    expect(registry.source).toBe("TANSTACK_ROUTER_FILE_TREE");
    expect(registry.routes.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(registry.routes.some((route) => route.path === "/checkout")).toBe(true);
    expect(registry.routes.some((route) => route.path === "/admin/ai")).toBe(true);
    expect(registry.routes.some((route) => route.path === "/api/statement-pdf")).toBe(true);
  });

  it("joins admin routes to the existing navigation groups instead of duplicating them", () => {
    const registry = getCurrentArchitectureRegistry();
    const aiRoute = registry.routes.find((route) => route.path === "/admin/ai");
    const categoryRoute = registry.routes.find((route) => route.path === "/admin/categories");

    expect(aiRoute).toMatchObject({
      surface: "ADMIN",
      viewId: "ai",
      navigationGroup: { id: "operations", label: "البيانات والتشغيل" },
    });
    expect(categoryRoute).toMatchObject({
      surface: "ADMIN",
      viewId: "categories",
      navigationGroup: { id: "catalog", label: "الكتالوج والتسعير" },
    });
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
    expect(screen.getByText("/admin/ai")).toBeInTheDocument();
    expect(screen.getByText("البيانات والتشغيل")).toBeInTheDocument();
    expect(screen.getByText(/لا يثبت نشرها أو إتاحتها للمستخدم/)).toBeInTheDocument();
  });
});
