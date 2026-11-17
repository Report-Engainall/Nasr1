import type {
  EvidencePassport,
  EvidencePeriod,
  EvidenceRecord,
  EvidenceStatus,
  MetricSnapshot,
} from "./types";

export type ClaimKind = "OBSERVATION" | "DRIVER" | "CAUSE";
export type ClaimDomain =
  | "FINANCE"
  | "PROCUREMENT"
  | "INVENTORY"
  | "COMMERCE"
  | "CUSTOMER"
  | "CATALOG"
  | "AI"
  | "SYSTEM"
  | "UNKNOWN";

export interface ClaimConfidence {
  value: number;
  basis: string;
  evidenceIds: string[];
}

export interface CausalStudyEvidence {
  evidenceIds: string[];
  methodology: string;
  design: string;
  assumptions: string[];
  confounderAssessment: string;
  verifiedAt: string;
  reviewedBy: string;
  confidence: number;
  confidenceBasis: string;
}

export interface ClaimDraft {
  id: string;
  statement: string;
  kind: ClaimKind;
  metricIds: string[];
  confidence?: ClaimConfidence | null;
  boundaries?: string[];
  causalStudy?: CausalStudyEvidence | null;
}

export interface ClaimEvidencePassport {
  id: string;
  statement: string;
  requestedKind: ClaimKind;
  classification: ClaimKind;
  causalStatus: "NOT_APPLICABLE" | "NOT_ESTABLISHED" | "PROVEN";
  status: EvidenceStatus;
  metricIds: string[];
  evidenceIds: string[];
  metrics: MetricSnapshot[];
  sourceRecords: EvidenceRecord[];
  formulas: Array<{ metricId: string; formulaId: string; formulaVersion: string }>;
  domains: ClaimDomain[];
  crossDomainReviewRequired: boolean;
  reviewTags: string[];
  confidence: number | null;
  confidenceBasis: string | null;
  boundaries: string[];
  rawDrilldown: "SOURCE_REFERENCE_ONLY";
}

const SOURCE_DOMAIN: Record<string, ClaimDomain> = {
  customer_invoices: "FINANCE",
  customer_invoice_payments: "FINANCE",
  customer_payments: "FINANCE",
  supplier_payment_open_receipts: "FINANCE",
  purchase_supplier_invoices: "FINANCE",
  purchase_supplier_invoice_due_dates: "FINANCE",
  general_ledger: "FINANCE",
  cash_expenses: "FINANCE",
  cash_opening_balances: "FINANCE",
  cash_bank_reconciliations: "FINANCE",
  finance_cash_opening_balances: "FINANCE",
  finance_bank_reconciliations: "FINANCE",
  inventory_balances: "INVENTORY",
  inventory_movements: "INVENTORY",
  stock_movements: "INVENTORY",
  stock_count_lines: "INVENTORY",
  warehouses: "INVENTORY",
  purchase_receipt_items: "INVENTORY",
  purchase_orders: "PROCUREMENT",
  purchase_order_items: "PROCUREMENT",
  suppliers: "PROCUREMENT",
  orders: "COMMERCE",
  order_items: "COMMERCE",
  product_reviews: "COMMERCE",
  product_questions: "COMMERCE",
  customers: "CUSTOMER",
  customer_profiles: "CUSTOMER",
  customer_interactions: "CUSTOMER",
  products: "CATALOG",
  product_categories: "CATALOG",
  ai_usage_ledger_attempts: "AI",
  ai_prompt_versions: "AI",
  system_health_probes: "SYSTEM",
};

const unique = (values: string[]): string[] => [...new Set(values.filter((value) => value.trim().length > 0))];
const validTime = (value: string): boolean => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
const validConfidence = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

function atLeastReview(status: EvidenceStatus): EvidenceStatus {
  return status === "VERIFIED" ? "NEEDS_REVIEW" : status;
}

