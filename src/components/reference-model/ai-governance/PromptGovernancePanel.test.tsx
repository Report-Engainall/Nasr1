// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  listAiPromptVersions: vi.fn(),
  listAiPromptAuditEvents: vi.fn(),
  createAiPromptDraft: vi.fn(),
  submitAiPromptVersion: vi.fn(),
  approveAiPromptVersion: vi.fn(),
  rejectAiPromptVersion: vi.fn(),
  activateAiPromptVersion: vi.fn(),
  retireAiPromptVersion: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/reference-model/prompt-persistence/prompt-persistence-client", () => ({
  listAiPromptVersions: mocks.listAiPromptVersions,
  listAiPromptAuditEvents: mocks.listAiPromptAuditEvents,
  createAiPromptDraft: mocks.createAiPromptDraft,
  submitAiPromptVersion: mocks.submitAiPromptVersion,
  approveAiPromptVersion: mocks.approveAiPromptVersion,
  rejectAiPromptVersion: mocks.rejectAiPromptVersion,
  activateAiPromptVersion: mocks.activateAiPromptVersion,
  retireAiPromptVersion: mocks.retireAiPromptVersion,
}));

import { PromptGovernancePanel } from "./PromptGovernancePanel";

const version = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000010",
  promptKey: "assistant.system",
  version: 1,
  content: "أجب بالعربية ولا تخمّن بيانات الأعمال. استخدم الدليل الموثق فقط.",
  contentSha256: "a".repeat(64),
  status: "PENDING_APPROVAL" as const,
  createdByProfileId: "00000000-0000-4000-8000-000000000020",
  createdAt: "2026-11-14T00:00:00.000Z",
  submittedAt: "2026-11-14T00:01:00.000Z",
  approvedByProfileId: null,
  approvedAt: null,
  rejectedByProfileId: null,
  rejectedAt: null,
  decisionReason: null,
  activatedAt: null,
  deactivatedAt: null,
  retiredAt: null,
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({
    user: { id: "auth-user", profileId: version.createdByProfileId, email: "admin@example.test", name: "Admin", roles: ["admin"], isStaff: true },
    sessionRevision: 1,
    loading: false,
    ready: true,
  });
  mocks.listAiPromptVersions.mockResolvedValue({ items: [], total: 0 });
  mocks.listAiPromptAuditEvents.mockResolvedValue([]);
});

