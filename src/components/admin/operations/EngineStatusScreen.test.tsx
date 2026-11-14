// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import { EngineStatusScreen } from "@/components/admin/operations/EngineStatusScreen";
import { readAdminEngineObservations } from "@/lib/admin-operation-engine-observations";
import { ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS } from "@/lib/admin-observability-deadline";

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
    ok: true, status: "READY", data: {}, readAt: READ_AT,
  });
  mocks.fetchOnyxSnapshots.mockResolvedValue([{ created_at: READ_AT }]);
  mocks.listMyAsyncExportJobs.mockResolvedValue([{ status: "ready", created_at: READ_AT }]);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("admin engine source observations", () => {
  it("reads five current sources but never converts source-read success into engine health", async () => {
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

  it("shows empty real sources as readable-empty instead of fabricating rows", async () => {
    mocks.fetchImportJobsPage.mockResolvedValue({ totalCount: 0, rows: [], page: 1, pageSize: 10, totalPages: 0 });
    mocks.fetchPricingRules.mockResolvedValue([]);
    mocks.fetchAiGatewayBudget.mockResolvedValue({ ok: true, status: "READY", data: {}, readAt: READ_AT });
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    mocks.listMyAsyncExportJobs.mockResolvedValue([]);
    const snapshot = await readAdminEngineObservations();
    for (const id of ["import", "pricing", "onyx", "export"] as const) {
      expect(snapshot.items.find((item) => item.id === id)).toMatchObject({
        sourceStatus: "READABLE_EMPTY", recordCount: 0, runtimeStatus: "UNKNOWN",
      });
    }
    expect(snapshot.items.find((item) => item.id === "ai")?.sourceStatus).toBe("READABLE");
  });

  it("uses safe source states and never echoes raw errors or customer/credential data", async () => {
    mocks.fetchImportJobsPage.mockRejectedValue(Object.assign(
      new Error("customer@example.test bearer-secret"), { code: "42501" },
    ));
    mocks.fetchPricingRules.mockRejectedValue(new Error("postgres password=secret customer payload"));
    mocks.fetchAiGatewayBudget.mockResolvedValue({ ok: false, status: "DENIED", message: "permission denied" });
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    mocks.listMyAsyncExportJobs.mockResolvedValue([]);
    const snapshot = await readAdminEngineObservations();
    expect(snapshot.items.find((item) => item.id === "import")?.sourceStatus).toBe("DENIED");
    expect(snapshot.items.find((item) => item.id === "pricing")?.sourceStatus).toBe("UNAVAILABLE");
    expect(snapshot.items.find((item) => item.id === "ai")?.sourceStatus).toBe("DENIED");
    expect(JSON.stringify(snapshot)).not.toContain("customer@example.test");
    expect(JSON.stringify(snapshot)).not.toContain("bearer-secret");
    expect(JSON.stringify(snapshot)).not.toContain("password=secret");
    expect(snapshot.items.every((item) => item.runtimeStatus === "UNKNOWN")).toBe(true);
  });

  it("rejects invalid source shapes instead of counting them as readable", async () => {
    setReadableSources();
    mocks.fetchPricingRules.mockResolvedValue({ rows: [], raw: "private source payload" });
    mocks.fetchImportJobsPage.mockResolvedValue({ totalCount: -1, rows: [], page: 1, pageSize: 10, totalPages: 0 });
    const snapshot = await readAdminEngineObservations();
    expect(snapshot.items.find((item) => item.id === "pricing")?.sourceStatus).toBe("INVALID");
    expect(snapshot.items.find((item) => item.id === "import")?.sourceStatus).toBe("INVALID");
    expect(JSON.stringify(snapshot)).not.toContain("private source payload");
  });

  it("times out a stalled source independently without withholding the other four reads", async () => {
    setReadableSources();
    vi.useFakeTimers();
    mocks.fetchPricingRules.mockImplementation(() => new Promise(() => {}));
    const pending = readAdminEngineObservations();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS);
    const snapshot = await pending;
    expect(snapshot.items.find((item) => item.id === "pricing")).toMatchObject({
      sourceStatus: "TIMEOUT", recordCount: null,
    });
    expect(snapshot.items.filter((item) => item.id !== "pricing").every(
      (item) => item.sourceStatus === "READABLE",
    )).toBe(true);
    expect(snapshot.items.every((item) => item.runtimeStatus === "UNKNOWN")).toBe(true);
  });

  it("renders all five source observations and keeps execution state unknown", async () => {
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

  it("re-reads all five existing sources after explicit refresh", async () => {
    setReadableSources();
    render(<EngineStatusScreen />);
    expect(await screen.findByText("محرك الاستيراد")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة التحقق" }));
    await waitFor(() => {
      expect(mocks.fetchImportJobsPage).toHaveBeenCalledTimes(2);
      expect(mocks.fetchPricingRules).toHaveBeenCalledTimes(2);
      expect(mocks.fetchOnyxSnapshots).toHaveBeenCalledTimes(2);
      expect(mocks.fetchAiGatewayBudget).toHaveBeenCalledTimes(2);
      expect(mocks.listMyAsyncExportJobs).toHaveBeenCalledTimes(2);
    });
  });
});
