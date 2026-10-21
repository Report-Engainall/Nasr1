import { describe, expect, it } from "vitest";
import { buildOnyxSourceEvidenceCsv } from "@/lib/onyx-source-evidence-export";
import type { OnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const evidence: OnyxSnapshotSourceEvidence = {
  organization: { id: "99999999-9999-4999-8999-999999999999", name: "=2+2" },
  snapshot: {
    id: "22222222-2222-4222-8222-222222222222",
    source_import_job_id: "11111111-1111-4111-8111-111111111111",
    source_file_name: "stock.csv",
    source_file_hash: "a".repeat(64),
    report_type: "inventory_stock",
    period_key: "2026-10",
    snapshot_version: 2,
    created_at: "2026-10-20T12:00:00.000Z",
    row_count: 3,
  },
  import_job: {
    id: "11111111-1111-4111-8111-111111111111",
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
    external_id_fields_found: ["external_id"],
    external_id_examples: [{
      row_number: 1,
      canonical_key: 'SKU, "A"',
      canonical_key_truncated: false,
      external_ids: { external_id: "\t@SUM(1,1)" },
      value_truncated: false,
    }],
    external_id_examples_truncated: false,
    rows_with_external_id: 1,
  },
  live_sync_evidence: {
    status: "not_proven",
    live_connection_proven: false,
    message: "Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.",
  },
};

describe("Onyx source evidence CSV export", () => {
  it("exports only supplied, authorized evidence with clear unavailable and live-sync states", () => {
    const csv = buildOnyxSourceEvidenceCsv(evidence);
    expect(csv.startsWith('"section","record_index","field","value","canonical_key"\r\n')).toBe(true);
    expect(csv).toContain('"organization","","name","\'=2+2",""');
    expect(csv).toContain('"import_job","","updated_at","NOT_RECORDED",""');
    expect(csv).toContain('"source_identity","","source_record_id","NOT_AVAILABLE",""');
    expect(csv).toContain('"external_id_sample","1","external_id.external_id","\'\t@SUM(1,1)","SKU, ""A"""');
    expect(csv).toContain('"live_sync_evidence","","status","not_proven",""');
    expect(csv).toContain('"live_sync_evidence","","live_connection_proven","false",""');
    expect(csv).toContain('"live_sync_evidence","","last_live_sync_at","NOT_AVAILABLE_IN_EVIDENCE_MODEL",""');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("does not imply an external source record or live sync from a missing import link", () => {
    const withoutImport: OnyxSnapshotSourceEvidence = {
      ...evidence,
      snapshot: { ...evidence.snapshot, source_import_job_id: null },
      import_job: null,
      source_identity: { ...evidence.source_identity, source_record_id: null, source_system: null },
    };
    const csv = buildOnyxSourceEvidenceCsv(withoutImport);
    expect(csv).toContain('"import_job","","status","NOT_AVAILABLE",""');
    expect(csv).toContain('"source_identity","","source_system","NOT_RECORDED",""');
    expect(csv).toContain('"source_identity","","source_record_id","NOT_AVAILABLE",""');
    expect(csv).toContain('"live_sync_evidence","","live_connection_proven","false",""');
  });
});
