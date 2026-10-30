import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};
type QueryResponse = {
  data: AuditRow[] | null;
  count: number | null;
  error: { message: string } | null;
};
type RequestRecord = {
  table: string;
  columns?: string;
  options?: unknown;
  filters: Array<{ column: string; value: unknown }>;
  orderCalls: Array<{ column: string; options?: unknown }>;
  range?: [number, number];
};

const mocks = vi.hoisted(() => ({
  user: { roles: ["manager"] as string[] },
  getScope: vi.fn(),
  from: vi.fn(),
  responses: [] as QueryResponse[],
  requests: [] as RequestRecord[],
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    ClientOnly: ({ children, fallback }: { children?: ReactNode; fallback?: ReactNode }) =>
      children ?? fallback ?? null,
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: mocks.getScope,
  supabase: { from: mocks.from },
}));

vi.mock("@/components/AdminPages", () => ({
  AdminPage: ({ title, note, toolbar, children }: {
    title: string;
    note?: string;
    toolbar?: ReactNode;
    children: ReactNode;
  }) => (
    <main dir="rtl">
      <h1>{title}</h1>
      {note ? <p>{note}</p> : null}
      <div>{toolbar}</div>
      {children}
    </main>
  ),
  Button: ({ children, onClick, disabled }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>{children}</button>
  ),
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  ErrorBox: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  Loading: () => <p role="status">جارٍ التحميل...</p>,
  TableWrap: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/AghbariApp", async () => {
  const { AdminAuditLog } = await import("@/components/AdminAuditLog");
  return { AdminApp: () => <AdminAuditLog /> };
});

import { Route as AdminAuditFileRoute } from "@/routes/admin_.audit";

const organizationId = "22222222-2222-4222-8222-222222222222";
const actorId = "99999999-9999-4999-8999-999999999999";

function makeRow(id = "audit-route-1", action = "catalog.category_renamed"): AuditRow {
  return {
    id,
    actor_id: actorId,
    action,
    entity_type: "catalog_category",
    entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    created_at: "2026-10-30T01:00:00.000Z",
  };
}

function makeQuery(table: string, response: QueryResponse) {
  const request: RequestRecord = {
    table,
    filters: [],
    orderCalls: [],
  };
  mocks.requests.push(request);
  const query = {
    select(columns: string, options?: unknown) {
      request.columns = columns;
      request.options = options;
      return query;
    },
    eq(column: string, value: unknown) {
      request.filters.push({ column, value });
      return query;
    },
    order(column: string, options?: unknown) {
      request.orderCalls.push({ column, options });
      return query;
    },
    range(from: number, to: number) {
      request.range = [from, to];
      return Promise.resolve(response);
    },
  };
  return query;
}

type RouteWithComponent = { options: { component: ComponentType } };
const auditRouteComponent = (AdminAuditFileRoute as unknown as RouteWithComponent).options.component;

async function mountAuditDeepLink(role: string[] = ["manager"]) {
  mocks.user = { roles: role };
  const root = createRootRouteWithContext<Record<string, never>>()({ component: () => <Outlet /> });
  const audit = createRoute({
    getParentRoute: () => root,
    path: "/admin/audit",
    component: auditRouteComponent,
  });
  const router = createRouter({
    routeTree: root.addChildren([audit]),
    history: createMemoryHistory({ initialEntries: ["/admin/audit"] }),
    context: {},
  });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  expect(router.state.location.pathname).toBe("/admin/audit");
  return { router, ...view };
}

describe("admin audit actual deep route acceptance", () => {
  beforeEach(() => {
    mocks.user = { roles: ["manager"] };
    mocks.getScope.mockReset().mockResolvedValue({
      profileId: "11111111-1111-4111-8111-111111111111",
      organizationId,
      warehouseId: null,
      isStaff: true,
    });
    mocks.from.mockReset().mockImplementation((table: string) => {
      const response = mocks.responses.shift() ?? { data: [], count: 0, error: null };
      return makeQuery(table, response);
    });
    mocks.responses = [];
    mocks.requests = [];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens the real audit screen from a direct URL and renders a tenant-scoped event", async () => {
    mocks.responses = [{ data: [makeRow()], count: 1, error: null }];

    await mountAuditDeepLink(["manager"]);

    expect(await screen.findByRole("heading", { name: "سجل التدقيق" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "إعادة تسمية تصنيف" })).toBeInTheDocument();
    const filterPanel = screen.getByRole("main").querySelector(".panel.no-print");
    expect(filterPanel).not.toBeNull();
    expect((filterPanel as HTMLElement).style.gridTemplateColumns).toBe(
      "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    );
    expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    expect(mocks.from).toHaveBeenCalledWith("audit_logs");
    expect(mocks.requests[0].filters).toContainEqual({
      column: "organization_id",
      value: organizationId,
    });
    expect(mocks.requests[0].range).toEqual([0, 199]);
    expect(mocks.requests[0].orderCalls).toEqual([
      { column: "created_at", options: { ascending: false } },
      { column: "id", options: { ascending: false } },
    ]);
  });

  it("denies an ordinary staff direct deep link before querying any audit rows", async () => {
    await mountAuditDeepLink(["staff"]);

    expect(await screen.findByRole("heading", { name: "سجل التدقيق" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("الصلاحية غير متاحة");
    expect(screen.getByText(/تقتصر قراءة سجل التدقيق/)).toBeInTheDocument();
    expect(mocks.getScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("shows the confirmed empty state only after a successful zero-count response", async () => {
    mocks.responses = [{ data: [], count: 0, error: null }];

    await mountAuditDeepLink(["admin"]);

    expect(await screen.findByText("لا توجد سجلات مطابقة للفلاتر الحالية.")).toBeInTheDocument();
    expect(screen.getByText(/إجمالي السجلات في المؤسسة: ٠/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("moves between bounded organization-scoped audit pages through the real pager", async () => {
    mocks.responses = [
      { data: [makeRow("audit-page-1")], count: 401, error: null },
      { data: [makeRow("audit-page-2", "customer_address.created")], count: 401, error: null },
      { data: [makeRow("audit-page-1-return")], count: 401, error: null },
    ];

    await mountAuditDeepLink(["manager"]);

    expect(await screen.findByRole("cell", { name: "إعادة تسمية تصنيف" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "صفحة سجل التدقيق" })).toHaveTextContent("صفحة 1 من 3");

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));

    expect(await screen.findByRole("cell", { name: "إضافة عنوان عميل" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "صفحة سجل التدقيق" })).toHaveTextContent("صفحة 2 من 3");

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));

    expect(await screen.findByRole("cell", { name: "إعادة تسمية تصنيف" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "صفحة سجل التدقيق" })).toHaveTextContent("صفحة 1 من 3");
    expect(mocks.requests.map((request) => request.range)).toEqual([
      [0, 199],
      [200, 399],
      [0, 199],
    ]);
    expect(mocks.requests).toHaveLength(3);
    for (const request of mocks.requests) {
      expect(request.filters).toContainEqual({
        column: "organization_id",
        value: organizationId,
      });
    }
  });

  it("exposes a route-level read error and retries into the real audit result", async () => {
    mocks.responses = [
      { data: null, count: null, error: { message: "audit route read unavailable" } },
      { data: [makeRow("audit-retry-1", "customer_address.created")], count: 1, error: null },
    ];

    await mountAuditDeepLink(["manager"]);

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل سجل التدقيق.");
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));

    expect(await screen.findByRole("cell", { name: "إضافة عنوان عميل" })).toBeInTheDocument();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});
