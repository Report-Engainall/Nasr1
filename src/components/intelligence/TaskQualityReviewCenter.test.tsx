// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskQualityMetrics } from "@/lib/intelligence/task-quality-reviews";

const mocks = vi.hoisted(() => ({
  fetchOperationalTaskQualityMetrics: vi.fn(),
}));

vi.mock("@/lib/intelligence/task-quality-reviews-client", () => ({
  fetchOperationalTaskQualityMetrics: mocks.fetchOperationalTaskQualityMetrics,
}));

import { TaskQualityReviewCenter } from "./TaskQualityReviewCenter";

const EMPTY_QUALITY: TaskQualityMetrics = {
  status: "EMPTY",
  scope: { visibleTaskCount: 0, reviewedTaskCount: 0 },
  actionability: {
    reviewedCount: 0,
    actionableCount: 0,
    notActionableCount: 0,
    deferredCount: 0,
    rateDenominator: 0,
    actionableRatePercent: null,
    notActionableReasons: [],
  },
  disposition: {
    reviewedCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    deferredCount: 0,
    rejectionReasons: [],
    deferralReasons: [],
  },
  alerts: {
    reviewedCount: 0,
    truePositiveCount: 0,
    falsePositiveCount: 0,
    needsReviewCount: 0,
    falseAlarmDenominator: 0,
    falseAlarmRatePercent: null,
  },
  causeReviewCount: 0,
  repeatedCauses: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.fetchOperationalTaskQualityMetrics.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("TaskQualityReviewCenter", () => {
  it("shows source loading state and then renders the verified empty state", async () => {
    const pending = deferred<TaskQualityMetrics>();
    mocks.fetchOperationalTaskQualityMetrics.mockReturnValueOnce(pending.promise);

    render(<TaskQualityReviewCenter />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ تحميل مؤشرات الجودة");
    expect(screen.getByRole("button", { name: "تحديث مؤشرات جودة المهام" })).toBeDisabled();

    await act(async () => {
      pending.resolve(EMPTY_QUALITY);
      await pending.promise;
    });

    expect(await screen.findByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحديث مؤشرات جودة المهام" })).toBeEnabled();
  });

  it("preserves the last good result, exposes unexpected failures and allows retry", async () => {
    mocks.fetchOperationalTaskQualityMetrics
      .mockResolvedValueOnce(EMPTY_QUALITY)
      .mockRejectedValueOnce(new Error("private backend detail"))
      .mockResolvedValueOnce(EMPTY_QUALITY);

    const view = render(<TaskQualityReviewCenter />);
    expect(await screen.findByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();

    view.rerender(<TaskQualityReviewCenter refreshToken={1} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر قراءة مؤشرات الجودة من المصدر المعتمد؛ أعد المحاولة.",
    );
    expect(screen.getByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تحديث مؤشرات جودة المهام" }));

    await waitFor(() => {
      expect(mocks.fetchOperationalTaskQualityMetrics).toHaveBeenCalledTimes(3);
    });
    expect(await screen.findByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a late result from an earlier refresh generation", async () => {
    const stale = deferred<TaskQualityMetrics>();
    const latest = deferred<TaskQualityMetrics>();
    mocks.fetchOperationalTaskQualityMetrics
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);

    const view = render(<TaskQualityReviewCenter refreshToken={0} />);
    view.rerender(<TaskQualityReviewCenter refreshToken={1} />);

    await waitFor(() => {
      expect(mocks.fetchOperationalTaskQualityMetrics).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      latest.resolve(EMPTY_QUALITY);
      await latest.promise;
    });
    expect(await screen.findByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();

    await act(async () => {
      stale.resolve({ status: "RESTRICTED", reasonCode: "QUALITY_REVIEW_MANAGER_ONLY" });
      await stale.promise;
    });

    expect(screen.getByText(/لم تُسجل مراجعات جودة بعد/)).toBeInTheDocument();
    expect(screen.queryByText("تفاصيل قرارات المراجعة وأسبابها متاحة للمدير والمسؤول فقط.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحديث مؤشرات جودة المهام" })).toBeEnabled();
  });
});
