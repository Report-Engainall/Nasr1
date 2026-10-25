import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchOnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const organizationId = "99999999-9999-4999-8999-999999999999";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const jobId = "11111111-1111-4111-8111-111111111111";
const malformedUuid = "------------------------------------";
const attemptFixture = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  operation: "inventory_pull",
  status: "failed",
  snapshot_id: snapshotId,
  order_id: null,
  request_sha256: "c".repeat(64),
  response_sha256: null,
  http_status: 504,
  external_request_id: "onyx-req-001",
  error_code: "REMOTE_TIMEOUT",
  error_summary: "Provider timeout",
  started_at: "2026-10-20T12:05:00.000Z",
  completed_at: "2026-10-20T12:05:03.000Z",
};
const successfulAttemptFixture = {
  ...attemptFixture,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "succeeded",
  request_sha256: "d".repeat(64),
  response_sha256: "e".repeat(64),
  http_status: 200,
  error_code: null,
  error_summary: null,
  started_at: "2026-10-20T12:00:00.000Z",
  completed_at: "2026-10-20T12:00:01.000Z",
};
const syncEvidenceFixture = {
  organization_id: organizationId,
  snapshot_id: snapshotId,
  last_sync_attempt: attemptFixture,
  latest_successful_connection: successfulAttemptFixture,
  snapshot_sync_proven: true,
  snapshot_sync_success: successfulAttemptFixture,
  live_connection_proven: true,
  live_connection_message: "Historical provider response succeeded; this is not a real-time health guarantee.",
};
const evidenceFixture = {
  organization: { id: organizationId, name: "مؤسسة الاختبار" },
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
    updated_at: null,
    error_code: null,
    file_hash_matches_snapshot: true,
  },
  source_identity: {
    provenance_status: "linked_import_job_hash_match",
    source_system: "manual",
    source_record_id: null,
    source_row_count: 3,
    external_id_fields_found: ["external_id", "onyx_code"],
    external_id_examples: [{
      row_number: 1,
      canonical_key: "SKU-101",
      canonical_key_truncated: false,
      external_ids: { external_id: "ONYX-101" },
      value_truncated: false,
    }],
    external_id_examples_truncated: false,
    rows_with_external_id: 2,
  },
  live_sync_evidence: {
    status: "not_proven",
    live_connection_proven: false,
    message: "Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.",
  },
};

function mockRpcEvidence(
  source: Record<string, unknown> = evidenceFixture,
  sync: Record<string, unknown> = syncEvidenceFixture,
) {
  rpc.mockImplementation(async (name: string) => name === "get_onyx_snapshot_source_evidence"
    ? { data: source, error: null }
    : { data: sync, error: null });
}

function liveSyncEvidence(attempt: Record<string, unknown> | null) {
  return {
    organization_id: organizationId,
    snapshot_id: snapshotId,
    live_connection_proven: false,
    snapshot_sync_proven: false,
    live_connection_message: "No successful live provider response has been proven.",
    last_sync_attempt: attempt,
    latest_successful_connection: null,
    snapshot_sync_success: null,
  };
}

function startedAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    operation: "inventory_pull",
    status: "started",
    snapshot_id: null,
    order_id: null,
    request_sha256: "b".repeat(64),
    response_sha256: null,
    http_status: null,
    external_request_id: null,
    error_code: null,
    error_summary: null,
    started_at: "2026-10-25T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

afterEach(() => rpc.mockReset());

