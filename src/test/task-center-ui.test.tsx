import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { OperationalTask } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchOperationalTasks: vi.fn(),
  fetchOperationalTaskAssignees: vi.fn(),
  refreshOperationalTasks: vi.fn(),
  createOperationalTask: vi.fn(),
  setOperationalTaskStatus: vi.fn(),
  assignOperationalTask: vi.fn(),
  updateOperationalTaskDetails: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/api", () => ({
  fetchOperationalTasks: mocks.fetchOperationalTasks,
  fetchOperationalTaskAssignees: mocks.fetchOperationalTaskAssignees,
  refreshOperationalTasks: mocks.refreshOperationalTasks,
  createOperationalTask: mocks.createOperationalTask,
  setOperationalTaskStatus: mocks.setOperationalTaskStatus,
  assignOperationalTask: mocks.assignOperationalTask,
  updateOperationalTaskDetails: mocks.updateOperationalTaskDetails,
}));
vi.mock("@/components/CustomerReturnReviewQueue", () => ({
  CustomerReturnReviewQueue: () => <div data-testid="return-review-queue" />,
}));
vi.mock("@/components/CustomerReturnReceiptQueue", () => ({
  CustomerReturnReceiptQueue: () => <div data-testid="return-receipt-queue" />,
}));
vi.mock("@/components/CustomerReturnCreditMemoQueue", () => ({
  CustomerReturnCreditMemoQueue: () => <div data-testid="return-credit-queue" />,
}));

import { TaskCenter } from "@/components/TaskCenter";

