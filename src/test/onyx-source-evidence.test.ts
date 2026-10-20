import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchOnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const snapshotId = "22222222-2222-4222-8222-222222222222";
const jobId = "11111111-1111-4111-8111-111111111111";
const evidenceFixture = {
  snapshot: {
    id: snapshotId,
    source_import_job_id: jobId,
    source_file_name: "stock.csv",
    source_file_hash: "a".repeat(64),
    report_type: "inventory_stock",
    period_key: "2026-10",
    snapshot_version: 2,
    created_at: "2026-10-20T12:00:00.000Z",
    row_count: 3,
  },
  import_job: {
    id: jobId,
    source_system: "manual",
    job_type: "inventory",
    status: "completed",
    file_name: "stock.csv",
    file_hash: "a".repeat(64),
    period_key: "2026-10",
    created_at: "2026-10-20T11:59:00.000Z",
    updated_at: "2026-10-20T12:00:00.000Z",
    error_code: null,
    file_hash_matches_snapshot: true,
  },
  source_identity: {
    provenance_status: "linked_import_job_hash_match",
    source_system: "manual",
    source_record_id: jobId,
    source_row_count: 3,
    external_id_fields_found: ["external_id", "onyx_code"],
    rows_with_external_id: 2,
  },
  live_sync_evidence: {
    status: "not_proven",
    live_connection_proven: false,
    message: "Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.",
  },
};

afterEach(() => rpc.mockReset());

describe("tenant-scoped Onyx source evidence contract", () => {
  it("loads provenance from the server RPC and keeps saved imports separate from live-sync proof", async () => {
    rpc.mockResolvedValue({ data: evidenceFixture, error: null });
    const result = await fetchOnyxSnapshotSourceEvidence(snapshotId);
    expect(rpc).toHaveBeenCalledWith("get_onyx_snapshot_source_evidence", { p_snapshot_id: snapshotId });
    expect(result.source_identity).toMatchObject({
      provenance_status: "linked_import_job_hash_match",
      source_system: "manual",
      source_record_id: jobId,
      external_id_fields_found: ["external_id", "onyx_code"],
      rows_with_external_id: 2,
    });
    expect(result.live_sync_evidence).toMatchObject({ status: "not_proven", live_connection_proven: false });
  });

  it("rejects malformed snapshot identifiers before making an RPC request", async () => {
    await expect(fetchOnyxSnapshotSourceEvidence("not-a-uuid")).rejects.toThrow(/معرّف لقطة/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects hash-mismatch provenance rather than inferring a match", async () => {
    rpc.mockResolvedValue({
      data: {
        ...evidenceFixture,
        import_job: { ...evidenceFixture.import_job, file_hash: "b".repeat(64), file_hash_matches_snapshot: false },
        source_identity: { ...evidenceFixture.source_identity, provenance_status: "linked_hash_mismatch" },
      },
      error: null,
    });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).resolves.toMatchObject({
      import_job: { file_hash_matches_snapshot: false },
      source_identity: { provenance_status: "linked_hash_mismatch" },
      live_sync_evidence: { live_connection_proven: false },
    });
  });

  it("rejects a response which claims live connection proof without a supported evidence contract", async () => {
    rpc.mockResolvedValue({
      data: {
        ...evidenceFixture,
        live_sync_evidence: { status: "success", live_connection_proven: true, message: "unverified" },
      },
      error: null,
    });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/حالة مزامنة/);
  });

  it("rejects server payloads that omit the source identity instead of displaying fabricated defaults", async () => {
    rpc.mockResolvedValue({ data: { snapshot: evidenceFixture.snapshot }, error: null });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/غير مكتملة/);
  });
});
