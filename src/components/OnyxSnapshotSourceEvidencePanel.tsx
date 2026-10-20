import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import {
  fetchOnyxSnapshotSourceEvidence,
  type OnyxSnapshotSourceEvidence,
} from "@/lib/onyx-source-evidence";

function dateText(value: string | null | undefined): string {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "تاريخ غير صالح" : date.toLocaleString("ar-YE");
}

const provenanceLabels: Record<OnyxSnapshotSourceEvidence["source_identity"]["provenance_status"], string> = {
  snapshot_without_import_job: "لقطة محفوظة بلا مرجع دفعة استيراد",
  linked_import_job_unavailable: "مرجع دفعة الاستيراد غير متاح ضمن المؤسسة الحالية",
  linked_hash_mismatch: "تحذير: بصمة اللقطة تختلف عن بصمة دفعة الاستيراد",
  linked_import_job_hash_match: "مرجع دفعة الاستيراد موجود والبصمة متطابقة",
};

function sourceSystemLabel(value: string | null): string {
  if (!value) return "غير مسجل";
  if (value === "manual") return "استيراد ملف يدوي";
  if (value.toLocaleLowerCase("en") === "onyx") return "وسم المصدر Onyx (لا يثبت اتصالًا حيًا)";
  return value;
}

export function OnyxSnapshotSourceEvidencePanel({ snapshotId }: { snapshotId: string }) {
  const [evidence, setEvidence] = useState<OnyxSnapshotSourceEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setEvidence(null);
    setError("");
    setLoading(true);
    void fetchOnyxSnapshotSourceEvidence(snapshotId)
      .then((result) => { if (active) setEvidence(result); })
      .catch(() => { if (active) setError("تعذر تحميل أدلة المصدر لهذه اللقطة. تحقق من صلاحية المؤسسة ثم أعد المحاولة."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [snapshotId]);

  return (
    <section className="panel" dir="rtl" aria-label="أدلة هوية مصدر أونكس" style={{ marginBlock: 14, padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>هوية المصدر وأدلة الاستيراد</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.82 }}>مطابقة محفوظة بين اللقطة ودفعة الاستيراد؛ لا تُثبت اتصال أونكس حيًا.</p>
        </div>
      </header>
      {loading ? <p role="status">جار قراءة سجل مصدر اللقطة من قاعدة البيانات…</p> : null}
      {error ? <p role="alert" style={{ color: "var(--destructive, #b42318)" }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{error}</p> : null}
      {!loading && !error && evidence ? (
        <>
          <div className="onyx-source-metadata">
            <span><strong>المؤسسة الفعالة من قاعدة البيانات:</strong> <span data-testid="onyx-evidence-organization-name">{evidence.organization.name}</span> · <code>{evidence.organization.id}</code></span>
            <span><strong>حالة إثبات المنشأ:</strong> {provenanceLabels[evidence.source_identity.provenance_status]}</span>
            <span><strong>نظام المصدر المسجل:</strong> {sourceSystemLabel(evidence.source_identity.source_system)}</span>
            <span><strong>معرّف سجل المصدر:</strong> <code>{evidence.source_identity.source_record_id || "غير متاح"}</code></span>
            <span><strong>صفوف المصدر المقروءة:</strong> {evidence.source_identity.source_row_count}</span>
            <span><strong>صفوف بها حقول معرّف خارجي مرشحة:</strong> {evidence.source_identity.rows_with_external_id}</span>
            <span><strong>حقول المعرّف الخارجي المكتشفة:</strong> {evidence.source_identity.external_id_fields_found.length ? evidence.source_identity.external_id_fields_found.join("، ") : "لم يُكتشف حقل معرّف خارجي صريح"}</span>
          </div>
          {evidence.import_job ? (
            <div className="onyx-source-metadata" style={{ marginTop: 10 }}>
              <span><strong>دفعة الاستيراد:</strong> <code>{evidence.import_job.id}</code></span>
              <span><strong>ملف الدفعة:</strong> {evidence.import_job.file_name || "اسم الملف غير مسجل"}</span>
              <span><strong>نوع الدفعة:</strong> {evidence.import_job.job_type || "غير مسجل"}</span>
              <span><strong>حالة الدفعة:</strong> {evidence.import_job.status}</span>
              <span><strong>وقت إنشاء الدفعة:</strong> {dateText(evidence.import_job.created_at)}</span>
              <span><strong>آخر تحديث للدفعة:</strong> {dateText(evidence.import_job.updated_at)}</span>
              <span><strong>تطابق بصمة الملف:</strong> {evidence.import_job.file_hash_matches_snapshot ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />متطابقة</> : <><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />غير متطابقة</>}</span>
              <span><strong>رمز خطأ الاستيراد المسجل:</strong> {evidence.import_job.error_code || "لا يوجد رمز خطأ محفوظ"}</span>
            </div>
          ) : (
            <p role="status">لا يوجد مرجع دفعة استيراد متاح لهذه اللقطة. لا يُفترض مصدر بديل.</p>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 12, padding: 12, border: "1px solid var(--border, #d8e0e0)", borderRadius: 10 }}>
            <strong><Database size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />حالة الاتصال والمزامنة الحية</strong>
            <span><strong>الحالة:</strong> غير مثبتة بأدلة هذا السجل</span>
            <span>وجود لقطة أو دفعة استيراد محفوظة لا يثبت اتصالًا حيًا أو اكتمال مزامنة من واجهة Onyx API.</span>
            <span><Clock3 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />وقت آخر مزامنة حية: غير متاح في نموذج الأدلة الحالي</span>
            <span><Fingerprint size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />بصمة اللقطة: <code>{evidence.snapshot.source_file_hash}</code></span>
            <span><Link2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />وقت حفظ اللقطة: {dateText(evidence.snapshot.created_at)} · الإصدار {evidence.snapshot.snapshot_version}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}
