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
  OnyxInventoryReconciliationActions: ({ snapshotId }: { snapshotId: string }) => (
    <div data-testid="onyx-reconciliation-actions" data-snapshot-id={snapshotId}>reconciliation action surface</div>
  ),
}));

import { OnyxInventoryReconciliationWorkspace } from "@/components/OnyxInventoryReconciliationWorkspace";

const snapshots: OnyxSnapshotSummary[] = [
  {
    id: "snapshot-stock-oct",
    snapshot_version: 4,
    period_key: "2026-10",
    source_file_hash: "a".repeat(64),
    source_file_name: "onyx-stock-2026-10.xlsx",
    report_type: "inventory",
    row_count: 142,
    data_quality_score: 96.5,
    quality_breakdown: { accepted: 140, rejected: 2 },
    created_by: "profile-admin",
    created_at: "2026-10-21T10:00:00.000Z",
  },
  {
    id: "snapshot-stock-sep",
    snapshot_version: 3,
    period_key: "2026-09",
    source_file_hash: "b".repeat(64),
    source_file_name: "onyx-stock-2026-09.xlsx",
    report_type: "inventory",
    row_count: 135,
    data_quality_score: 94,
    quality_breakdown: { accepted: 133, rejected: 2 },
    created_by: "profile-admin",
    created_at: "2026-10-01T10:00:00.000Z",
  },
];

function setUser(roles: string[]) {
  mocks.useAuth.mockReturnValue({
    ready: true,
    loading: false,
    user: {
      id: "auth-user",
      profileId: "profile-current",
      email: "admin@example.test",
      name: "مسؤول اختبار",
      roles,
      isStaff: true,
    },
  });
}

describe("Onyx inventory reconciliation workspace integration", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.fetchOnyxSnapshots.mockReset().mockResolvedValue(snapshots);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes the action workflow to an authorized manager using a real saved snapshot choice", async () => {
    setUser(["manager"]);
    render(<OnyxInventoryReconciliationWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "مصالحة مخزون أونكس" }));
    expect(await screen.findByRole("dialog", { name: "مصالحة المخزون مع لقطة أونكس المعتمدة" })).toBeInTheDocument();
    expect(await screen.findByText("onyx-stock-2026-10.xlsx — الإصدار 4")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("onyx-reconciliation-actions")).toHaveAttribute("data-snapshot-id", "snapshot-stock-oct"));

    fireEvent.change(screen.getByLabelText("لقطة Onyx الجاهزة للمصالحة"), { target: { value: "snapshot-stock-sep" } });
    expect(screen.getByTestId("onyx-reconciliation-actions")).toHaveAttribute("data-snapshot-id", "snapshot-stock-sep");
    expect(mocks.fetchOnyxSnapshots).toHaveBeenCalledTimes(1);
  });

  it("keeps stock-apply controls unavailable to ordinary staff", () => {
    setUser(["staff"]);
    render(<OnyxInventoryReconciliationWorkspace />);

    expect(screen.queryByRole("button", { name: "مصالحة مخزون أونكس" })).not.toBeInTheDocument();
    expect(mocks.fetchOnyxSnapshots).not.toHaveBeenCalled();
  });

  it("shows an honest empty state without manufacturing a snapshot or action", async () => {
    setUser(["admin"]);
    mocks.fetchOnyxSnapshots.mockResolvedValue([]);
    render(<OnyxInventoryReconciliationWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "مصالحة مخزون أونكس" }));
    expect(await screen.findByText(/لا توجد لقطة Onyx بحالة جاهزة/)).toBeInTheDocument();
    expect(screen.queryByTestId("onyx-reconciliation-actions")).not.toBeInTheDocument();
  });

  it("surfaces a snapshot-read failure with a retry action", async () => {
    setUser(["admin"]);
    mocks.fetchOnyxSnapshots.mockRejectedValueOnce(new Error("snapshot read denied"));
    render(<OnyxInventoryReconciliationWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "مصالحة مخزون أونكس" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("snapshot read denied");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("onyx-stock-2026-10.xlsx — الإصدار 4")).toBeInTheDocument();
  });
});