function task(overrides: Partial<OperationalTask> & Pick<OperationalTask, "id" | "title" | "task_role">): OperationalTask {
  return {
    id: overrides.id,
    organization_id: "org-test",
    title: overrides.title,
    description: null,
    task_type: "operational",
    priority: "medium",
    status: "pending",
    assigned_to: null,
    created_at: "2026-10-21T10:00:00.000Z",
    completed_at: null,
    task_role: overrides.task_role,
    source_event_key: null,
    source_entity_type: "orders",
    source_entity_id: overrides.id,
    due_at: null,
    created_by: "profile-manager",
    completed_by: null,
    resolution_note: null,
    task_payload: {},
    updated_at: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}

const rows = [
  task({ id: "sales-order", title: "طلب عميل للتجهيز", task_role: "sales" }),
  task({ id: "finance-ledger", title: "مراجعة قيد محاسبي خاص", task_role: "accountant", source_entity_type: "customer_invoices" }),
  task({ id: "warehouse-count", title: "حركة جرد المخزن", task_role: "warehouse", source_entity_type: "inventory_balances" }),
];

function setUser(roles: string[]) {
  mocks.useAuth.mockReturnValue({
    ready: true,
    loading: false,
    user: {
      id: "auth-user",
      profileId: "profile-current",
      email: "staff@example.test",
      name: "موظف اختبار",
      roles,
      isStaff: true,
    },
  });
}

let originalPrint: PropertyDescriptor | undefined;
let printMock: ReturnType<typeof vi.fn>;

describe("TaskCenter role-boundary and print integration", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.fetchOperationalTasks.mockReset().mockResolvedValue(rows);
    mocks.fetchOperationalTaskAssignees.mockReset().mockResolvedValue([]);
    mocks.refreshOperationalTasks.mockReset().mockResolvedValue({
      organization_id: "org-test",
      source_records_refreshed: 0,
      refreshed_at: "2026-10-21T10:00:00.000Z",
    });
    mocks.createOperationalTask.mockReset().mockResolvedValue("new-task");
    mocks.setOperationalTaskStatus.mockReset().mockResolvedValue(undefined);
    mocks.assignOperationalTask.mockReset().mockResolvedValue(undefined);
    mocks.updateOperationalTaskDetails.mockReset().mockResolvedValue(undefined);
    originalPrint = Object.getOwnPropertyDescriptor(window, "print");
    printMock = vi.fn();
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: printMock });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalPrint) Object.defineProperty(window, "print", originalPrint);
    else Reflect.deleteProperty(window, "print");
  });

  it("shows warehouse receipt work to staff while keeping return approval management-only", async () => {
    setUser(["staff"]);
    const { unmount } = render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });
    expect(screen.getByTestId("return-receipt-queue")).toBeInTheDocument();
    expect(screen.queryByTestId("return-review-queue")).not.toBeInTheDocument();
    unmount();

    setUser(["manager"]);
    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });
    expect(screen.getByTestId("return-review-queue")).toBeInTheDocument();
    expect(screen.getByTestId("return-receipt-queue")).toBeInTheDocument();
  });

  it("hides task roles outside a staff member's permission set from both the screen and print output", async () => {
    setUser(["staff"]);
    render(<TaskCenter onNotice={vi.fn()} />);

    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });
    expect(screen.getByRole("heading", { name: "حركة جرد المخزن" })).toBeInTheDocument();
    expect(screen.queryByText("مراجعة قيد محاسبي خاص")).not.toBeInTheDocument();

    const printRoot = document.querySelector(".operational-task-print");
    expect(printRoot).not.toBeNull();
    expect(printRoot).toHaveTextContent("طلب عميل للتجهيز");
    expect(printRoot).toHaveTextContent("حركة جرد المخزن");
    expect(printRoot).not.toHaveTextContent("مراجعة قيد محاسبي خاص");

    fireEvent.click(screen.getByRole("button", { name: /طباعة/ }));
    expect(printMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("option", { name: "المحاسبة والتحصيل" })).not.toBeInTheDocument();
  });

  it("does not print internal source entity UUIDs in the operational task register", async () => {
    const internalSourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    setUser(["staff"]);
    mocks.fetchOperationalTasks.mockResolvedValue([
      task({
        id: internalSourceId,
        title: "مراجعة جرد المخزن",
        task_role: "warehouse",
        source_entity_type: "stock_count_sessions",
      }),
    ]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "مراجعة جرد المخزن" });

    const printRoot = document.querySelector(".operational-task-print");
    expect(printRoot).not.toBeNull();
    expect(printRoot).toHaveTextContent("جلسة جرد");
    expect(printRoot).not.toHaveTextContent(internalSourceId);
  });

  it("keeps summary metrics inside the same role boundary as visible task rows", async () => {
    setUser(["staff"]);
    mocks.fetchOperationalTasks.mockResolvedValue([
      task({ id: "visible-open", title: "مهمة بيع مرئية", task_role: "sales", status: "pending" }),
      task({ id: "visible-complete", title: "مهمة مخزن مكتملة", task_role: "warehouse", status: "completed", completed_at: "2026-10-21T11:00:00.000Z" }),
      task({ id: "hidden-finance-late", title: "مهمة محاسبة مخفية", task_role: "accountant", status: "pending", due_at: "2020-01-01T00:00:00.000Z" }),
      task({ id: "hidden-management-complete", title: "مهمة إدارة مخفية", task_role: "management", status: "completed", completed_at: "2026-10-21T11:00:00.000Z" }),
    ]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "مهمة بيع مرئية" });
    expect(screen.queryByText("مهمة محاسبة مخفية")).not.toBeInTheDocument();

    const openMetrics = screen.getByText("المهام المفتوحة").closest("article");
    expect(within(openMetrics as HTMLElement).getByText((1).toLocaleString("ar-YE"))).toBeInTheDocument();
    const lateMetrics = screen.getByText("متأخرة حسب موعد المصدر").closest("article");
    expect(within(lateMetrics as HTMLElement).getByText((0).toLocaleString("ar-YE"))).toBeInTheDocument();
    const completedMetrics = Array.from(document.querySelectorAll(".task-center-metrics article"))
      .find((card) => card.querySelector("span")?.textContent?.includes("مكتملة"));
    expect(completedMetrics).toBeDefined();
    expect(within(completedMetrics as HTMLElement).getByText((1).toLocaleString("ar-YE"))).toBeInTheDocument();
  });

  it("prints only the currently searched rows when the print scope is filtered", async () => {
    setUser(["manager"]);
    render(<TaskCenter onNotice={vi.fn()} />);

    await screen.findByRole("heading", { name: "مراجعة قيد محاسبي خاص" });
    fireEvent.change(screen.getByPlaceholderText("عنوان المهمة أو التفاصيل أو مرجع المصدر"), {
      target: { value: "طلب عميل" },
    });
    fireEvent.change(screen.getByLabelText("نطاق الطباعة"), { target: { value: "filtered" } });

    const printRoot = document.querySelector(".operational-task-print");
    expect(printRoot).not.toBeNull();
    const table = (printRoot as HTMLElement).querySelector("table");
    expect(table).not.toBeNull();
    expect(table).toHaveTextContent("طلب عميل للتجهيز");
    expect(table).not.toHaveTextContent("مراجعة قيد محاسبي خاص");
    expect(table).not.toHaveTextContent("حركة جرد المخزن");

    fireEvent.click(screen.getByRole("button", { name: /طباعة/ }));
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it("prints only explicitly selected filtered tasks and their allowlisted summary", async () => {
    setUser(["staff"]);
    mocks.fetchOperationalTasks.mockResolvedValue([
      task({ id: "selected-sales", title: "طلب عميل محدد للطباعة", task_role: "sales", priority: "critical", due_at: "2020-01-01T00:00:00.000Z" }),
      task({ id: "not-selected-warehouse", title: "مهمة مخزن غير محددة", task_role: "warehouse", status: "pending" }),
      task({ id: "hidden-finance", title: "مهمة محاسبة محجوبة", task_role: "accountant", status: "pending" }),
    ]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "طلب عميل محدد للطباعة" });

    fireEvent.change(screen.getByPlaceholderText("عنوان المهمة أو التفاصيل أو مرجع المصدر"), {
      target: { value: "طلب عميل محدد" },
    });
    fireEvent.click(screen.getByRole("button", { name: /تحديد النتائج الحالية/ }));
    expect(screen.getByRole("button", { name: /إلغاء التحديد/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("نطاق الطباعة"), { target: { value: "selected" } });
    const printRoot = document.querySelector(".operational-task-print") as HTMLElement;
    expect(printRoot).toHaveTextContent("المهام المحددة");
    const tables = printRoot.querySelectorAll("table");
    const rowsTable = tables[tables.length - 1];
    expect(rowsTable).toHaveTextContent("طلب عميل محدد للطباعة");
    expect(rowsTable).not.toHaveTextContent("مهمة مخزن غير محددة");
    expect(rowsTable).not.toHaveTextContent("مهمة محاسبة محجوبة");

    const summary = printRoot.querySelector(".task-print-summary-cards") as HTMLElement;
    expect(summary).toHaveTextContent("إجمالي المهام المطبوعة");
    expect(summary).toHaveTextContent((1).toLocaleString("ar-YE"));
    expect(summary).toHaveTextContent("المفتوحة");
    expect(printRoot.querySelector(".task-print-role-summary")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /طباعة المهام المحددة/ }));
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it("prints a role breakdown for managers using only rows in the selected print scope", async () => {
    setUser(["manager"]);
    mocks.fetchOperationalTasks.mockResolvedValue([
      task({ id: "sales-late-critical", title: "مهمة مبيعات حرجة متأخرة", task_role: "sales", priority: "critical", due_at: "2020-01-01T00:00:00.000Z" }),
      task({ id: "accountant-open", title: "مهمة محاسبة مفتوحة", task_role: "accountant", priority: "medium" }),
      task({ id: "warehouse-completed", title: "مهمة مخزن مكتملة", task_role: "warehouse", status: "completed", completed_at: "2026-10-21T11:00:00.000Z" }),
    ]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "مهمة مبيعات حرجة متأخرة" });

    const printRoot = document.querySelector(".operational-task-print") as HTMLElement;
    const summary = printRoot.querySelector(".task-print-summary-cards") as HTMLElement;
    expect(summary.querySelectorAll("div")).toHaveLength(5);
    expect(summary).toHaveTextContent("إجمالي المهام المطبوعة");
    expect(summary).toHaveTextContent("2");
    expect(summary).toHaveTextContent("المتأخرة");
    expect(summary).toHaveTextContent("1");
    expect(summary).toHaveTextContent("الحرجة");

    const roleRows = printRoot.querySelectorAll(".task-print-role-summary tbody tr");
    expect(roleRows).toHaveLength(2);
    expect(printRoot.querySelector(".task-print-role-summary")).toHaveTextContent("المبيعات");
    expect(printRoot.querySelector(".task-print-role-summary")).toHaveTextContent("المحاسبة والتحصيل");
    expect(printRoot.querySelector(".task-print-role-summary")).not.toHaveTextContent("مهمة مخزن مكتملة");
  });

  it("routes a task status action through the API and reloads persisted tasks", async () => {
    setUser(["manager"]);
    render(<TaskCenter onNotice={vi.fn()} />);

    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });
    fireEvent.click(screen.getAllByRole("button", { name: "استلام" })[0]);

    await waitFor(() => expect(mocks.setOperationalTaskStatus).toHaveBeenCalledWith(
      "sales-order",
      "in_progress",
      undefined,
    ));
    await waitFor(() => expect(mocks.fetchOperationalTasks).toHaveBeenCalledTimes(2));
  });

  it("keeps role-compatible assignment when creating a manual task", async () => {
    setUser(["manager"]);
    mocks.fetchOperationalTaskAssignees.mockResolvedValue([
      { profile_id: "profile-sales", full_name: "موظف مبيعات", email: "sales@example.test", roles: ["sales", "staff"] },
      { profile_id: "profile-accountant", full_name: "محاسب", email: "accountant@example.test", roles: ["accountant"] },
    ]);
    const onNotice = vi.fn();
    render(<TaskCenter onNotice={onNotice} />);

    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });
    await waitFor(() => expect(mocks.fetchOperationalTaskAssignees).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /مهمة يدوية/ }));

    fireEvent.change(screen.getByLabelText("عنوان المهمة"), { target: { value: "متابعة تسوية مستحقات العميل" } });
    fireEvent.change(screen.getByLabelText("التفاصيل"), { target: { value: "مطابقة مستندات التحصيل" } });

    const roleSelect = screen.getByLabelText("الدور المستهدف") as HTMLSelectElement;
    const assigneeSelect = screen.getByLabelText(/الموظف المسؤول/) as HTMLSelectElement;
    fireEvent.change(assigneeSelect, { target: { value: "profile-sales" } });
    expect(assigneeSelect.value).toBe("profile-sales");

    fireEvent.change(roleSelect, { target: { value: "accountant" } });
    expect(assigneeSelect.value).toBe("");
    expect(within(assigneeSelect).queryByRole("option", { name: "موظف مبيعات — sales@example.test" })).not.toBeInTheDocument();
    expect(within(assigneeSelect).getByRole("option", { name: "محاسب — accountant@example.test" })).toBeInTheDocument();

    fireEvent.change(assigneeSelect, { target: { value: "profile-accountant" } });
    const manualTaskForm = screen.getByRole("button", { name: "حفظ المهمة" }).closest("form");
    expect(manualTaskForm).not.toBeNull();
    fireEvent.change(within(manualTaskForm as HTMLFormElement).getAllByLabelText("الأولوية")[0], { target: { value: "critical" } });
    const dueAt = "2026-11-05T13:30";
    fireEvent.change(screen.getByLabelText("الموعد (اختياري)"), { target: { value: dueAt } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المهمة" }));

    await waitFor(() => expect(mocks.createOperationalTask).toHaveBeenCalledWith({
      title: "متابعة تسوية مستحقات العميل",
      description: "مطابقة مستندات التحصيل",
      taskRole: "accountant",
      priority: "critical",
      dueAt: new Date(dueAt).toISOString(),
      assignedTo: "profile-accountant",
    }));
    expect(onNotice).toHaveBeenCalledWith("حُفظت المهمة الجديدة مع سجل تدقيق.");
    expect(screen.queryByRole("heading", { name: "إسناد مهمة جديدة" })).not.toBeInTheDocument();
  });
  it("lets managers reassign an open task to a compatible active employee or return it to its role queue", async () => {
    setUser(["manager"]);
    const sourceTask = task({
      id: "sales-order",
      title: "طلب عميل للتجهيز",
      task_role: "sales",
      assigned_to: "profile-sales-a",
    });
    mocks.fetchOperationalTasks
      .mockResolvedValueOnce([sourceTask])
      .mockResolvedValueOnce([{ ...sourceTask, assigned_to: "profile-sales-b" }])
      .mockResolvedValueOnce([{ ...sourceTask, assigned_to: null }]);
    mocks.fetchOperationalTaskAssignees.mockResolvedValue([
      { profile_id: "profile-sales-a", full_name: "موظف المبيعات الحالي", email: "sales-a@example.test", roles: ["sales", "staff"] },
      { profile_id: "profile-sales-b", full_name: "موظف المبيعات البديل", email: "sales-b@example.test", roles: ["sales", "staff"] },
      { profile_id: "profile-accountant", full_name: "محاسب المؤسسة", email: "accountant@example.test", roles: ["accountant"] },
    ]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });

    let card = screen.getByRole("heading", { name: "طلب عميل للتجهيز" }).closest("article") as HTMLElement;
    let assignee = within(card).getByLabelText("المسؤول الجديد للمهمة: طلب عميل للتجهيز") as HTMLSelectElement;
    expect(within(assignee).getByRole("option", { name: "موظف المبيعات البديل" })).toBeInTheDocument();
    expect(within(assignee).queryByRole("option", { name: "محاسب المؤسسة" })).not.toBeInTheDocument();

    fireEvent.change(assignee, { target: { value: "profile-sales-b" } });
    fireEvent.click(within(card).getByRole("button", { name: "حفظ الإسناد" }));
    await waitFor(() => expect(mocks.assignOperationalTask).toHaveBeenNthCalledWith(1, "sales-order", "profile-sales-b"));
    await waitFor(() => expect(mocks.fetchOperationalTasks).toHaveBeenCalledTimes(2));

    card = screen.getByRole("heading", { name: "طلب عميل للتجهيز" }).closest("article") as HTMLElement;
    assignee = within(card).getByLabelText("المسؤول الجديد للمهمة: طلب عميل للتجهيز") as HTMLSelectElement;
    expect(assignee.value).toBe("profile-sales-b");
    fireEvent.change(assignee, { target: { value: "" } });
    fireEvent.click(within(card).getByRole("button", { name: "حفظ الإسناد" }));
    await waitFor(() => expect(mocks.assignOperationalTask).toHaveBeenNthCalledWith(2, "sales-order", null));
    await waitFor(() => expect(mocks.fetchOperationalTasks).toHaveBeenCalledTimes(3));
  });

  it("lets managers update an open task's priority and due date after creation", async () => {
    setUser(["manager"]);
    const sourceTask = task({
      id: "sales-order",
      title: "طلب عميل للتجهيز",
      task_role: "sales",
      priority: "medium",
      due_at: null,
    });
    mocks.fetchOperationalTasks
      .mockResolvedValueOnce([sourceTask])
      .mockResolvedValueOnce([{ ...sourceTask, priority: "critical", due_at: "2026-11-05T11:30:00.000Z" }]);

    render(<TaskCenter onNotice={vi.fn()} />);
    await screen.findByRole("heading", { name: "طلب عميل للتجهيز" });

    const card = screen.getByRole("heading", { name: "طلب عميل للتجهيز" }).closest("article") as HTMLElement;
    fireEvent.change(within(card).getByLabelText("أولوية المهمة: طلب عميل للتجهيز"), { target: { value: "critical" } });
    const dueAt = "2026-11-05T14:30";
    fireEvent.change(within(card).getByLabelText("موعد استحقاق المهمة: طلب عميل للتجهيز"), { target: { value: dueAt } });
    fireEvent.click(within(card).getByRole("button", { name: "حفظ التفاصيل" }));

    await waitFor(() => expect(mocks.updateOperationalTaskDetails).toHaveBeenCalledWith(
      "sales-order",
      "critical",
      new Date(dueAt).toISOString(),
    ));
    await waitFor(() => expect(mocks.fetchOperationalTasks).toHaveBeenCalledTimes(2));
  });

});