describe("tenant-scoped Onyx source evidence contract", () => {
  it("loads import provenance separately from provider attempts and successful-response evidence", async () => {
    mockRpcEvidence();
    const result = await fetchOnyxSnapshotSourceEvidence(snapshotId);
    expect(rpc).toHaveBeenCalledWith("get_onyx_snapshot_source_evidence", { p_snapshot_id: snapshotId });
    expect(rpc).toHaveBeenCalledWith("get_onyx_live_sync_attempt_evidence", { p_snapshot_id: snapshotId });
    expect(result.organization).toEqual({ id: organizationId, name: "مؤسسة الاختبار" });
    expect(result.import_job).toMatchObject({ updated_at: null });
    expect(result.source_identity.external_id_examples[0]).toMatchObject({
      row_number: 1,
      external_ids: { external_id: "ONYX-101" },
    });
    expect(result.source_identity).toMatchObject({
      provenance_status: "linked_import_job_hash_match",
      source_system: "manual",
      source_record_id: null,
      external_id_fields_found: ["external_id", "onyx_code"],
      external_id_examples_truncated: false,
      rows_with_external_id: 2,
    });
    expect(result.live_sync_evidence).toMatchObject({
      status: "proven",
      live_connection_proven: true,
      snapshot_sync_proven: true,
      last_sync_attempt: { status: "failed", error_code: "REMOTE_TIMEOUT" },
      latest_successful_connection: { status: "succeeded", http_status: 200 },
    });
  });

  it("rejects malformed snapshot identifiers before making an RPC request", async () => {
    await expect(fetchOnyxSnapshotSourceEvidence("not-a-uuid")).rejects.toThrow(/معرّف لقطة/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves explicit hash-mismatch provenance and does not infer a match", async () => {
    const mismatchedEvidence = {
      ...evidenceFixture,
      import_job: {
        ...evidenceFixture.import_job,
        file_hash: "b".repeat(64),
        file_hash_matches_snapshot: false,
      },
      source_identity: { ...evidenceFixture.source_identity, provenance_status: "linked_hash_mismatch" },
    };
    const noSync = {
      ...syncEvidenceFixture,
      last_sync_attempt: null,
      latest_successful_connection: null,
      snapshot_sync_success: null,
      live_connection_proven: false,
      snapshot_sync_proven: false,
    };
    mockRpcEvidence(mismatchedEvidence, noSync);
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).resolves.toMatchObject({
      import_job: { file_hash_matches_snapshot: false },
      source_identity: { provenance_status: "linked_hash_mismatch" },
      live_sync_evidence: { live_connection_proven: false },
    });
  });

  it("rejects a response claiming live proof without the supported evidence contract", async () => {
    const unverifiedEvidence = {
      ...evidenceFixture,
      live_sync_evidence: { status: "success", live_connection_proven: true, message: "unverified" },
    };
    mockRpcEvidence(unverifiedEvidence);
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/حالة مزامنة/);
  });

  it("fails closed if the sync-evidence RPC returns a different tenant", async () => {
    mockRpcEvidence(evidenceFixture, {
      ...syncEvidenceFixture,
      organization_id: "88888888-8888-4888-8888-888888888888",
    });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/لا يطابق المؤسسة/);
  });

  it("rejects server payloads which omit source identity instead of showing fabricated defaults", async () => {
    mockRpcEvidence({ snapshot: evidenceFixture.snapshot });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/غير مكتملة/);
  });

  it.each([
    ["attempt id", { id: malformedUuid }],
    ["attempt snapshot id", { snapshot_id: malformedUuid }],
    ["attempt order id", { order_id: malformedUuid }],
  ])("rejects a malformed UUID in the %s", async (_label, overrides) => {
    rpc
      .mockResolvedValueOnce({ data: evidenceFixture, error: null })
      .mockResolvedValueOnce({ data: liveSyncEvidence(startedAttempt(overrides)), error: null });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/معرّف محاولة مزامنة أونكس غير صالح/);
  });

  it("accepts structurally valid UUIDs in a pending attempt without inventing live proof", async () => {
    rpc
      .mockResolvedValueOnce({ data: evidenceFixture, error: null })
      .mockResolvedValueOnce({ data: liveSyncEvidence(startedAttempt()), error: null });
    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).resolves.toMatchObject({
      live_sync_evidence: {
        status: "not_proven",
        live_connection_proven: false,
        snapshot_sync_proven: false,
        last_sync_attempt: { status: "started", operation: "inventory_pull" },
      },
    });
  });
});
