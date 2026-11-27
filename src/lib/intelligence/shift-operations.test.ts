import { describe, expect, it } from "vitest";
import { parseShiftOperationsSnapshot } from "./shift-operations";

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

describe("shift operations strict timestamp contract", () => {
  it.each([
    ["+14:00", "2026-11-27T14:00:00.000+14:00", "2026-11-27T14:01:00.000+14:00"],
    ["-14:00", "2026-11-26T10:00:00.000-14:00", "2026-11-26T11:00:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset %s", (_label, asOf, generatedAt) => {
    expect(parseShiftOperationsSnapshot(snapshot({ asOf, generatedAt }))).not.toBeNull();
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
