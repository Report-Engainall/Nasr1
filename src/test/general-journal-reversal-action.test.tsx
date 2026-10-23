import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeneralJournalReversalAction } from "@/components/GeneralJournalReversalAction";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const originalId = "10000000-0000-4000-8000-000000000001";
const reversalId = "20000000-0000-4000-8000-000000000002";
const firstKey = "30000000-0000-4000-8000-000000000003";
const secondKey = "40000000-0000-4000-8000-000000000004";

describe("general journal reversal action retry", () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
      .mockResolvedValueOnce({
        data: {
          original_journal_entry_id: originalId,
          reversal_journal_entry_id: reversalId,
          entry_number: "REV-1",
          status: "draft",
          replayed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          original_journal_entry_id: originalId,
          reversal_journal_entry_id: reversalId,
          entry_number: "REV-1",
          status: "draft",
          replayed: true,
        },
        error: null,
      });
    vi.spyOn(window, "prompt").mockReturnValue("Correct a recorded manual journal");
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn()
        .mockReturnValueOnce(firstKey)
        .mockReturnValueOnce(secondKey),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reuses the server idempotency key when the post-RPC refresh callback fails", async () => {
    const onCreated = vi.fn()
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce(undefined);
    render(<GeneralJournalReversalAction entryId={originalId} disabled={false} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /إنشاء مسودة عكس/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تم تأكيد العكس من الخادم، لكن تعذر تحديث دفتر الأستاذ."
    );

    fireEvent.click(screen.getByRole("button", { name: /إنشاء مسودة عكس/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));

    const calls = mocks.rpc.mock.calls.filter(([name]) => name === "reverse_general_journal_entry");
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_idempotency_key).toBe(firstKey);
    expect(calls[1][1].p_idempotency_key).toBe(firstKey);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
