import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { roles: ["admin"] as string[] },
  getScope: vi.fn(),
  from: vi.fn(),
  responses: [] as Array<{ data: unknown[]; count: number | null; error: unknown }>,
  requests: [] as Array<{
    table: string;
    columns?: string;
    options?: unknown;
    filters: Array<{ column: string; value: unknown }>;
    orderBy?: string;
    range?: [number, number];
  }>,
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: mocks.getScope,
  supabase: { from: mocks.from },
}));
vi.mock("@/components/AdminPages", () => ({
  AdminPage: ({ title, note, toolbar, children }: { title: string; note?: string; toolbar?: ReactNode; children: ReactNode }) => (
    <main><h1>{title}</h1>{note && <p>{note}</p>}{toolbar}{children}</main>
  ),
  Button: ({ children, onClick, disabled, variant }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) => (
    <button type="button" data-variant={variant} disabled={disabled} onClick={onClick}>{children}</button>
  ),
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  ErrorBox: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  Loading: () => <p role="status">جارٍ التحميل...</p>,
  TableWrap: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { AdminAuditLog } from "@/components/AdminAuditLog";

function makeAuditRow(entityPrefix: string, id: string, action = "customer_address.created") {
  return {
    id,
    actor_id: "99999999-9999-4999-8999-999999999999",
    action,
    entity_type: "customer",
    entity_id: entityPrefix + "-entity-identifier",
    created_at: "2026-10-23T05:00:00.000Z",
  };
}

function makeQuery(table: string) {
  const response = mocks.responses.shift() ?? { data: [], count: 0, error: null };
  const request = {
    table,
    columns: undefined as string | undefined,
    options: undefined as unknown,
    filters: [] as Array<{ column: string; value: unknown }>,
    orderBy: undefined as string | undefined,
    range: undefined as [number, number] | undefined,
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
    order(column: string) {
      request.orderBy = column;
      return query;
    },
    range(from: number, to: number) {
      request.range = [from, to];
      return query;
    },
    then<TResult1 = typeof response, TResult2 = never>(
      onfulfilled?: ((value: typeof response) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(response).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return query;
}

describe("admin audit log pagination", () => {
  beforeEach(() => {
    mocks.user = { roles: ["admin"] };
    mocks.getScope.mockReset().mockResolvedValue({
      profileId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      warehouseId: null,
      isStaff: true,
    });
    mocks.from.mockReset().mockImplementation((table: string) => makeQuery(table));
    mocks.responses = [
      { data: [makeAuditRow("aaaaaaaa", "audit-page-1", "catalog.category_renamed")], count: 450, error: null },
      { data: [makeAuditRow("bbbbbbbb", "audit-page-2")], count: 450, error: null },
    ];
    mocks.requests = [];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads tenant-scoped history in pages and exposes older audit events", async () => {
    render(<AdminAuditLog />);

    expect(await screen.findByText("aaaaaaaa")).toBeInTheDocument();
    expect(screen.getByText("إعادة تسمية تصنيف")).toBeInTheDocument();
    expect(screen.getByText(/إجمالي السجلات في المؤسسة: ٤٥٠/)).toBeInTheDocument();
    expect(mocks.requests[0].range).toEqual([0, 199]);
    expect(mocks.requests[0].options).toEqual({ count: "exact" });
    expect(mocks.requests[0].filters).toContainEqual({
      column: "organization_id",
      value: "22222222-2222-4222-8222-222222222222",
    });

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(await screen.findByText("bbbbbbbb")).toBeInTheDocument();
    expect(screen.getByLabelText("صفحة سجل التدقيق")).toHaveTextContent("صفحة 2 من 3");
    expect(mocks.requests[1].range).toEqual([200, 399]);
    expect(mocks.requests[1].filters).toContainEqual({
      column: "organization_id",
      value: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("fails visibly instead of treating an unconfirmed total as zero", async () => {
    mocks.responses = [{ data: [], count: null, error: null }];
    render(<AdminAuditLog />);

    expect(await screen.findByRole("alert")).toHaveTextContent("لم يؤكد الخادم العدد الإجمالي لسجل التدقيق.");
    expect(screen.queryByText(/إجمالي السجلات في المؤسسة: ٠/)).not.toBeInTheDocument();
  });

  it("blocks non-admin roles before querying the audit log", async () => {
    mocks.user = { roles: ["customer"] };
    render(<AdminAuditLog />);

    expect(await screen.findByRole("alert")).toHaveTextContent("الصلاحية غير متاحة");
    expect(screen.getByText("تقتصر قراءة سجل التدقيق على مدير المؤسسة ومدير النظام، ويفرض الخادم النطاق نفسه بواسطة RLS.")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
