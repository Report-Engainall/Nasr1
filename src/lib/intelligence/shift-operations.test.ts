import { describe, expect, it } from "vitest";
import { buildShiftOperationsCenter, parseShiftOperationsSnapshot } from "./shift-operations";

function snapshot(overrides: Record<string, unknown> = {}) {
  const shiftId = "shift-2026-11-27";
  return {
    id: "snapshot-1",
    shiftId,
    previousShiftId: null,
    shiftLabel: "وردية اليوم",
    businessDate: "2026-11-27",
    organizationTimeZone: "Asia/Aden",
    asOf: "2026-11-27T00:00:00.000Z",
    generatedAt: "2026-11-27T00:01:00.000Z",
    currentOwnerProfileId: null,
    sourceCoverage: [],
    items: [],
    cashControls: [],
    handover: {
      required: false, previousShiftId: null, currentShiftId: shiftId,
      outgoingOwnerProfileId: null, incomingOwnerProfileId: null,
      recordedAt: null, acceptedAt: null, reason: null, note: null,
      openItemRefs: [], evidenceIds: [],
    },
    evidenceRecords: [],
    ...overrides,
  };
}


function evidenceRecord(sourceTimestamp: string, asOf: string, period = { from: "2026-11-27", to: "2026-11-27" }) {
  return {
    id: "shift-proof",
    source: { kind: "LEDGER", name: "سجل الوردية", recordId: "shift-proof-1" },
    sourceTimestamp,
    asOf,
    period,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}
function sourceCoverage(key: string, asOf: string, evidenceIds = ["shift-proof"], period = { from: "2026-11-27", to: "2026-11-27" }) {
  return {
    key,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    asOf,
    period,
    freshnessLimitMinutes: 30,
    expectedCount: 1,
    returnedCount: 1,
    completePopulation: true,
    notApplicable: false,
    closeCritical: true,
    evidenceIds,
    message: "مصدر موثق",
  };
}
function cashControl(sourceAsOf: string, evidenceIds = ["shift-proof"]) {
  const point = {
    expected: 100,
    counted: 100,
    expectedEvidenceIds: evidenceIds,
    countEvidenceIds: evidenceIds,
    notApplicable: false,
  };
  return { currency: "YER", sourceAsOf, opening: point, closing: point };
}
describe("shift operations strict timestamp contract", () => {
  it.each([
    ["+14:00", "2026-11-27T14:00:00.000+14:00", "2026-11-27T14:01:00.000+14:00"],
    ["-14:00", "2026-11-26T10:00:00.000-14:00", "2026-11-26T11:00:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset %s", (_label, asOf, generatedAt) => {
    expect(parseShiftOperationsSnapshot(snapshot({ asOf, generatedAt }))).not.toBeNull();
  });


  it.each([
    ["seven fractional digits", "2026-11-27T00:00:00.1234567Z"],
    ["nine fractional digits", "2026-11-27T00:00:00.123456789Z"],
  ])("rejects timestamp precision beyond PostgreSQL microseconds: %s", (_label, asOf) => {
    expect(parseShiftOperationsSnapshot(snapshot({ asOf }))).toBeNull();
  });

  it("rejects generatedAt that precedes asOf by exactly one microsecond", () => {
    const asOf = "2026-11-27T00:00:00.123457Z";
    const generatedAt = "2026-11-27T00:00:00.123456Z";
    expect(parseShiftOperationsSnapshot(snapshot({ asOf, generatedAt }))).toBeNull();
  });

  it("accepts equal instants expressed using a different UTC offset at microsecond precision", () => {
    const asOf = "2026-11-27T00:00:00.123456Z";
    const generatedAt = "2026-11-27T03:01:00.123456+03:01";
    expect(parseShiftOperationsSnapshot(snapshot({ asOf, generatedAt }))).not.toBeNull();
  });

  it("withholds a verified cash proof that is one microsecond newer than the shift snapshot", () => {
    const asOf = "2026-11-27T12:00:00.123456Z";
    const futureProof = "2026-11-27T12:00:00.123457Z";
    const parsed = parseShiftOperationsSnapshot(snapshot({
      asOf,
      generatedAt: "2026-11-27T12:01:00.123456Z",
      sourceCoverage: [sourceCoverage("CASH", asOf)],
      cashControls: [cashControl(asOf)],
      evidenceRecords: [evidenceRecord(futureProof, asOf)],
    }));
    expect(parsed).not.toBeNull();
    const center = buildShiftOperationsCenter(parsed!);
    expect(center.cashControls[0].opening.state).toBe("UNKNOWN");
    expect(center.sourceCoverage[0].status).toBe("NEEDS_REVIEW");
  });

  it("rejects a source coverage snapshot that exceeds freshness by one microsecond", () => {
    const asOf = "2026-11-27T12:00:00.000000Z";
    const generatedAt = "2026-11-27T12:30:00.000001Z";
    const parsed = parseShiftOperationsSnapshot(snapshot({
      asOf,
      generatedAt,
      sourceCoverage: [sourceCoverage("CASH", asOf)],
      cashControls: [cashControl(asOf)],
      evidenceRecords: [evidenceRecord(asOf, asOf)],
    }));
    expect(parsed).not.toBeNull();
    const center = buildShiftOperationsCenter(parsed!);
    expect(center.cashControls[0].opening.state).toBe("UNKNOWN");
    expect(center.sourceCoverage[0].status).toBe("NEEDS_REVIEW");
  });

  it("rejects handover acceptance one microsecond before the recorded handover", () => {
    const asOf = "2026-11-27T12:00:00.123456Z";
    const recordedAt = "2026-11-27T12:00:00.123456Z";
    const acceptedAt = "2026-11-27T12:00:00.123455Z";
    const parsed = parseShiftOperationsSnapshot(snapshot({
      previousShiftId: "shift-previous",
      asOf,
      generatedAt: "2026-11-27T12:01:00.123456Z",
      sourceCoverage: [sourceCoverage("HANDOVER", asOf)],
      evidenceRecords: [evidenceRecord(recordedAt, asOf)],
      handover: {
        required: true,
        previousShiftId: "shift-previous",
        currentShiftId: "shift-2026-11-27",
        outgoingOwnerProfileId: "11111111-1111-4111-8111-111111111111",
        incomingOwnerProfileId: "22222222-2222-4222-8222-222222222222",
        recordedAt,
        acceptedAt,
        reason: "تسليم الوردية",
        note: null,
        openItemRefs: [],
        evidenceIds: ["shift-proof"],
      },
    }));
    expect(parsed).not.toBeNull();
    expect(buildShiftOperationsCenter(parsed!).handover.state).toBe("UNKNOWN");
  });

  it.each([
    ["timezone-less asOf", "2026-11-27T00:00:00.000", "2026-11-27T00:01:00.000Z"],
    ["asOf offset +14:01", "2026-11-27T14:00:00.000+14:01", "2026-11-27T14:01:00.000+14:01"],
    ["generatedAt offset -14:01", "2026-11-27T00:00:00.000Z", "2026-11-26T10:01:00.000-14:01"],
    ["generatedAt without timezone", "2026-11-27T00:00:00.000Z", "2026-11-27T00:01:00.000"],
    ["calendar overflow", "2026-02-30T00:00:00.000Z", "2026-02-30T00:01:00.000Z"],
  ])("rejects %s before operating on the shift snapshot", (_label, asOf, generatedAt) => {
    expect(parseShiftOperationsSnapshot(snapshot({ asOf, generatedAt }))).toBeNull();
  });
});
