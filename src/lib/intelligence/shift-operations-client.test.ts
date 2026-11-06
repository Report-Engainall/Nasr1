import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordOperationalShiftCashCount } from "./shift-operations-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const shiftId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const cashCountId = "33333333-3333-4333-8333-333333333333";

describe("recordOperationalShiftCashCount money precision boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects sub-cent amounts before any RPC call", async () => {
    const result = await recordOperationalShiftCashCount({
      shiftId, phase: "CLOSING", currency: "YER", countedAmount: 100.001, idempotencyKey,
    });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects amounts whose cent representation exceeds safe integer precision", async () => {
    const result = await recordOperationalShiftCashCount({
      shiftId, phase: "CLOSING", currency: "YER",
      countedAmount: Number.MAX_SAFE_INTEGER, idempotencyKey,
    });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends an exact cent-aligned amount unchanged to the authenticated RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        cash_count_id: cashCountId, version: 1,
        counted_at: "2026-11-06T10:00:00.000Z", idempotent_replay: false,
      },
      error: null,
    });
    const result = await recordOperationalShiftCashCount({
      shiftId, phase: "CLOSING", currency: "YER", countedAmount: 100.25, idempotencyKey,
    });
    expect(rpc).toHaveBeenCalledWith("record_operational_shift_cash_count", expect.objectContaining({
      p_shift_id: shiftId, p_phase: "CLOSING", p_currency: "YER",
      p_counted_amount: 100.25, p_idempotency_key: idempotencyKey,
    }));
    expect(result).toMatchObject({ ok: true, data: { cashCountId, version: 1 } });
  });
});