function rollupStatus(metrics: MetricSnapshot[]): EvidenceStatus {
  if (!metrics.length) return "UNVERIFIED";
  if (metrics.some((metric) => metric.status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (metrics.some((metric) => metric.status === "UNVERIFIED")) return "UNVERIFIED";
  if (metrics.some((metric) => metric.status === "NEEDS_REVIEW")) return "NEEDS_REVIEW";
  if (metrics.some((metric) => metric.completeness !== "COMPLETE" || metric.quality !== "ACCEPTABLE")) return "NEEDS_REVIEW";
  return "VERIFIED";
}

function samePeriod(left: EvidencePeriod | null, right: EvidencePeriod | null): boolean {
  if (left === null || right === null) return left === right;
  return left.from === right.from && left.to === right.to;
}

function domainOf(record: EvidenceRecord): ClaimDomain {
  const name = record.source.name.trim().toLowerCase();
  const mapped = SOURCE_DOMAIN[name];
  if (mapped) return mapped;
  if (/(^|_)(inventory|stock|warehouse)(_|$)/.test(name)) return "INVENTORY";
  if (/(^|_)(purchase_order|supplier|procurement)(_|$)/.test(name)) return "PROCUREMENT";
  if (/(^|_)(invoice|payment|ledger|cash|bank|receivable|payable)(_|$)/.test(name)) return "FINANCE";
  if (/(^|_)(customer|retention|support|service)(_|$)/.test(name)) return "CUSTOMER";
  if (/(^|_)(order|checkout|commerce|cart)(_|$)/.test(name)) return "COMMERCE";
  if (/(^|_)(product|catalog|category)(_|$)/.test(name)) return "CATALOG";
  if (/(^|_)ai(_|$)/.test(name)) return "AI";
  if (/(^|_)(system|probe|queue|job)(_|$)/.test(name)) return "SYSTEM";
  return "UNKNOWN";
}

function validClaimConfidence(
  confidence: ClaimConfidence | null | undefined,
  metrics: MetricSnapshot[],
  passport: EvidencePassport,
  recordsById: Map<string, EvidenceRecord>,
  duplicateEvidenceIds: Set<string>,
): boolean {
  if (!confidence || !validConfidence(confidence.value) || !confidence.basis.trim() ||
      !confidence.evidenceIds.length || new Set(confidence.evidenceIds).size !== confidence.evidenceIds.length ||
      confidence.evidenceIds.some((id) => duplicateEvidenceIds.has(id))) return false;
  const sources = confidence.evidenceIds.map((id) => recordsById.get(id));
  if (sources.some((source) => !source)) return false;
  const first = metrics[0];
  return (sources as EvidenceRecord[]).every((source) =>
    source.status === "VERIFIED" &&
    source.completeness === "COMPLETE" &&
    source.quality === "ACCEPTABLE" &&
    source.asOf === passport.asOf &&
    validTime(source.sourceTimestamp) &&
    Date.parse(source.sourceTimestamp) <= Date.parse(passport.asOf) &&
    (!first || samePeriod(source.period, first.period))
  );
}

function validCausalStudy(
  draft: ClaimDraft,
  metrics: MetricSnapshot[],
  passport: EvidencePassport,
  recordsById: Map<string, EvidenceRecord>,
): boolean {
  const study = draft.causalStudy;
  if (!study || metrics.length < 2 || !study.methodology.trim() || !study.design.trim() ||
      !study.assumptions.some((item) => item.trim()) || !study.confounderAssessment.trim() ||
      !study.reviewedBy.trim() || !validTime(study.verifiedAt) ||
      Date.parse(study.verifiedAt) > Date.parse(passport.asOf) ||
      !validConfidence(study.confidence) || !study.confidenceBasis.trim() ||
      !study.evidenceIds.length || new Set(study.evidenceIds).size !== study.evidenceIds.length) {
    return false;
  }

  const first = metrics[0];
  if (metrics.some((metric) =>
    metric.status !== "VERIFIED" ||
    metric.completeness !== "COMPLETE" ||
    metric.quality !== "ACCEPTABLE" ||
    metric.asOf !== first.asOf ||
    !samePeriod(metric.period, first.period) ||
    ((metric.unit === "CURRENCY" || metric.unit === "CURRENCY_PER_UNIT") &&
      metric.currency !== first.currency)
  )) return false;

  return study.evidenceIds.every((id) => {
    const source = recordsById.get(id);
    return Boolean(source &&
      source.source.kind === "CAUSAL_STUDY" &&
      source.source.name === "causal_studies" &&
      Boolean(source.source.recordId?.trim()) &&
      Boolean(source.source.version?.trim()) &&
      source.status === "VERIFIED" &&
      source.completeness === "COMPLETE" &&
      source.quality === "ACCEPTABLE" &&
      source.asOf === passport.asOf &&
      validTime(source.sourceTimestamp) &&
      Date.parse(source.sourceTimestamp) <= Date.parse(passport.asOf) &&
      samePeriod(source.period, first.period));
  });
}

/**
 * Builds a source-bounded passport for every report claim.
 * A driver is never promoted to a cause from correlation or a rule trigger.
 * Raw source payloads are not fabricated: only authorized source references are returned.
 */
export function buildClaimEvidencePassports(
  passport: EvidencePassport,
  drafts: ClaimDraft[],
): ClaimEvidencePassport[] {
  const metricById = new Map<string, MetricSnapshot>();
  const duplicateMetricIds = new Set<string>();
  for (const metric of passport.metrics) {
    if (metricById.has(metric.id)) duplicateMetricIds.add(metric.id);
    else metricById.set(metric.id, metric);
  }

  const recordsById = new Map<string, EvidenceRecord>();
  const duplicateEvidenceIds = new Set<string>();
  for (const record of passport.evidenceRecords) {
    if (recordsById.has(record.id)) duplicateEvidenceIds.add(record.id);
    else recordsById.set(record.id, record);
  }

  const duplicateDraftIds = new Set<string>();
  const seenDraftIds = new Set<string>();
  for (const draft of drafts) {
    if (seenDraftIds.has(draft.id)) duplicateDraftIds.add(draft.id);
    seenDraftIds.add(draft.id);
  }

  return drafts.map((draft) => {
    const boundaries = unique([...(draft.boundaries ?? [])]);
    const requestedMetricIds = unique(draft.metricIds);
    const metricReferencesDuplicated = requestedMetricIds.length !== draft.metricIds.length;
    const metrics = requestedMetricIds.map((id) => metricById.get(id)).filter((metric): metric is MetricSnapshot => Boolean(metric));
    const metricMissing = metrics.length !== requestedMetricIds.length || requestedMetricIds.some((id) => duplicateMetricIds.has(id));
    const primaryEvidenceIds = unique([
      ...metrics.flatMap((metric) => metric.lineage.evidenceIds),
      ...(draft.kind === "CAUSE" ? (draft.causalStudy?.evidenceIds ?? []) : []),
    ]);
    const confidenceIsVerified = validClaimConfidence(draft.confidence, metrics, passport, recordsById, duplicateEvidenceIds);
    const evidenceIds = unique([
      ...primaryEvidenceIds,
      ...(confidenceIsVerified ? (draft.confidence?.evidenceIds ?? []) : []),
    ]);
    const sourceRecords = evidenceIds
      .map((id) => recordsById.get(id))
      .filter((record): record is EvidenceRecord => Boolean(record));
    const evidenceMissing = sourceRecords.length !== evidenceIds.length ||
      evidenceIds.some((id) => duplicateEvidenceIds.has(id));
    const formulas = metrics
      .filter((metric) => metric.lineage.formulaId.trim() && metric.lineage.formulaVersion.trim())
      .map((metric) => ({
        metricId: metric.id,
        formulaId: metric.lineage.formulaId,
        formulaVersion: metric.lineage.formulaVersion,
      }));
    const domainSources = sourceRecords.filter((record) => record.source.kind !== "CAUSAL_STUDY");
    const knownDomains = unique(domainSources.map(domainOf).filter((domain) => domain !== "UNKNOWN")) as ClaimDomain[];
    const unmappedSources = domainSources.filter((record) => domainOf(record) === "UNKNOWN");
    const domains = knownDomains.length ? knownDomains : sourceRecords.length ? ["UNKNOWN" as const] : [];
    const crossDomainReviewRequired = knownDomains.length > 1 ||
      (knownDomains.length > 0 && unmappedSources.length > 0);
    const reviewTags = crossDomainReviewRequired ? ["CROSS-DOMAIN REVIEW REQUIRED"] : [];
    let status = rollupStatus(metrics);
    let classification: ClaimKind = draft.kind;
    let causalStatus: ClaimEvidencePassport["causalStatus"] = draft.kind === "CAUSE" ? "NOT_ESTABLISHED" : "NOT_APPLICABLE";

    if (duplicateDraftIds.has(draft.id) || metricReferencesDuplicated || !draft.statement.trim() || !requestedMetricIds.length) {
      status = "UNVERIFIED";
      boundaries.push("CLAIM_OR_METRIC_REFERENCE_INVALID");
    }
    if (metricMissing || evidenceMissing) {
      status = "UNVERIFIED";
      boundaries.push(metricMissing ? "CLAIM_METRIC_SOURCE_MISSING_OR_AMBIGUOUS" : "CLAIM_EVIDENCE_SOURCE_MISSING_OR_AMBIGUOUS");
    }
    if (metrics.some((metric) => metrics[0] && !samePeriod(metric.period, metrics[0].period))) {
      status = atLeastReview(status);
      boundaries.push("CLAIM_METRIC_PERIOD_MISMATCH");
    }
    const currencyMetrics = metrics.filter((metric) => metric.unit === "CURRENCY" || metric.unit === "CURRENCY_PER_UNIT");
    if (new Set(currencyMetrics.map((metric) => metric.currency ?? "UNSPECIFIED")).size > 1) {
      status = "UNVERIFIED";
      boundaries.push("CLAIM_CURRENCY_CONFLICT");
    }
    if (crossDomainReviewRequired) {
      status = atLeastReview(status);
      boundaries.push("CLAIM_SPANS_MULTIPLE_OR_UNMAPPED_DOMAINS");
    } else if (unmappedSources.length) {
      status = atLeastReview(status);
      boundaries.push("CLAIM_SOURCE_DOMAIN_UNMAPPED");
    }
    if (draft.kind === "DRIVER") {
      boundaries.push("DRIVER_IS_NOT_PROOF_OF_CAUSATION");
    }
    if (draft.kind === "CAUSE") {
      if (validCausalStudy(draft, metrics, passport, recordsById) && status === "VERIFIED" && !crossDomainReviewRequired) {
        classification = "CAUSE";
        causalStatus = "PROVEN";
      } else {
        classification = "DRIVER";
        causalStatus = "NOT_ESTABLISHED";
        status = atLeastReview(status);
        boundaries.push("CAUSE_NOT_ESTABLISHED_DRIVER_ONLY");
      }
    }

    let confidence: number | null = null;
    let confidenceBasis: string | null = null;
    if (draft.kind === "CAUSE" && causalStatus === "PROVEN" && draft.causalStudy) {
      confidence = draft.causalStudy.confidence;
      confidenceBasis = draft.causalStudy.confidenceBasis.trim();
    } else if (draft.confidence) {
      if (confidenceIsVerified) {
        confidence = draft.confidence.value;
        confidenceBasis = draft.confidence.basis.trim();
      } else {
        boundaries.push("CLAIM_CONFIDENCE_WITHHELD_INVALID_OR_UNSOURCED");
      }
    } else {
      boundaries.push("CLAIM_CONFIDENCE_NOT_SUPPLIED_BY_SOURCE");
    }

    if (!draft.statement.trim()) boundaries.push("CLAIM_STATEMENT_MISSING");
    if (metrics.some((metric) => !metric.lineage.formulaId.trim() || !metric.lineage.formulaVersion.trim())) {
      boundaries.push("CLAIM_FORMULA_LINEAGE_INCOMPLETE");
    }
    boundaries.push("RAW_SOURCE_PAYLOAD_NOT_INCLUDED_SOURCE_REFERENCE_ONLY");

    return {
      id: draft.id,
      statement: draft.statement.trim() || "ادعاء غير معرّف",
      requestedKind: draft.kind,
      classification,
      causalStatus,
      status,
      metricIds: requestedMetricIds,
      evidenceIds,
      metrics,
      sourceRecords,
      formulas,
      domains,
      crossDomainReviewRequired,
      reviewTags,
      confidence,
      confidenceBasis,
      boundaries: unique(boundaries),
      rawDrilldown: "SOURCE_REFERENCE_ONLY",
    };
  });
}
