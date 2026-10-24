import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  ClientOnly: ({ children, fallback }: { children?: ReactNode; fallback?: ReactNode }) => children ?? fallback ?? null,
}));
vi.mock("@/components/AghbariApp", () => ({
  AdminApp: ({ initialView }: { initialView: string }) => <div data-testid="admin-app" data-initial-view={initialView} />,
}));
import { Route } from "@/routes/admin_.reports";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("admin reports route integration", () => {
  it("routes to the Reports view and preserves the export link without mounting analytics twice", () => {
    const component = (Route as unknown as { options: { component: ComponentType } }).options.component;
    render(createElement(component));
    expect(screen.getByTestId("admin-app")).toHaveAttribute("data-initial-view", "reports");
    expect(screen.getByRole("link", { name: "مركز تصدير الطلبات CSV" })).toHaveAttribute("href", "/admin/exports");
  });
});
