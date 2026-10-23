import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UnifiedOnyxAnalysisPanel } from "@/components/UnifiedOnyxAnalysisPanel";
import { fetchOnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const mocks = vi.hoisted(() => ({
  fetchOnyxSnapshots: vi.fn(),
  fetchOnyxSnapshotAnalytics: vi.fn(),
  roles: ["manager"] as string[],
  isStaff: true,
}));

vi.mock("@/lib/api", () => ({
  fetchOnyxSnapshots: mocks.fetchOnyxSnapshots,
  fetchOnyxSnapshotAnalytics: mocks.fetchOnyxSnapshotAnalytics,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { isStaff: mocks.isStaff, roles: mocks.roles } }),
}));
vi.mock("@/lib/onyx-source-evidence", () => ({
  fetchOnyxSnapshotSourceEvidence: vi.fn(),
}));

const provenanceEvidence = (id: string, file: string) => ({
  organization: { id: "99999999-9999-4999-8999-999999999999", name: "مؤسسة الاختبار" },
  snapshot: {
    id, source_import_job_id: null, source_file_name: file, source_file_hash: "a".repeat(64),
    report_type: "inventory", period_key: "2026-10", snapshot_version: 3,
    created_at: "2026-10-18T09:00:00.000Z", row_count: 25,
  },
  import_job: null,
  source_identity: {
    provenance_status: "snapshot_without_import_job", source_system: null, source_record_id: null,
    source_row_count: 25, external_id_fields_found: ["external_id"],
    external_id_examples: [{
      row_number: 1, canonical_key: "SKU-001", canonical_key_truncated: false,
      external_ids: { external_id: "ONYX-001" }, value_truncated: false,
    }],
    external_id_examples_truncated: false, rows_with_external_id: 1,
  },
  live_sync_evidence: {
    status: "not_proven", live_connection_proven: false, snapshot_sync_proven: false,
    last_sync_attempt: null, latest_successful_connection: null, snapshot_sync_success: null,
    message: "Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.",
  },
});

const snapshot = (id: string, file: string) => ({
  id,
  snapshot_version: 3,
  period_key: "2026-10",
  source_file_hash: "a".repeat(64),
  source_file_name: file,
  report_type: "inventory",
  row_count: 25,
  data_quality_score: 96,
  quality_breakdown: { invalid_rows: 1 },
  created_by: "manager-1",
  created_at: "2026-10-18T09:00:00.000Z",
});

const analytics = (id: string, file: string) => ({
  snapshot: {
    id, version: 3, file_name: file, file_hash: "a".repeat(64),
    report_type: "inventory", created_at: "2026-10-18T09:00:00.000Z",
    data_quality_score: 96, quality_breakdown: {},
  },
  metrics: {
    row_count: 25, unique_keys: 20, valid_rows: 23, rejected_rows: 1, warning_rows: 1,
    quantity_total: 72, revenue_total: 5100, sales_total: 4200, customer_count: 8,
    supplier_count: 3, item_count: 12, snapshot_row_count: 25, dqs: 96,
  },
  status_distribution: [{ status: "valid", count: 23 }],
  top_items: [],
  top_customers: [],
  forecast_status: "insufficient_history",
  forecast_reason: "لا يوجد تاريخ كافٍ للتنبؤ.",
});

describe("unified Onyx analysis panel", () => {
  beforeEach(() => {
    mocks.roles = ["manager"];
    mocks.isStaff = true;
    vi.mocked(fetchOnyxSnapshotSourceEvidence).mockReset().mockImplementation(async (id: string) =>
      provenanceEvidence(id, id === "snapshot-1" ? "inventory-october.csv" : "inventory-september.csv")
    );
    mocks.fetchOnyxSnapshots.mockReset().mockResolvedValue([
      snapshot("snapshot-1", "inventory-october.csv"),
      snapshot("snapshot-2", "inventory-september.csv"),
    ]);
    mocks.fetchOnyxSnapshotAnalytics.mockReset().mockImplementation(async (id: string) =>
      analytics(id, id === "snapshot-1" ? "inventory-october.csv" : "inventory-september.csv")
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads saved source metrics with lineage without mixing them with store totals", async () => {
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByText("تحليل مصدر أونكس ضمن التقارير")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /inventory-october\.csv/ })).toBeInTheDocument();
    expect(await screen.findByText("قيمة المبيعات داخل اللقطة")).toBeInTheDocument();
    expect(screen.getByText(/مستقلة عن إجماليات مبيعات متجر الأغبري/)).toBeInTheDocument();
    expect(screen.getByText("قيمة المبيعات داخل اللقطة").parentElement).toHaveTextContent(/٤.*٢٠٠|4200/);
    expect(screen.getByText(/SHA-256 للمصدر/)).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshotAnalytics).toHaveBeenCalledWith("snapshot-1");
    const provenancePanel = await screen.findByRole("region", { name: "أدلة هوية مصدر أونكس" });
    expect(within(provenancePanel).getByText("مؤسسة الاختبار")).toBeInTheDocument();
    expect(within(provenancePanel).getByText("ONYX-001")).toBeInTheDocument();
    expect(within(provenancePanel).getByText(/لا يثبت اتصالًا حيًا أو اكتمال مزامنة من واجهة Onyx API\./)).toBeInTheDocument();
    expect(fetchOnyxSnapshotSourceEvidence).toHaveBeenCalledWith("snapshot-1");
  });

  it("loads analytics for a different selected source snapshot", async () => {
    render(<UnifiedOnyxAnalysisPanel />);
    await screen.findByText("قيمة المبيعات داخل اللقطة");
    fireEvent.change(screen.getByLabelText("لقطة المصدر"), { target: { value: "snapshot-2" } });
    await waitFor(() => expect(mocks.fetchOnyxSnapshotAnalytics).toHaveBeenLastCalledWith("snapshot-2"));
    expect(screen.getByRole("option", { name: /inventory-september\.csv/ })).toBeInTheDocument();
  });

  it("shows a truthful empty state instead of invented zero-valued metrics", async () => {
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByText("لا توجد لقطات مصدر جاهزة")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("fails closed for an incomplete or non-finite server analytics payload", async () => {
    mocks.fetchOnyxSnapshotAnalytics.mockImplementation(async (id: string) => ({
      ...analytics(id, "invalid.csv"),
      metrics: { ...analytics(id, "invalid.csv").metrics, revenue_total: Number.NaN },
    }));
    render(<UnifiedOnyxAnalysisPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("بيانات تحليل اللقطة غير مكتملة");
    expect(screen.queryByText("قيمة المصدر المحللة")).not.toBeInTheDocument();
  });

  it("does not query source data for an unauthorized user", () => {
    mocks.isStaff = false;
    mocks.roles = ["customer"];
    render(<UnifiedOnyxAnalysisPanel />);
    expect(screen.getByText("صلاحية المؤسسة مطلوبة")).toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshots).not.toHaveBeenCalled();
    expect(mocks.fetchOnyxSnapshotAnalytics).not.toHaveBeenCalled();
  });
});
