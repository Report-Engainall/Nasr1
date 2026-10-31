import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Supplier } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  fetchSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  useFetch: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchSuppliers: mocks.fetchSuppliers,
    createSupplier: mocks.createSupplier,
  };
});
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));

import { Suppliers } from "@/components/AdminPages";

const supplier: Supplier = {
  id: "supplier-001",
  organization_id: "org-001",
  name: "مورد الاختبار",
  supplier_code: "SUP-00001",
  contact_name: "مسؤول المبيعات",
  phone: "+967700000000",
  email: "supplier@example.test",
  status: "active",
};

function state(data: Supplier[] | null, opts: { loading?: boolean; error?: string | null } = {}) {
  mocks.useFetch.mockReturnValue({
    data,
    loading: opts.loading ?? false,
    error: opts.error ?? null,
    refetch: mocks.refetch,
  });
}

describe("admin suppliers live screen acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refetch.mockResolvedValue(undefined);
    mocks.createSupplier.mockResolvedValue(supplier);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not present an unknown supplier count as zero while loading or after failure", () => {
    state(null, { loading: true });
    const { rerender } = render(<Suppliers onNotice={vi.fn()} />);
    expect(screen.getByText("عدد الموردين غير متاح")).toBeInTheDocument();
    expect(screen.getByText("جار تحميل البيانات...")).toBeInTheDocument();
    expect(screen.queryByText(/0 مورد/)).not.toBeInTheDocument();

    state(null, { error: "تعذر الوصول إلى الخدمة" });
    rerender(<Suppliers onNotice={vi.fn()} />);
    expect(screen.getByText(/تعذر تحميل البيانات\. تعذر الوصول إلى الخدمة/)).toBeInTheDocument();
    expect(screen.getByText("عدد الموردين غير متاح")).toBeInTheDocument();
    expect(screen.queryByText(/0 مورد/)).not.toBeInTheDocument();
  });

  it("renders a true empty state and shows current supplier details after a successful fetch", () => {
    state([]);
    const { rerender } = render(<Suppliers onNotice={vi.fn()} />);
    expect(screen.getByText("لا يوجد موردون مسجلون حتى الآن.")).toBeInTheDocument();
    expect(screen.getByText("0 مورد")).toBeInTheDocument();

    state([supplier]);
    rerender(<Suppliers onNotice={vi.fn()} />);
    expect(screen.getByText("مورد الاختبار")).toBeInTheDocument();
    expect(screen.getByText("SUP-00001")).toBeInTheDocument();
    expect(screen.getByText("مسؤول المبيعات")).toBeInTheDocument();
  });

  it("filters the supplier list by search fields and active state", () => {
    const inactiveSupplier: Supplier = {
      ...supplier,
      id: "supplier-002",
      name: "مورد آخر",
      supplier_code: "SUP-00002",
      contact_name: "جهة ثانية",
      status: "inactive",
    };
    state([supplier, inactiveSupplier]);
    render(<Suppliers onNotice={vi.fn()} />);

    const search = screen.getByRole("searchbox", { name: "البحث في دليل الموردين" });
    fireEvent.change(search, { target: { value: "SUP-00001" } });
    expect(screen.getByText("مورد الاختبار")).toBeInTheDocument();
    expect(screen.queryByText("مورد آخر")).not.toBeInTheDocument();
    expect(screen.getByText("عرض 1 من 2 مورد")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "غير نشط" }));
    expect(screen.getByText("مورد آخر")).toBeInTheDocument();
    expect(screen.queryByText("مورد الاختبار")).not.toBeInTheDocument();
  });

  it("normalizes supplier fields, blocks duplicate saves and reports API failures", async () => {
    state([]);
    let release: ((value: Supplier) => void) | undefined;
    mocks.createSupplier.mockImplementationOnce(() => new Promise<Supplier>((resolve) => { release = resolve; }));
    const onNotice = vi.fn();
    render(<Suppliers onNotice={onNotice} />);
    fireEvent.click(screen.getByRole("button", { name: "إضافة مورد" }));
    fireEvent.change(screen.getByLabelText("اسم المورد"), { target: { value: "  مورد جديد  " } });
    fireEvent.change(screen.getByLabelText("جهة الاتصال"), { target: { value: "  مسؤول  " } });
    fireEvent.change(screen.getByLabelText("الهاتف"), { target: { value: "  +967700000000  " } });
    const save = screen.getByRole("button", { name: "حفظ" });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.createSupplier).toHaveBeenCalledTimes(1));
    expect(mocks.createSupplier).toHaveBeenCalledWith(expect.objectContaining({
      name: "مورد جديد",
      contact_name: "مسؤول",
      phone: "+967700000000",
      status: "active",
    }));
    expect(screen.getByRole("button", { name: "جارٍ الحفظ..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "جارٍ الحفظ..." }));
    expect(mocks.createSupplier).toHaveBeenCalledTimes(1);
    release?.(supplier);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("تمت إضافة المورد"));

    state([]);
    fireEvent.click(screen.getByRole("button", { name: "إضافة مورد" }));
    fireEvent.change(screen.getByLabelText("اسم المورد"), { target: { value: "مورد فاشل" } });
    mocks.createSupplier.mockRejectedValueOnce(new Error("database temporarily unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("database temporarily unavailable"));
  });
});
