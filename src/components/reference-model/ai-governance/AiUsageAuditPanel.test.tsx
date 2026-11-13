// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listAiUsageAudit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/reference-model/ai-governance/ai-usage-audit-client", () => ({
  listAiUsageAudit: mocks.listAiUsageAudit,
}));
import { AiUsageAuditPanel } from "./AiUsageAuditPanel";

const record = {
  id: "00000000-0000-4000-8000-000000000001",
  requestId: "req-p2-ai-audit-001",
  actorProfileId: "00000000-0000-4000-8000-000000000010",
  modelName: "openai_compatible/example-model",
  estimatedCost: 0.0042,
  executionTimeMs: 840,
  fallbackUsed: false,
  resultStatus: "completed" as const,
  measurementStatus: "measured" as const,
  observedInputTokens: 120,
  observedOutputTokens: 48,
  providerAttemptCount: 1,
  providerAttemptTelemetryAvailable: true,
  providerAttempts: [{
    provider: "openai_compatible" as const,
    model: "example-model",
    fallback: false,
    status: "succeeded" as const,
    elapsedMs: 840,
    observedInputTokens: 120,
    observedOutputTokens: 48,
    estimatedCost: 0.0042,
    errorCode: null,
  }],
  outcomeReason: null,
  createdAt: "2026-11-14T01:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({
    user: { id: "manager-user", profileId: "manager-profile", email: "manager@example.test", name: "Manager", roles: ["manager"], isStaff: true },
    sessionRevision: 1,
    loading: false,
    ready: true,
  });
  mocks.listAiUsageAudit.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
});

describe("AiUsageAuditPanel", () => {
  it("shows a real empty state without manufacturing AI attempts", async () => {
    render(<AiUsageAuditPanel />);
    expect(await screen.findByText("لا توجد محاولات تطابق المرشح")).toBeInTheDocument();
    expect(mocks.listAiUsageAudit).toHaveBeenCalledWith({ status: null, limit: 25, offset: 0 });
    expect(screen.queryByText("req-demo")).not.toBeInTheDocument();
  });

  it("allows a manager and renders only source-backed, redacted attempt metadata", async () => {
    mocks.listAiUsageAudit.mockResolvedValue({ items: [record], total: 1, limit: 25, offset: 0 });
    render(<AiUsageAuditPanel />);
    expect(await screen.findByText("req-p2-ai-audit-001")).toBeInTheDocument();
    expect(screen.getAllByText("openai_compatible / example-model")).toHaveLength(2);
    expect(screen.getByText("استهلاك مقاس من المزود")).toBeInTheDocument();
    expect(screen.getByText(/التكلفة المقدّرة: 0[.]0042/)).toBeInTheDocument();
    expect(screen.queryByText(/نص السؤال الخام/)).not.toBeInTheDocument();
    expect(screen.queryByText(/الرد السري/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "مؤشرات جودة تشغيل الذكاء" })).toBeInTheDocument();
    expect(screen.getAllByText("عينة غير كافية").length).toBeGreaterThan(0);
  });

  it("denies accountant roles before requesting the audit RPC", () => {
    mocks.useAuth.mockReturnValue({
      user: { id: "accountant-user", profileId: "accountant-profile", email: "accountant@example.test", name: "Accountant", roles: ["accountant"], isStaff: true },
      sessionRevision: 1,
      loading: false,
      ready: true,
    });
    render(<AiUsageAuditPanel />);
    expect(screen.getByRole("alert", { name: "صلاحية تدقيق الذكاء" })).toBeInTheDocument();
    expect(mocks.listAiUsageAudit).not.toHaveBeenCalled();
  });

  it("passes a selected status to the server and resets pagination", async () => {
    mocks.listAiUsageAudit
      .mockResolvedValueOnce({ items: [], total: 60, limit: 25, offset: 0 })
      .mockResolvedValueOnce({ items: [record], total: 1, limit: 25, offset: 0 });
    render(<AiUsageAuditPanel />);
    await screen.findByText("لا توجد محاولات تطابق المرشح");
    fireEvent.change(screen.getByLabelText("حالة النتيجة"), { target: { value: "completed" } });
    await waitFor(() => expect(mocks.listAiUsageAudit).toHaveBeenLastCalledWith({ status: "completed", limit: 25, offset: 0 }));
    expect(screen.queryByRole("region", { name: "مؤشرات جودة تشغيل الذكاء" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("أُخفيت مؤشرات الجودة");
  });

  it("does not keep stale ledger rows visible when a read fails", async () => {
    mocks.listAiUsageAudit.mockRejectedValue(new Error("تعذر تحميل سجل محاولات الذكاء من الخادم."));
    render(<AiUsageAuditPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل سجل محاولات الذكاء من الخادم.");
    expect(screen.queryByText("req-p2-ai-audit-001")).not.toBeInTheDocument();
  });
});
