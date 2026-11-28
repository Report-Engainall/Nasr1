// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionOutcomeLifecycleControls } from "./DecisionOutcomeLifecycleControls";

const mocks = vi.hoisted(() => ({
  user: null as null | { profileId: string; roles: string[] },
  commandDecisionOutcome: vi.fn(),
  deferDecisionOutcome: vi.fn(),
  resumeDeferredDecisionOutcome: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/lib/intelligence/decision-outcome-client", () => ({
  commandDecisionOutcome: mocks.commandDecisionOutcome,
  deferDecisionOutcome: mocks.deferDecisionOutcome,
  resumeDeferredDecisionOutcome: mocks.resumeDeferredDecisionOutcome,
}));

vi.mock("@/lib/intelligence/cashflow-schedule-client", () => ({
  createCashflowScheduleRequestForPeriod: vi.fn(),
  fetchCashflowSchedule: vi.fn(),
}));

const profileId = "123e4567-e89b-42d3-a456-426614174000";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.user = { profileId, roles: ["manager"] };
  mocks.commandDecisionOutcome.mockResolvedValue({
    ok: true,
    duplicate: false,
    outcome: {} as never,
  });
});

describe("DecisionOutcomeLifecycleControls", () => {
  it("allows a manager to self-assign an approved decision with its current server version", async () => {
    const onChanged = vi.fn();
    render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={4}
        ownerProfileId={null}
        expectedMetric={null}
        onChanged={onChanged}
      />,
    );

    fireEvent.change(screen.getByLabelText("سبب الإجراء وسجل القرار"), {
      target: { value: "سأتولى تنفيذ ومتابعة هذا القرار." },
    });
    fireEvent.click(screen.getByRole("button", { name: "إسناد القرار إلى حسابي" }));

    await waitFor(() => expect(mocks.commandDecisionOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcomeId: "223e4567-e89b-42d3-a456-426614174000",
      expectedVersion: 4,
      eventType: "ASSIGN",
      ownerProfileId: profileId,
      reason: "سأتولى تنفيذ ومتابعة هذا القرار.",
    })));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("أكد الخادم حفظ انتقال القرار");
  });

  it("does not offer assignment to a user without manager or admin authority", () => {
    mocks.user = { profileId, roles: ["accountant"] };
    render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={1}
        ownerProfileId={null}
        expectedMetric={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "إسناد القرار إلى حسابي" })).not.toBeInTheDocument();
    expect(screen.getByText(/متاح للمدير أو المشرف المخول/)).toBeInTheDocument();
    expect(mocks.commandDecisionOutcome).not.toHaveBeenCalled();
  });

  it("does not let a manager silently reassign a decision already owned by another profile", () => {
    mocks.user = { profileId, roles: ["manager"] };
    render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={3}
        ownerProfileId="323e4567-e89b-42d3-a456-426614174000"
        expectedMetric={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "إسناد القرار إلى حسابي" })).not.toBeInTheDocument();
    expect(screen.getByText(/مسند بالفعل إلى مسؤول آخر/)).toBeInTheDocument();
    expect(mocks.commandDecisionOutcome).not.toHaveBeenCalled();
  });

  it("does not expose an assignment command to an unauthenticated visitor", () => {
    mocks.user = null;
    render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={1}
        ownerProfileId={null}
        expectedMetric={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "إسناد القرار إلى حسابي" })).not.toBeInTheDocument();
    expect(mocks.commandDecisionOutcome).not.toHaveBeenCalled();
  });

  it("retries an unavailable assignment with the identical target and idempotency keys", async () => {
    mocks.commandDecisionOutcome
      .mockResolvedValueOnce({
        ok: false,
        status: "UNAVAILABLE",
        message: "انقطع الاتصال بالخادم؛ أعد الأمر نفسه.",
      })
      .mockResolvedValueOnce({
        ok: true,
        duplicate: false,
        outcome: {} as never,
      });
    const view = render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={2}
        ownerProfileId={null}
        expectedMetric={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("سبب الإجراء وسجل القرار"), {
      target: { value: "إسناد موثق للمسؤول الحالي." },
    });
    fireEvent.click(screen.getByRole("button", { name: "إسناد القرار إلى حسابي" }));
    expect(await screen.findByText("انقطع الاتصال بالخادم؛ أعد الأمر نفسه.")).toBeInTheDocument();
    const firstCommand = mocks.commandDecisionOutcome.mock.calls[0][0];

    mocks.user = { profileId: "323e4567-e89b-42d3-a456-426614174000", roles: ["manager"] };
    view.rerender(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={2}
        ownerProfileId={null}
        expectedMetric={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة بنفس الأمر" }));

    await waitFor(() => expect(mocks.commandDecisionOutcome).toHaveBeenCalledTimes(2));
    expect(mocks.commandDecisionOutcome.mock.calls[1][0]).toMatchObject({
      ownerProfileId: profileId,
      eventId: firstCommand.eventId,
      idempotencyKey: firstCommand.idempotencyKey,
      expectedVersion: firstCommand.expectedVersion,
      reason: firstCommand.reason,
    });
  });

  it("keeps failed server assignments visible as failures without refreshing the record", async () => {
    mocks.commandDecisionOutcome.mockResolvedValue({
      ok: false,
      status: "DENIED",
      message: "الخادم رفض إسناد القرار.",
    });
    const onChanged = vi.fn();
    render(
      <DecisionOutcomeLifecycleControls
        outcomeId="223e4567-e89b-42d3-a456-426614174000"
        state="APPROVED"
        version={1}
        ownerProfileId={null}
        expectedMetric={null}
        onChanged={onChanged}
      />,
    );

    fireEvent.change(screen.getByLabelText("سبب الإجراء وسجل القرار"), {
      target: { value: "إسناد للتجربة." },
    });
    fireEvent.click(screen.getByRole("button", { name: "إسناد القرار إلى حسابي" }));

    expect(await screen.findByText("الخادم رفض إسناد القرار.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
