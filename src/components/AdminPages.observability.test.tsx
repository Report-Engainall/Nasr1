// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useFetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));

import { SettingsPage } from "./AdminPages";

describe("SettingsPage observability ownership", () => {
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

  it.each(["admin", "manager"])("keeps architecture and health out of general settings for %s", (role) => {
    mocks.useAuth.mockReturnValue({
      user: { roles: [role], profileId: "profile-observability-test" },
    });

    render(<SettingsPage onNotice={() => undefined} />);

    expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "سجل معمارية التطبيق" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "فحوص صحة النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).not.toBeInTheDocument();
  });
});
