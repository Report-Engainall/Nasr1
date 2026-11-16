// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/components/AdminPages", () => ({
  AiCenter: ({ onNotice }: { onNotice: (message: string) => void }) => (
    <div data-testid="ai-center">
      <button type="button" onClick={() => onNotice("ملاحظة اختبار")}>تنبيه اختباري</button>
    </div>
  ),
}));
vi.mock("@/components/reference-model/ai-governance/PromptGovernancePanel", () => ({
  PromptGovernancePanel: () => <div data-testid="prompt-governance-panel">لوحة حوكمة الأوامر</div>,
}));
vi.mock("@/components/reference-model/ai-governance/AiUsageAuditPanel", () => ({
  AiUsageAuditPanel: () => <div data-testid="ai-usage-audit-panel">لوحة تدقيق الاستخدام</div>,
}));

import { AdminAiGovernanceWorkspace } from "./AdminAiGovernanceWorkspace";

const admin = {
  id: "admin-user",
  profileId: "admin-profile",
  roles: ["admin"],
};
const manager = {
  id: "manager-user",
  profileId: "manager-profile",
  roles: ["manager"],
};
const staff = {
  id: "staff-user",
  profileId: "staff-profile",
  roles: ["staff"],
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: admin });
});

describe("AdminAiGovernanceWorkspace", () => {
  it("connects the three existing governance workspaces inside the current AI center", () => {
    render(<AdminAiGovernanceWorkspace onNotice={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "المركز التشغيلي" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "حوكمة الأوامر" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "تدقيق الاستخدام" })).toBeInTheDocument();
    expect(screen.getByTestId("ai-center")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "حوكمة الأوامر" }));
    expect(screen.getByTestId("prompt-governance-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-center")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "تدقيق الاستخدام" }));
    expect(screen.getByTestId("ai-usage-audit-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-governance-panel")).not.toBeInTheDocument();
  });

  it("exposes usage audit to managers but never exposes prompt governance", () => {
    mocks.useAuth.mockReturnValue({ user: manager });
    render(<AdminAiGovernanceWorkspace onNotice={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "تدقيق الاستخدام" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "حوكمة الأوامر" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "تدقيق الاستخدام" }));
    expect(screen.getByTestId("ai-usage-audit-panel")).toBeInTheDocument();
  });

  it("keeps operational access for staff without revealing governance tabs", () => {
    mocks.useAuth.mockReturnValue({ user: staff });
    render(<AdminAiGovernanceWorkspace onNotice={vi.fn()} />);

    expect(screen.getByTestId("ai-center")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "حوكمة الأوامر" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "تدقيق الاستخدام" })).not.toBeInTheDocument();
  });

  it("falls back immediately when the current session loses the selected tab role", () => {
    const view = render(<AdminAiGovernanceWorkspace onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "حوكمة الأوامر" }));
    expect(screen.getByTestId("prompt-governance-panel")).toBeInTheDocument();

    mocks.useAuth.mockReturnValue({ user: staff });
    view.rerender(<AdminAiGovernanceWorkspace onNotice={vi.fn()} />);

    expect(screen.getByTestId("ai-center")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-governance-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "حوكمة الأوامر" })).not.toBeInTheDocument();
  });
});
