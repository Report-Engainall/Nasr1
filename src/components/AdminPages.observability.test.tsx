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
vi.mock("@/components/reference-model/observability/ArchitectureRegistryPanel", () => ({
  ArchitectureRegistryPanel: () => (
    <section role="region" aria-label="سجل معمارية التطبيق">architecture-registry-mounted</section>
  ),
}));
vi.mock("@/components/reference-model/observability/SystemHealthPanel", () => ({
  SystemHealthPanel: () => (
    <section role="region" aria-label="فحوص صحة النظام">system-health-panel-mounted</section>
  ),
}));
vi.mock("@/components/reference-model/observability/SourceBoundaryStatusPanel", () => ({
  SourceBoundaryStatusPanel: () => (
    <section role="region" aria-label="حالة عقود مصادر الوظائف المرجعية">source-boundary-panel-mounted</section>
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

    expect(await screen.findByRole("region", { name: "سجل معمارية التطبيق" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "فحوص صحة النظام" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).toBeInTheDocument();
  });

  it("does not expose the observability tab or its panels to non-manager roles", () => {
    mocks.useAuth.mockReturnValue({
      user: { roles: ["accountant"], profileId: "profile-observability-test" },
    });

    render(<SettingsPage onNotice={() => undefined} />);

    expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "فحوص صحة النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).not.toBeInTheDocument();
  });
});
