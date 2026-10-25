import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchOnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const organizationId = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const malformedUuid = "------------------------------------";

const sourceEvidence = {
  organization: { id: organizationId, name: "CI organization" },
  snapshot: {
    id: snapshotId,
    source_import_job_id: null,
    source_file_name: "onyx.csv",
    source_file_hash: "a".repeat(64),
    report_type: "inventory_stock",
    period_key: null,
    snapshot_version: 1,
    created_at: "2026-10-25T00:00:00.000Z",
    row_count: 1,
  },
  import_job: null,
  source_identity: {
    external_id_examples: [],
    external_id_examples_truncated: false,
    provenance_status: "snapshot_without_import_job",
    source_system: "onyx",
    source_record_id: null,
    source_row_count: 1,
    external_id_fields_found: [],
    rows_with_external_id: 0,
  },
  live_sync_evidence: {
    status: "not_proven",
    live_connection_proven: false,
    message: "No live provider response has been proven.",
  },
};

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
    id: attemptId,
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

describe("Onyx source evidence UUID contracts", () => {
  it.each([
    ["attempt id", { id: malformedUuid }],
    ["attempt snapshot id", { snapshot_id: malformedUuid }],
    ["attempt order id", { order_id: malformedUuid }],
  ])("rejects a malformed UUID in the %s", async (_label, overrides) => {
    rpc
      .mockResolvedValueOnce({ data: sourceEvidence, error: null })
      .mockResolvedValueOnce({ data: liveSyncEvidence(startedAttempt(overrides)), error: null });

    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).rejects.toThrow(/معرّف محاولة مزامنة أونكس غير صالح/);
  });

  it("accepts structurally valid UUIDs in a pending attempt", async () => {
    rpc
      .mockResolvedValueOnce({ data: sourceEvidence, error: null })
      .mockResolvedValueOnce({ data: liveSyncEvidence(startedAttempt()), error: null });

    await expect(fetchOnyxSnapshotSourceEvidence(snapshotId)).resolves.toMatchObject({
      live_sync_evidence: {
        live_connection_proven: false,
        snapshot_sync_proven: false,
        last_sync_attempt: { id: attemptId, status: "started", operation: "inventory_pull" },
      },
    });
  });
});