describe("PromptGovernancePanel", () => {
  it("does not display seeded or fabricated prompt records when the server returns an empty library", async () => {
    render(<PromptGovernancePanel />);
    expect(await screen.findByText("لا توجد إصدارات محفوظة لهذا الحساب. لم تُنشأ أو تُعرض أوامر تجريبية تلقائياً.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ مسودة" })).toBeInTheDocument();
    expect(screen.queryByText("إصدار تجريبي")).not.toBeInTheDocument();
  });

  it("hides prompt controls from manager even though the settings workspace may allow the manager role", () => {
    mocks.useAuth.mockReturnValue({
      user: { id: "manager-user", profileId: "manager-profile", email: "manager@example.test", name: "Manager", roles: ["manager"], isStaff: true },
      sessionRevision: 1,
      loading: false,
      ready: true,
    });
    render(<PromptGovernancePanel />);
    expect(screen.getByRole("alert", { name: "صلاحية مكتبة الأوامر" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حفظ مسودة" })).not.toBeInTheDocument();
    expect(mocks.listAiPromptVersions).not.toHaveBeenCalled();
  });

  it("creates a server-backed draft then reloads the immutable version", async () => {
    mocks.createAiPromptDraft.mockResolvedValue({ version: { ...version, status: "DRAFT" }, events: [], replayed: false });
    mocks.listAiPromptVersions
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [{ ...version, status: "DRAFT" }], total: 1 });
    render(<PromptGovernancePanel />);
    await screen.findByText("لا توجد إصدارات محفوظة لهذا الحساب. لم تُنشأ أو تُعرض أوامر تجريبية تلقائياً.");
    fireEvent.change(screen.getByLabelText("نص الأمر"), {
      target: { value: "أجب بالعربية ولا تخمّن بيانات الأعمال. استخدم الدليل الموثق فقط." },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة" }));
    await waitFor(() => expect(mocks.createAiPromptDraft).toHaveBeenCalledWith(expect.objectContaining({
      promptKey: "assistant.system",
      content: "أجب بالعربية ولا تخمّن بيانات الأعمال. استخدم الدليل الموثق فقط.",
      commandId: expect.any(String),
    })));
    expect(await screen.findByText("حُفظت المسودة بإصدار وبصمة ثابتين.")).toBeInTheDocument();
    expect(screen.getByText("assistant.system · v1")).toBeInTheDocument();
  });

  it("prevents the maker from approving their own pending version in the UI", async () => {
    mocks.listAiPromptVersions.mockResolvedValue({ items: [version], total: 1 });
    render(<PromptGovernancePanel />);
    expect(await screen.findAllByText("بانتظار المراجعة")).toHaveLength(2);
    expect(screen.getByText("أنت منشئ هذه النسخة؛ لا يمكنك اعتمادها أو رفضها.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اعتماد" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "رفض" })).toBeDisabled();
  });

  it("shows the third-party activation gate when the current admin created or approved the version", async () => {
    mocks.useAuth.mockReturnValue({
      user: { id: "auth-user", profileId: "other-checker", email: "checker@example.test", name: "Checker", roles: ["admin"], isStaff: true },
      sessionRevision: 1,
      loading: false,
      ready: true,
    });
    mocks.listAiPromptVersions.mockResolvedValue({
      items: [{ ...version, status: "APPROVED", approvedByProfileId: "other-checker", approvedAt: "2026-11-14T00:02:00.000Z" }],
      total: 1,
    });
    render(<PromptGovernancePanel />);
    expect(await screen.findByText("يلزم مسؤول ثالث غير المنشئ والمراجع لتفعيل هذه النسخة.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تفعيل النسخة" })).toBeDisabled();
  });
  it("shows the previous persisted version and server audit events for comparison", async () => {
    const prior = { ...version, id: "00000000-0000-4000-8000-000000000002", version: 1, status: "APPROVED" as const, content: "النص السابق للإصدار الأول بغرض المقارنة الفعلية." };
    const current = { ...version, version: 2, status: "ACTIVE" as const, content: "النص الحالي للإصدار الثاني المعتمد والفعال." };
    mocks.listAiPromptVersions.mockResolvedValue({ items: [current, prior], total: 2 });
    mocks.listAiPromptAuditEvents.mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000030",
      organizationId: version.organizationId,
      promptVersionId: current.id,
      promptKey: current.promptKey,
      version: 2,
      action: "ACTIVATED",
      actorProfileId: "00000000-0000-4000-8000-000000000040",
      previousStatus: "APPROVED",
      nextStatus: "ACTIVE",
      reason: "تم التفعيل بعد المراجعة",
      occurredAt: "2026-11-14T00:05:00.000Z",
    }]);
    mocks.useAuth.mockReturnValue({
      user: { id: "auth-user", profileId: "00000000-0000-4000-8000-000000000040", email: "admin@example.test", name: "Admin", roles: ["admin"], isStaff: true },
      sessionRevision: 1,
      loading: false,
      ready: true,
    });
    render(<PromptGovernancePanel />);
    expect(await screen.findByText("مقارنة الإصدارات")).toBeInTheDocument();
    expect(screen.getByText("محتوى الإصدار محمي")).toBeInTheDocument();
    expect(screen.getAllByText("المحتوى محفوظ ومحجوب من العرض.")).toHaveLength(2);
    expect(screen.queryByText("النص السابق للإصدار الأول بغرض المقارنة الفعلية.")).not.toBeInTheDocument();
    expect(screen.queryByText("النص الحالي للإصدار الثاني المعتمد والفعال.")).not.toBeInTheDocument();
    expect(screen.getAllByText("مسؤول موثق في سجل الخادم").length).toBeGreaterThan(0);
    expect(screen.queryByText("00000000-0000-4000-8000-000000000020")).not.toBeInTheDocument();
    expect(screen.queryByText("00000000-0000-4000-8000-000000000040")).not.toBeInTheDocument();
    expect(await screen.findByText("لا يوفر عقد الحفظ تعطيلًا مستقلاً للنسخة النشطة؛ عند تفعيل نسخة بديلة معتمدة يسجل الخادم DEACTIVATED للنسخة الحالية ويعيدها إلى APPROVED. تعطيل مباشر بلا بديل غير متاح.")).toBeInTheDocument();
    expect(await screen.findByText("سجل التدقيق append-only")).toBeInTheDocument();
    expect(screen.getByText("تم التفعيل بعد المراجعة")).toBeInTheDocument();
  });

});