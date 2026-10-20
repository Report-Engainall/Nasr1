import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const fetchEvidence = vi.hoisted(() => vi.fn());
vi.mock("@/lib/onyx-source-evidence", () => ({ fetchOnyxSnapshotSourceEvidence: fetchEvidence }));

import { OnyxSnapshotSourceEvidencePanel } from "@/components/OnyxSnapshotSourceEvidencePanel";

const snapshotId = "22222222-2222-4222-8222-222222222222";
const jobId = "11111111-1111-4111-8111-111111111111";
const fixture = {
  organization: { id: "99999999-9999-4999-8999-999999999999", name: "مؤسسة الاختبار" },
  snapshot: {
    id: snapshotId, source_import_job_id: jobId, source_file_name: "stock.csv",
    source_file_hash: "a".repeat(64), report_type: "inventory_stock", period_key: "2026-10",
    snapshot_version: 1, created_at: "2026-10-20T12:00:00.000Z", row_count: 3,
  },
  import_job: {
    id: jobId, source_system: "manual", job_type: "inventory", status: "completed",
    file_name: "stock.csv", file_hash: "a".repeat(64), period_key: "2026-10",
    created_at: "2026-10-20T11:59:00.000Z", updated_at: null,
    error_code: null, file_hash_matches_snapshot: true,
  },
  source_identity: {
    provenance_status: "linked_import_job_hash_match", source_system: "manual",
    source_record_id: null, source_row_count: 3,
    external_id_fields_found: ["external_id"],
    external_id_examples: [{ row_number: 1, canonical_key: "SKU-101", canonical_key_truncated: false, external_ids: { external_id: "ONYX-101" }, value_truncated: false }],
    external_id_examples_truncated: false, rows_with_external_id: 2,
  },
  live_sync_evidence: {
    status: "not_proven", live_connection_proven: false,
    message: "Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.",
  },
};

afterEach(() => fetchEvidence.mockReset());

describe("Onyx source evidence panel", () => {
  it("shows the persisted import link and external ID evidence without calling it a live sync", async () => {
    fetchEvidence.mockResolvedValue(fixture);
    render(<OnyxSnapshotSourceEvidencePanel snapshotId={snapshotId} />);
    expect(await screen.findByText("مرجع دفعة الاستيراد موجود والبصمة متطابقة")).toBeTruthy();
    expect(screen.getByTestId("onyx-evidence-organization-name").textContent).toBe("مؤسسة الاختبار");
    expect(screen.getByText(/آخر تحديث للدفعة:/).parentElement?.textContent).toContain("غير مسجل");
    expect(screen.getByText(/معرّف سجل المصدر الخارجي/).parentElement?.textContent).toContain("غير متاح");
    expect(screen.getByText("استيراد ملف يدوي")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "عينات معرّفات المصدر الخارجية" })).getByText("external_id")).toBeTruthy();
    expect(screen.getByText("ONYX-101")).toBeTruthy();
    expect(screen.getByText(/صف المصدر 1/)).toBeTruthy();
    expect(screen.getByText(/غير مثبتة بأدلة هذا السجل/)).toBeTruthy();
    expect(screen.getByText(/لا يثبت اتصالًا حيًا أو اكتمال مزامنة/)).toBeTruthy();
    expect(fetchEvidence).toHaveBeenCalledWith(snapshotId);
  });

  it("warns when the import and snapshot hashes differ", async () => {
    fetchEvidence.mockResolvedValue({
      ...fixture,
      import_job: { ...fixture.import_job, file_hash_matches_snapshot: false },
      source_identity: { ...fixture.source_identity, provenance_status: "linked_hash_mismatch" },
    });
    render(<OnyxSnapshotSourceEvidencePanel snapshotId={snapshotId} />);
    expect(await screen.findByText("تحذير: بصمة اللقطة تختلف عن بصمة دفعة الاستيراد")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("غير متطابقة")).toBeTruthy());
  });

  it("shows a safe, scoped failure instead of inventing provenance", async () => {
    fetchEvidence.mockRejectedValue(new Error("database internal detail"));
    render(<OnyxSnapshotSourceEvidencePanel snapshotId={snapshotId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل أدلة المصدر");
    expect(screen.queryByText("database internal detail")).toBeNull();
  });
});
