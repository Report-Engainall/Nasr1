import { supabase } from "@/lib/supabase";

export type OnyxSnapshotSourceEvidence = {
  organization: { id: string; name: string };
  snapshot: {
    id: string;
    source_import_job_id: string | null;
    source_file_name: string | null;
    source_file_hash: string;
    report_type: string;
    period_key: string | null;
    snapshot_version: number;
    created_at: string;
    row_count: number;
  };
  import_job: null | {
    id: string;
    source_system: string | null;
    job_type: string | null;
    status: string;
    file_name: string | null;
    file_hash: string;
    period_key: string | null;
    created_at: string;
    updated_at: string | null;
    error_code: string | null;
    file_hash_matches_snapshot: boolean;
  };
  source_identity: {
    external_id_examples: Array<{ row_number: number; canonical_key: string; canonical_key_truncated: boolean; external_ids: Record<string, string>; value_truncated: boolean }>;
    external_id_examples_truncated: boolean;
    provenance_status: "snapshot_without_import_job" | "linked_import_job_unavailable" | "linked_hash_mismatch" | "linked_import_job_hash_match";
    source_system: string | null;
    source_record_id: string | null;
    source_row_count: number;
    external_id_fields_found: string[];
    rows_with_external_id: number;
  };
  live_sync_evidence: {
    status: "not_proven";
    live_connection_proven: false;
    message: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("بيانات تتبع مصدر أونكس غير صالحة: " + field);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("بيانات تتبع مصدر أونكس غير صالحة: " + field);
  return value;
}

export async function fetchOnyxSnapshotSourceEvidence(snapshotId: string): Promise<OnyxSnapshotSourceEvidence> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshotId)) {
    throw new Error("معرّف لقطة أونكس غير صالح.");
  }
  const { data, error } = await supabase.rpc("get_onyx_snapshot_source_evidence", { p_snapshot_id: snapshotId });
  if (error) throw new Error("تعذر قراءة أدلة مصدر أونكس: " + error.message);
  if (!isRecord(data) || !isRecord(data.organization) || !isRecord(data.snapshot) || !isRecord(data.source_identity) || !isRecord(data.live_sync_evidence)) {
    throw new Error("أعاد الخادم أدلة مصدر أونكس غير مكتملة؛ لم يتم افتراض أي قيم.");
  }
  if (typeof data.organization.id !== "string" || !data.organization.id || typeof data.organization.name !== "string" || !data.organization.name.trim()) {
    throw new Error("هوية المؤسسة المرتبطة بمصدر أونكس غير مكتملة.");
  }

  const rawSnapshot = data.snapshot;
  if (
    rawSnapshot.id !== snapshotId ||
    typeof rawSnapshot.source_file_hash !== "string" ||
    typeof rawSnapshot.report_type !== "string" ||
    typeof rawSnapshot.snapshot_version !== "number" ||
    !Number.isInteger(rawSnapshot.snapshot_version) ||
    rawSnapshot.snapshot_version < 1 ||
    typeof rawSnapshot.created_at !== "string"
  ) {
    throw new Error("لا تطابق بيانات المصدر اللقطة المحددة.");
  }

  let importJob: OnyxSnapshotSourceEvidence["import_job"] = null;
  if (data.import_job != null) {
    if (!isRecord(data.import_job)) throw new Error("مرجع دفعة الاستيراد غير صالح.");
    const job = data.import_job;
    if (
      typeof job.id !== "string" ||
      typeof job.status !== "string" ||
      typeof job.file_hash !== "string" ||
      typeof job.created_at !== "string" ||
      typeof job.file_hash_matches_snapshot !== "boolean"
    ) throw new Error("بيانات دفعة الاستيراد غير مكتملة.");
    importJob = {
      id: job.id,
      source_system: nullableString(job.source_system, "source_system"),
      job_type: nullableString(job.job_type, "job_type"),
      status: job.status,
      file_name: nullableString(job.file_name, "file_name"),
      file_hash: job.file_hash,
      period_key: nullableString(job.period_key, "period_key"),
      created_at: job.created_at,
      updated_at: nullableString(job.updated_at, "updated_at"),
      error_code: nullableString(job.error_code, "error_code"),
      file_hash_matches_snapshot: job.file_hash_matches_snapshot,
    };
  }

  const identity = data.source_identity;
  const allowedProvenance = new Set([
    "snapshot_without_import_job",
    "linked_import_job_unavailable",
    "linked_hash_mismatch",
    "linked_import_job_hash_match",
  ]);
  if (typeof identity.provenance_status !== "string" || !allowedProvenance.has(identity.provenance_status)) {
    throw new Error("حالة مصدر أونكس غير معروفة؛ لم يتم تصنيفها تلقائيًا.");
  }
  if (!Array.isArray(identity.external_id_fields_found) || identity.external_id_fields_found.some((x) => typeof x !== "string")) {
    throw new Error("قائمة حقول المعرّفات الخارجية غير صالحة.");
  }
  if (typeof identity.external_id_examples_truncated !== "boolean" || !Array.isArray(identity.external_id_examples)) {
    throw new Error("عينة المعرّفات الخارجية غير مكتملة.");
  }
  const externalIdExamples = identity.external_id_examples.map((example) => {
    if (
      !isRecord(example) ||
      typeof example.row_number !== "number" || !Number.isInteger(example.row_number) || example.row_number < 1 ||
      typeof example.canonical_key !== "string" ||
      typeof example.canonical_key_truncated !== "boolean" ||
      typeof example.value_truncated !== "boolean" ||
      !isRecord(example.external_ids) ||
      Object.values(example.external_ids).some((value) => typeof value !== "string")
    ) throw new Error("صف المعرّفات الخارجية غير صالح.");
    return {
      row_number: example.row_number,
      canonical_key: example.canonical_key,
      canonical_key_truncated: example.canonical_key_truncated,
      external_ids: example.external_ids as Record<string, string>,
      value_truncated: example.value_truncated,
    };
  });
  const sync = data.live_sync_evidence;
  if (sync.status !== "not_proven" || sync.live_connection_proven !== false || typeof sync.message !== "string") {
    throw new Error("رفض الخادم حالة مزامنة غير مدعومة بالدليل.");
  }

  return {
    organization: { id: data.organization.id, name: data.organization.name },
    snapshot: {
      id: rawSnapshot.id,
      source_import_job_id: nullableString(rawSnapshot.source_import_job_id, "source_import_job_id"),
      source_file_name: nullableString(rawSnapshot.source_file_name, "source_file_name"),
      source_file_hash: rawSnapshot.source_file_hash,
      report_type: rawSnapshot.report_type,
      period_key: nullableString(rawSnapshot.period_key, "period_key"),
      snapshot_version: rawSnapshot.snapshot_version,
      created_at: rawSnapshot.created_at,
      row_count: nonnegativeInteger(rawSnapshot.row_count, "row_count"),
    },
    import_job: importJob,
    source_identity: {
      provenance_status: identity.provenance_status as OnyxSnapshotSourceEvidence["source_identity"]["provenance_status"],
      source_system: nullableString(identity.source_system, "source_system"),
      source_record_id: nullableString(identity.source_record_id, "source_record_id"),
      source_row_count: nonnegativeInteger(identity.source_row_count, "source_row_count"),
      external_id_fields_found: identity.external_id_fields_found as string[],
      external_id_examples: externalIdExamples,
      external_id_examples_truncated: identity.external_id_examples_truncated,
      rows_with_external_id: nonnegativeInteger(identity.rows_with_external_id, "rows_with_external_id"),
    },
    live_sync_evidence: {
      status: "not_proven",
      live_connection_proven: false,
      message: sync.message,
    },
  };
}
