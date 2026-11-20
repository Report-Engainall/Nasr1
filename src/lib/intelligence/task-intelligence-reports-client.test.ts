import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTaskIntelligenceReport } from "./task-intelligence-reports-client";

const { rpc, fetchQuality } = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchQuality: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
vi.mock("./task-quality-reviews-client", () => ({
  fetchOperationalTaskQualityMetrics: fetchQuality,
}));

describe("task intelligence report RPC failure boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    fetchQuality.mockReset();
  });

  it.each(["42501", "28000", "PGRST301"])(
    "maps authorization SQLSTATE %s to DENIED without fabricating an empty report",
    async code => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "source denied" } });

      const result = await fetchTaskIntelligenceReport("DAILY");

      expect(result).toMatchObject({
        ok: false,
        status: "DENIED",
        message: "لا تملك صلاحية قراءة تقرير المهام المطلوب.",
      });
      expect(fetchQuality).not.toHaveBeenCalled();
    },
  );

  it.each(["PGRST202", "42883"])(
    "maps missing RPC code %s to UNAVAILABLE",
    async code => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "function missing" } });

      const result = await fetchTaskIntelligenceReport("WEEKLY");

      expect(result).toMatchObject({
        ok: false,
        status: "UNAVAILABLE",
        message: "خدمة تقارير المهام غير متاحة قبل تطبيق ترحيل القسم 58.",
      });
      expect(fetchQuality).not.toHaveBeenCalled();
    },
  );

  it("maps a missing-function diagnostic to UNAVAILABLE even without a PostgREST code", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "function fetch_task_intelligence_report does not exist" },
    });

    const result = await fetchTaskIntelligenceReport("MONTHLY");

    expect(result).toMatchObject({ ok: false, status: "UNAVAILABLE" });
    expect(fetchQuality).not.toHaveBeenCalled();
  });

  it("keeps unexpected source failures as ERROR and does not expose raw backend details", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "internal database detail must not reach the UI" },
    });

    const result = await fetchTaskIntelligenceReport("DAILY");

    expect(result).toEqual({
      ok: false,
      status: "ERROR",
      message: "تعذر تحميل تقرير المهام من مصدر التطبيق المعتمد.",
    });
    expect(JSON.stringify(result)).not.toContain("internal database detail");
    expect(fetchQuality).not.toHaveBeenCalled();
  });

  it("fails closed on malformed successful RPC payloads instead of presenting an empty report", async () => {
    rpc.mockResolvedValue({ data: { status: "VERIFIED", managerRisks: [] }, error: null });

    const result = await fetchTaskIntelligenceReport("DAILY");

    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(fetchQuality).not.toHaveBeenCalled();
  });
});
