import { describe, expect, it } from "vitest";
import type { EvidencePassport, EvidenceRecord, MetricSnapshot } from "./types";
import { buildClaimEvidencePassports, type ClaimDraft } from "./claim-evidence-passport";

const asOf = "2026-11-17T00:00:00.000Z";
const period = { from: "2026-10-01", to: "2026-10-31" };

function metric(id: string, key: string, evidenceId: string, overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    id, key, value: 120, unit: "CURRENCY", currency: "YER",
    status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
    period, asOf,
    lineage: {
      evidenceIds: [evidenceId], calculatedAt: asOf, formulaId: "test.formula", formulaVersion: "1",
      transformations: ["source aggregate"],
    },
    warnings: [],
    ...overrides,
  };
}

function record(
  id: string,
  name: string,
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    id,
    source: { kind: "TABLE", name, recordId: id + "-row", version: "1" },
    sourceTimestamp: "2026-11-16T23:00:00.000Z",
    asOf,
    period,
    currency: "YER",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
    ...overrides,
  };
}

function passport(metrics: MetricSnapshot[], evidenceRecords: EvidenceRecord[] = []): EvidencePassport {
  return {
    id: "passport",
    generatedAt: asOf,
    asOf,
    status: "VERIFIED",
    completeness: "COMPLETE",
    evidenceRecords,
    metrics,
    warnings: [],
  };
}

const oneMetricClaim = (kind: ClaimDraft["kind"] = "OBSERVATION"): ClaimDraft => ({
  id: "claim-1",
  statement: "الرصيد المستحق للفترة",
  kind,
  metricIds: ["metric-1"],
});

describe("claim evidence passports", () => {
  it("binds an observation to verified metrics, exact formulas and source record references without inventing confidence", () => {
    const built = buildClaimEvidencePassports(
      passport([metric("metric-1", "receivable.outstanding", "invoice-1")], [record("invoice-1", "customer_invoices")]),
      [oneMetricClaim()],
    );
    expect(built[0]).toMatchObject({
      requestedKind: "OBSERVATION",
      classification: "OBSERVATION",
      status: "VERIFIED",
      evidenceIds: ["invoice-1"],
      formulas: [{ metricId: "metric-1", formulaId: "test.formula", formulaVersion: "1" }],
      domains: ["FINANCE"],
      confidence: null,
      rawDrilldown: "SOURCE_REFERENCE_ONLY",
    });
    expect(built[0].boundaries).toContain("CLAIM_CONFIDENCE_NOT_SUPPLIED_BY_SOURCE");
    expect(built[0].boundaries).toContain("RAW_SOURCE_PAYLOAD_NOT_INCLUDED_SOURCE_REFERENCE_ONLY");
  });

  it("keeps a driver explicitly separate from a proven cause", () => {
    const built = buildClaimEvidencePassports(
      passport([metric("metric-1", "receivable.outstanding", "invoice-1")], [record("invoice-1", "customer_invoices")]),
      [oneMetricClaim("DRIVER")],
    );
    expect(built[0].classification).toBe("DRIVER");
    expect(built[0].causalStatus).toBe("NOT_APPLICABLE");
    expect(built[0].boundaries).toContain("DRIVER_IS_NOT_PROOF_OF_CAUSATION");
  });

  it("downgrades a claimed cause to a driver when no registered causal-study evidence exists", () => {
    const built = buildClaimEvidencePassports(
      passport([metric("metric-1", "receivable.outstanding", "invoice-1")], [record("invoice-1", "customer_invoices")]),
      [oneMetricClaim("CAUSE")],
    );
    expect(built[0]).toMatchObject({
      requestedKind: "CAUSE",
      classification: "DRIVER",
      causalStatus: "NOT_ESTABLISHED",
      status: "NEEDS_REVIEW",
    });
    expect(built[0].boundaries).toContain("CAUSE_NOT_ESTABLISHED_DRIVER_ONLY");
  });

  it("requires cross-domain review when a claim mixes finance and inventory evidence", () => {
    const built = buildClaimEvidencePassports(
      passport(
        [
          metric("metric-1", "receivable.outstanding", "invoice-1"),
          metric("metric-2", "inventory.on_hand", "stock-1", { unit: "QUANTITY", currency: undefined }),
        ],
        [record("invoice-1", "customer_invoices"), record("stock-1", "inventory_balances", { currency: undefined })],
      ),
      [{ id: "cross-domain", statement: "مطابقة التحصيل مع المخزون", kind: "DRIVER", metricIds: ["metric-1", "metric-2"] }],
    );
    expect(built[0].crossDomainReviewRequired).toBe(true);
    expect(built[0].reviewTags).toContain("CROSS-DOMAIN REVIEW REQUIRED");
    expect(built[0].status).toBe("NEEDS_REVIEW");
  });

  it("accepts a cause only with a separate verified causal-study source, two aligned measures and documented assumptions", () => {
    const studyRecord = record("causal-1", "causal_studies", {
      source: { kind: "CAUSAL_STUDY", name: "causal_studies", recordId: "study-1", version: "study-v1" },
    });
    const built = buildClaimEvidencePassports(
      passport(
        [
          metric("metric-1", "exposure.discount_rate", "invoice-1", { unit: "RATIO", currency: undefined }),
          metric("metric-2", "outcome.margin_rate", "ledger-1", { unit: "RATIO", currency: undefined }),
        ],
        [
          record("invoice-1", "customer_invoices", { currency: undefined }),
          record("ledger-1", "general_ledger", { currency: undefined }),
          studyRecord,
        ],
      ),
      [{
        id: "causal-claim",
        statement: "التجربة تثبت أثر الخصم على هامش الربح",
        kind: "CAUSE",
        metricIds: ["metric-1", "metric-2"],
        causalStudy: {
          evidenceIds: ["causal-1"],
          methodology: "difference-in-differences",
          design: "matched control group",
          assumptions: ["parallel trends"],
          confounderAssessment: "promotion season adjusted",
          verifiedAt: asOf,
          reviewedBy: "finance-reviewer",
          confidence: 0.82,
          confidenceBasis: "registered causal study",
        },
      }],
    );
    expect(built[0]).toMatchObject({
      classification: "CAUSE",
      causalStatus: "PROVEN",
      status: "VERIFIED",
      confidence: 0.82,
      confidenceBasis: "registered causal study",
    });
  });

  it("withholds an unsourced confidence score and refuses missing metrics", () => {
    const built = buildClaimEvidencePassports(
      passport([metric("metric-1", "receivable.outstanding", "invoice-1")], [record("invoice-1", "customer_invoices")]),
      [
        { ...oneMetricClaim(), confidence: { value: 0.94, basis: "" } },
        { id: "missing", statement: "ادعاء بلا مصدر", kind: "OBSERVATION", metricIds: ["unknown"] },
      ],
    );
    expect(built[0].confidence).toBeNull();
    expect(built[0].boundaries).toContain("CLAIM_CONFIDENCE_WITHHELD_INVALID_OR_UNSOURCED");
    expect(built[1].status).toBe("UNVERIFIED");
    expect(built[1].boundaries).toContain("CLAIM_METRIC_SOURCE_MISSING_OR_AMBIGUOUS");
  });
});
