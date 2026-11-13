// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OnyxSnapshotSummary } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchOnyxSnapshots: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/api", () => ({ fetchOnyxSnapshots: mocks.fetchOnyxSnapshots }));
vi.mock("@/components/OnyxInventoryReconciliationActions", () => ({
  OnyxInventoryReconciliationActions: () => (
    <button type="button">تأكيد مصالحة اختبارية</button>
  ),
}));

import { OnyxInventoryReconciliationWorkspace } from "./OnyxInventoryReconciliationWorkspace";

const snapshot = {
  id: "a1000000-0000-0000-0000-000000000071",
  source_file_name: "onyx-inventory.xlsx",
  period_key: "2026-11",
  snapshot_version: 2,
  row_count: 3,
  data_quality_score: 96,
  created_at: "2026-11-13T00:00:00.000Z",
} as unknown as OnyxSnapshotSummary;

describe("Onyx inventory reconciliation dialog accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      ready: true,
      user: { roles: ["admin"] },
    });
    mocks.fetchOnyxSnapshots.mockResolvedValue([snapshot]);
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("moves focus into the dialog, traps Tab, closes with Escape and restores focus", async () => {
    render(<OnyxInventoryReconciliationWorkspace />);

    const launcher = screen.getByRole("button", { name: "مصالحة مخزون أونكس" });
    launcher.focus();
    fireEvent.click(launcher);

    const action = await screen.findByRole("button", { name: "تأكيد مصالحة اختبارية" });
    const dialog = screen.getByRole("dialog", {
      name: "مصالحة المخزون مع لقطة أونكس المعتمدة",
    });
    const close = screen.getByRole("button", { name: "إغلاق مصالحة مخزون أونكس" });

    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(action);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(launcher);
    expect(document.body.style.overflow).toBe("");
  });

  it("does not expose the reconciliation write workspace to staff", () => {
    mocks.useAuth.mockReturnValue({
      ready: true,
      user: { roles: ["staff"] },
    });

    render(<OnyxInventoryReconciliationWorkspace />);

    expect(screen.queryByRole("button", { name: "مصالحة مخزون أونكس" })).not.toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshots).not.toHaveBeenCalled();
  });
});
