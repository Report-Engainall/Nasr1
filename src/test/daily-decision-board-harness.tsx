import "../styles.css";
import { createRoot } from "react-dom/client";
import { DailyDecisionBoard } from "@/components/intelligence/DailyDecisionBoard";
import type { DecisionMemoryBookResult, DecisionMemoryRecord } from "@/lib/intelligence/decision-memory";

const sharedDecisionFields: Omit<DecisionMemoryRecord, "decisionId" | "proposedResult"> = {
  candidateRef: "candidate:mobile-browser-acceptance",
  ruleId: "operations.review",
  ruleVersion: "1.0.0",
  state: "PROPOSED",
  version: 1,
  createdAt: "2026-11-06T08:00:00.000Z",
  updatedAt: "2026-11-06T08:00:00.000Z",
  owner: "مدير العمليات",
  ownerProfileId: null,
  decisionReason: "سبب محفوظ للقرار ويجب أن يلتف داخل عرض الهاتف دون توسيع الصفحة.",
  approvalAt: null,
  executionAt: null,
  eventCount: 0,
  events: [],
  legacyMeasurement: null,
  snapshotVersion: null,
  capturedAt: null,
  snapshot: null,
  problem: "مراجعة استثناء تشغيلي محفوظ واختبار التفاف النص العربي على عرض محدود.",
  factsReviewed: false,
  facts: [],
  opinions: [],
  hypotheses: [],
  assumptionsReviewed: false,
  assumptions: [],
  lessonsReviewed: false,
  withheldFacts: 0,
  alternatives: [],
  chosenAlternative: null,
  actionTaken: null,
  reviewDisposition: "NOT_SCHEDULED",
  reviewAt: null,
  expectedMetric: null,
  metricComparison: {
    status: "WITHHELD",
    expected: null,
    actual: null,
    difference: null,
    differencePercent: null,
    reason: "لا يوجد خط أساس محفوظ لهذا القرار التجريبي.",
  },
  lessons: [],
  corrections: [],
  missingFields: ["REVIEW_DISPOSITION", "REVIEW_DATE", "EXPECTED_METRIC", "ACTUAL_METRIC"],
  warnings: [],
  memoryStatus: "PARTIAL",
  precedents: [],
};

const records: DecisionMemoryRecord[] = [
  {
    ...sharedDecisionFields,
    decisionId: "decision-z-browser",
    proposedResult: "قرار اختبار Z — الترتيب ثابت حتى عندما تتساوى حقول المتابعة والتاريخ والانحراف المثبت.",
  },
  {
    ...sharedDecisionFields,
    decisionId: "decision-a-browser",
    proposedResult: "قرار اختبار A — عنوان عربي طويل لا يتسبب في تجاوز عرض الشاشة على الهاتف.",
  },
];

const result: DecisionMemoryBookResult = {
  generatedAt: "2026-11-06T08:00:00.000Z",
  policyVersion: "1.0.0",
  status: "PARTIAL",
  loadedCount: records.length,
  totalCount: records.length,
  completeCount: 0,
  partialCount: records.length,
  measuredCount: 0,
  verifiedMeasurementCount: 0,
  correctionCount: 0,
  records,
  warnings: ["بيانات تجريبية ثابتة لا تتصل بخادم أو قاعدة بيانات."],
};

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full max-w-5xl p-2 sm:p-4">
    <DailyDecisionBoard result={result} />
  </main>,
);
