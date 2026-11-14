// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchImportJobsPage: vi.fn(),
  fetchPricingRules: vi.fn(),
  fetchOnyxSnapshots: vi.fn(),
  fetchAiGatewayBudget: vi.fn(),
  listMyAsyncExportJobs: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchImportJobsPage: mocks.fetchImportJobsPage,
  fetchPricingRules: mocks.fetchPricingRules,
  fetchOnyxSnapshots: mocks.fetchOnyxSnapshots,
}));
vi.mock("@/lib/async-export-jobs", () => ({
  listMyAsyncExportJobs: mocks.listMyAsyncExportJobs,
}));
vi.mock("@/lib/intelligence/ai-gateway-operations-client", () => ({
  fetchAiGatewayBudget: mocks.fetchAiGatewayBudget,
}));

import {
  ArchitectureScreen,
  EngineStatusScreen,
  ErrorLogScreen,
  SystemHealthScreen,
} from "@/components/admin/operations";
import { readAdminEngineObservations } from "@/lib/admin-operation-engine-observations";

const READ_AT = "2026-11-14T00:00:00.000Z";

function setReadableSources() {
  mocks.fetchImportJobsPage.mockResolvedValue({
    totalCount: 3,
    rows: [
      { status: "completed", created_at: READ_AT },
      { status: "failed", created_at: "2026-11-13T00:00:00.000Z" },
    ],
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });
  mocks.fetchPricingRules.mockResolvedValue([{ created_at: READ_AT }]);
  mocks.fetchAiGatewayBudget.mockResolvedValue({
    ok: true,
    status: "READY",
    data: {},
    readAt: READ_AT,
  });
  mocks.fetchOnyxSnapshots.mockResolvedValue([{ created_at: READ_AT }]);
  mocks.listMyAsyncExportJobs.mockResolvedValue([{ status: "ready", created_at: READ_AT }]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("P4 admin engine source observations", () => {
  it("reads all five existing sources but never upgrades source-read success into engine health", async () => {
    setReadableSources();

    const snapshot = await readAdminEngineObservations();

    expect(snapshot.items.map((item) => item.id)).toEqual(["import", "pricing", "ai", "onyx", "export"]);
    expect(snapshot.items.every((item) => item.sourceStatus === "READABLE")).toBe(true);
    expect(snapshot.items.every((item) => item.runtimeStatus === "UNKNOWN")).toBe(true);
    expect(snapshot.items.every((item) => typeof item.latencyMs === "number")).toBe(true);
    expect(snapshot.items.find((item) => item.id === "import")?.recordCount).toBe(3);
    expect(snapshot.items.find((item) => item.id === "pricing")?.recordCount).toBe(1);
    expect(snapshot.items.find((item) => item.id === "onyx")?.boundary).toContain("لا يوجد اتصال حي");
    expect(snapshot.items.find((item) => item.id === "export")?.boundary).toContain("لا يثبت توافره");
  });

  it("represents empty real sources as readable-empty rather than inventing rows", async () => {
    mocks.fetchImportJobsPage.mockResolvedValue({ totalCount: 0, rows: [], page: 1, pageSize: 10, totalPages: 0 });
    mocks.fetchPricingRules.mockResolvedValue([]);
    mocks.fetchAiGatewayBudget.mockResolvedValue({ ok: true, status: "READY", data: {}, readAt: READ_AT });
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    mocks.listMyAsyncExportJobs.mockResolvedValue([]);

    const snapshot = await readAdminEngineObservations();

    for (const id of ["import", "pricing", "onyx", "export"] as const) {
      expect(snapshot.items.find((item) => item.id === id)).toMatchObject({
        sourceStatus: "READABLE_EMPTY",
        recordCount: 0,
        runtimeStatus: "UNKNOWN",
      });
    }
    expect(snapshot.items.find((item) => item.id === "ai")?.sourceStatus).toBe("READABLE");
  });

  it("returns fixed safe reasons for denied and unavailable sources without echoing raw errors", async () => {
    mocks.fetchImportJobsPage.mockRejectedValue(Object.assign(new Error("customer@example.test bearer-secret"), { code: "42501" }));
    mocks.fetchPricingRules.mockRejectedValue(new Error("postgres password=secret customer payload"));
    mocks.fetchAiGatewayBudget.mockResolvedValue({ ok: false, status: "DENIED", message: "permission denied" });
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    mocks.listMyAsyncExportJobs.mockResolvedValue([]);

    const snapshot = await readAdminEngineObservations();
    const imported = snapshot.items.find((item) => item.id === "import");
    const pricing = snapshot.items.find((item) => item.id === "pricing");
    const ai = snapshot.items.find((item) => item.id === "ai");

    expect(imported?.sourceStatus).toBe("DENIED");
    expect(pricing?.sourceStatus).toBe("UNAVAILABLE");
    expect(ai?.sourceStatus).toBe("DENIED");
    expect(JSON.stringify(snapshot)).not.toContain("customer@example.test");
    expect(JSON.stringify(snapshot)).not.toContain("bearer-secret");
    expect(JSON.stringify(snapshot)).not.toContain("password=secret");
    expect(snapshot.items.every((item) => item.runtimeStatus === "UNKNOWN")).toBe(true);
  });

  it("renders the engine board with runtime status explicitly unknown", async () => {
    setReadableSources();
    render(<EngineStatusScreen />);

    expect(await screen.findAllByText("UNKNOWN — غير مثبتة")).toHaveLength(5);
    expect(screen.getByText("محرك الاستيراد")).toBeInTheDocument();
    expect(screen.getByText("محرك التسعير")).toBeInTheDocument();
    expect(screen.getByText("بوابة الذكاء الاصطناعي")).toBeInTheDocument();
    expect(screen.getByText("مصدر لقطات Onyx")).toBeInTheDocument();
    expect(screen.getByText("محرك التصدير")).toBeInTheDocument();
    expect(screen.getByText(/لا يوجد اتصال حي بنظام Onyx/)).toBeInTheDocument();
    expect(screen.getByText(/لا يستدعي العامل ولا يثبت توافره/)).toBeInTheDocument();
  });
});

describe("P4 monitoring screens", () => {
  it("uses the real budget RPC result but keeps aggregate health unknown without verified evidence", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: true,
      status: "READY",
      data: {},
      readAt: READ_AT,
    });
    render(<SystemHealthScreen />);

    expect(await screen.findByText("استجابة المصدر مؤكدة")).toBeInTheDocument();
    expect(screen.getByText("غير مثبت · UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText(/HEALTH_EVIDENCE_MISSING_OR_UNVERIFIED/)).toBeInTheDocument();
    expect(screen.getByText("public.get_ai_gateway_budget")).toBeInTheDocument();
  });

  it("does not describe permission denial as a system outage", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "DENIED",
      message: "محجوب بالصلاحية",
    });
    render(<SystemHealthScreen />);

    expect(await screen.findByText("محجوب بالصلاحية")).toBeInTheDocument();
    expect(screen.getByText("غير مثبت · UNKNOWN")).toBeInTheDocument();
  });

  it("shows source outage without displaying a healthy state", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "UNAVAILABLE",
      message: "تعذر قراءة المصدر.",
    });
    render(<SystemHealthScreen />);

    expect(await screen.findByText("المصدر غير متاح")).toBeInTheDocument();
    expect(screen.getByText("غير متاح · UNAVAILABLE")).toBeInTheDocument();
    expect(screen.queryByText("سليم · HEALTHY")).not.toBeInTheDocument();
  });

  it("does not render temporary raw errors as a persistent error log", () => {
    render(<ErrorLogScreen />);

    expect(screen.getByRole("region", { name: "سجل الأخطاء" })).toBeInTheDocument();
    expect(screen.getByText("BLOCKED_NO_PERSISTENT_SOURCE")).toBeInTheDocument();
    expect(screen.getByText(/لا يوجد سجل أخطاء دائم قابل للقراءة/)).toBeInTheDocument();
    expect(screen.getByText(/لن نُنشئ معرفات أو أوقاتاً أو تصنيفات/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders architecture from the actual route tree and canonical navigation registry", () => {
    render(<ArchitectureScreen />);

    expect(screen.getByRole("region", { name: "معمارية النظام" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "المسارات المسجلة في TanStack Router" })).toBeInTheDocument();
    expect(screen.getByText("/admin/ai")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).toBeInTheDocument();
    expect(screen.getByText("public.list_ai_gateway_audit()")).toBeInTheDocument();
    expect(screen.getByText(/لا تمثل إثباتاً لتفويض الخادم أو RLS/)).toBeInTheDocument();
  });
});
