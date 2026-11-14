// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useFetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));
vi.mock("@/components/admin/operations/ArchitectureScreen", () => ({
  ArchitectureScreen: () => (
    <section role="region" aria-label="شاشة معمارية النظام">architecture-screen-mounted</section>
  ),
}));
vi.mock("@/components/admin/operations/SystemHealthScreen", () => ({
  SystemHealthScreen: () => (
    <section role="region" aria-label="شاشة صحة النظام">system-health-screen-mounted</section>
  ),
}));
vi.mock("@/components/admin/operations/ErrorLogScreen", () => ({
  ErrorLogScreen: () => (
    <section role="region" aria-label="شاشة سجل الأخطاء">error-log-screen-mounted</section>
  ),
}));
vi.mock("@/components/admin/operations/EngineStatusScreen", () => ({
  EngineStatusScreen: () => (
    <section role="region" aria-label="شاشة حالة المحركات">engine-status-screen-mounted</section>
  ),
}));

import { SettingsPage } from "./AdminPages";

describe("SettingsPage observability integration", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useFetch.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it.each(["admin", "manager"])("mounts all existing observability panels for the %s role", async (role) => {
    mocks.useAuth.mockReturnValue({
      user: { roles: [role], profileId: "profile-observability-test" },
    });

    render(<SettingsPage onNotice={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "معمارية النظام" }));

    expect(await screen.findByRole("region", { name: "شاشة معمارية النظام" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "صحة النظام" }));
    expect(await screen.findByRole("region", { name: "شاشة صحة النظام" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "سجل الأخطاء" }));
    expect(await screen.findByRole("region", { name: "شاشة سجل الأخطاء" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "حالة المحركات" }));
    expect(await screen.findByRole("region", { name: "شاشة حالة المحركات" })).toBeInTheDocument();
  });

  it("does not expose the observability tab or its panels to non-manager roles", () => {
    mocks.useAuth.mockReturnValue({
      user: { roles: ["accountant"], profileId: "profile-observability-test" },
    });

    render(<SettingsPage onNotice={() => undefined} />);

    expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "مراقبة النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "شاشة صحة النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "شاشة سجل الأخطاء" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "شاشة حالة المحركات" })).not.toBeInTheDocument();
  });
});
