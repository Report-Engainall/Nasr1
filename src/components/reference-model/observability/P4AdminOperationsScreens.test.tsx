// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import * as ts from "typescript";
import { resolve } from "node:path";

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
  vi.useRealTimers();
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

  it("rejects malformed source shapes instead of counting or labelling them as readable", async () => {
    setReadableSources();
    mocks.fetchPricingRules.mockResolvedValue({ rows: [], raw: "customer payload" });
    mocks.fetchImportJobsPage.mockResolvedValue({ totalCount: -1, rows: [], page: 1, pageSize: 10, totalPages: 0 });

    const snapshot = await readAdminEngineObservations();

    expect(snapshot.items.find((item) => item.id === "pricing")?.sourceStatus).toBe("INVALID");
    expect(snapshot.items.find((item) => item.id === "import")?.sourceStatus).toBe("INVALID");
    expect(snapshot.items.find((item) => item.id === "onyx")?.sourceStatus).toBe("READABLE");
    expect(JSON.stringify(snapshot)).not.toContain("customer payload");
  });

  it("times out a stalled source independently and still returns the other four observations", async () => {
    setReadableSources();
    vi.useFakeTimers();
    mocks.fetchPricingRules.mockImplementation(() => new Promise(() => {}));

    const pending = readAdminEngineObservations();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS);
    const snapshot = await pending;

    const pricing = snapshot.items.find((item) => item.id === "pricing");
    expect(pricing?.sourceStatus).toBe("TIMEOUT");
    expect(pricing?.summary).toContain("انتهت مهلة قراءة المصدر");
    expect(pricing?.recordCount).toBeNull();
    expect(snapshot.items.filter((item) => item.id !== "pricing").every(
      (item) => item.sourceStatus === "READABLE",
    )).toBe(true);
    expect(snapshot.items.every((item) => item.runtimeStatus === "UNKNOWN")).toBe(true);
  });

  it("renders all five engine observations while keeping runtime health unknown", async () => {
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

  it("never renders an untrusted raw failure message from the health source", async () => {
    const unsafeMessage = "Authorization: Bearer test-secret customer@example.test payload=private stack trace";
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "UNAVAILABLE",
      message: unsafeMessage,
    });
    render(<SystemHealthScreen />);

    expect(await screen.findByText("المصدر غير متاح")).toBeInTheDocument();
    expect(screen.getByText("تعذرت قراءة المصدر المعتمد حالياً.")).toBeInTheDocument();
    expect(screen.queryByText(unsafeMessage)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("test-secret");
    expect(document.body.textContent).not.toContain("customer@example.test");
    expect(document.body.textContent).not.toContain("payload=private");
    expect(document.body.textContent).not.toContain("stack trace");
  });

  it("does not describe permission denial as a system outage", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "DENIED",
      message: "تم رفض طلب ملخص الميزانية وفق صلاحيات الجلسة.",
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

  it("converts a stalled health read into an explicit unavailable state", async () => {
    vi.useFakeTimers();
    mocks.fetchAiGatewayBudget.mockImplementation(() => new Promise(() => {}));
    render(<SystemHealthScreen />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS);
    });

    expect(screen.getByText("انتهت مهلة الفحص")).toBeInTheDocument();
    expect(screen.getByText("غير متاح · UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByText(/لم يستجب مصدر ميزانية بوابة الذكاء خلال المهلة المحددة/)).toBeInTheDocument();
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
    expect(screen.getByText(/list_ai_gateway_audit/)).toBeInTheDocument();
    expect(screen.getByText(/لا تمثل إثباتاً لتفويض الخادم أو RLS/)).toBeInTheDocument();
  });

  it("strictly typechecks P4-owned screens, adapter and tests with the focused config", () => {
    const configPath = resolve(process.cwd(), "tsconfig.p4-typecheck.json");
    const configDiagnostics: ts.Diagnostic[] = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => configDiagnostics.push(diagnostic),
    });
    if (!parsed) {
      throw new Error(configDiagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n"),
      ).join("\\n") || "Could not parse tsconfig.p4-typecheck.json.");
    }

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
    const diagnostics = [...configDiagnostics, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    const messages = diagnostics.map((diagnostic) => {
      const location = diagnostic.file && diagnostic.start !== undefined
        ? (() => {
            const point = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
            return diagnostic.file!.fileName + ":" + String(point.line + 1) + ":" + String(point.character + 1);
          })()
        : "tsconfig.p4-typecheck.json";
      return location + " TS" + String(diagnostic.code) + ": " +
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n");
    });

    expect(parsed.fileNames.length).toBeGreaterThan(0);
    expect(messages).toEqual([]);
  }, 30_000);

});
