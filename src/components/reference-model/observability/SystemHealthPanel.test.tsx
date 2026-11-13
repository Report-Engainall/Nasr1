// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchAiGatewayBudget: vi.fn(),
}));

vi.mock("@/lib/intelligence/ai-gateway-operations-client", () => ({
  fetchAiGatewayBudget: mocks.fetchAiGatewayBudget,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ sessionRevision: 1 }),
}));

import { SystemHealthPanel } from "./SystemHealthPanel";

afterEach(() => {
  cleanup();
  mocks.fetchAiGatewayBudget.mockReset();
});

describe("SystemHealthPanel", () => {
  it("renders the actual budget source probe but keeps global and provider health unknown", async () => {
    // The latency assertion covers the browser round trip, not database execution time.
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: true,
      status: "READY",
      readAt: "2026-11-13T04:00:00.000Z",
      data: {},
    });
    render(<SystemHealthPanel />);
    expect(screen.getByText("UNKNOWN — غير مثبتة")).toBeInTheDocument();
    expect(screen.getByText("UNKNOWN — لم يُختبر")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("استجابة المصدر مؤكدة")).toBeInTheDocument());
    expect(screen.getByText("public.get_ai_gateway_budget")).toBeInTheDocument();
    expect(screen.getByText(/لا يثبت اتصال المزود أو نجاح طلب نموذج/)).toBeInTheDocument();
    expect(screen.getByText(/مدة الطلب المقاسة في المتصفح:/)).toBeInTheDocument();
    expect(screen.getByText(/وقت اكتمال الطلب محلياً:/)).toBeInTheDocument();
  });

  it("does not describe a denied read as a service outage", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "DENIED",
      message: "محجوب",
    });
    render(<SystemHealthPanel />);
    await waitFor(() => expect(screen.getByText("محجوب بالصلاحية")).toBeInTheDocument());
    expect(screen.getByText("UNKNOWN — غير مثبتة")).toBeInTheDocument();
  });

  it("fails closed when the read contract is unavailable", async () => {
    mocks.fetchAiGatewayBudget.mockResolvedValue({
      ok: false,
      status: "UNAVAILABLE",
      message: "غير متاح",
    });
    render(<SystemHealthPanel />);
    await waitFor(() => expect(screen.getByText("المصدر غير متاح")).toBeInTheDocument());
    expect(screen.getByText("UNKNOWN — غير مثبتة")).toBeInTheDocument();
  });

  it("ignores a late response after the component unmounts", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.fetchAiGatewayBudget.mockReturnValue(new Promise((r) => { resolve = r; }));
    const view = render(<SystemHealthPanel />);
    view.unmount();
    resolve({
      ok: true,
      status: "READY",
      readAt: "2026-11-13T04:00:00.000Z",
      data: {},
    });
    await Promise.resolve();
    expect(screen.queryByText("استجابة المصدر مؤكدة")).not.toBeInTheDocument();
  });
});
