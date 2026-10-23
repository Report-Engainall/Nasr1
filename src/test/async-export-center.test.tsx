import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelMyAsyncExportJob: vi.fn(),
  getMyAsyncExportDownload: vi.fn(),
  listMyAsyncExportJobs: vi.fn(),
  requestAsyncOrdersCsvExport: vi.fn(),
  triggerAsyncExportWorker: vi.fn(),
}));

vi.mock("@/lib/async-export-jobs", () => mocks);
vi.mock("@/lib/async-export-csv", () => ({
  exportJobIdempotencyKey: () => "async-export-test-key",
}));

import { AsyncExportCenter } from "@/components/AsyncExportCenter";

const queuedJob = {
  job_id: "11111111-1111-4111-8111-111111111111",
  export_type: "orders_csv" as const,
  status: "queued" as const,
  row_count: null,
  file_name: null,
  byte_size: null,
  error_code: null,
  error_message: null,
  created_at: "2026-10-23T10:00:00.000Z",
  completed_at: null,
  expires_at: "2026-10-30T10:00:00.000Z",
};

describe("async export center list recovery", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listMyAsyncExportJobs.mockResolvedValue([queuedJob]);
    mocks.triggerAsyncExportWorker.mockResolvedValue(true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function renderCenter() {
    await act(async () => {
      root?.render(<AsyncExportCenter />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function clickButton(label: string) {
    const button = [...(host?.querySelectorAll("button") ?? [])]
      .find((item) => item.textContent?.replace(/\s+/g, " ").trim().includes(label));
    expect(button, `button containing "${label}" should exist`).toBeTruthy();
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("clears only the recovered list error and preserves a successful worker notice", async () => {
    mocks.listMyAsyncExportJobs
      .mockResolvedValueOnce([queuedJob])
      .mockRejectedValueOnce(new Error("list unavailable"))
      .mockResolvedValueOnce([queuedJob]);

    await renderCenter();
    expect(host?.textContent).toContain("في قائمة الانتظار");
    expect(host?.textContent).not.toContain("list unavailable");

    await clickButton("تنبيه العامل");
    expect(mocks.triggerAsyncExportWorker).toHaveBeenCalledWith(queuedJob.job_id);
    expect(mocks.listMyAsyncExportJobs).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="status"]')?.textContent).toContain("أُرسل الطلب الحالي إلى العامل.");
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("list unavailable");

    await clickButton("تحديث السجل");
    expect(mocks.listMyAsyncExportJobs).toHaveBeenCalledTimes(3);
    expect(host?.textContent).not.toContain("list unavailable");
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.querySelector('[role="status"]')?.textContent).toContain("أُرسل الطلب الحالي إلى العامل.");
  });
});
