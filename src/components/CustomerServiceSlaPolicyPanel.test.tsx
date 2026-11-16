// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CustomerServiceSlaPolicyPanel } from "./CustomerServiceSlaPolicyPanel";
import type { CustomerServiceSlaPolicy } from "@/lib/customer-service-cases";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/customer-service-cases", () => ({
  fetchCustomerServiceSlaPolicies: mocks.fetch,
  setCustomerServiceSlaPolicy: mocks.save,
}));

const initialPolicies: CustomerServiceSlaPolicy[] = [
  { priority: "urgent", first_response_minutes: 15, resolution_minutes: 120, configured: true },
  { priority: "high", first_response_minutes: 30, resolution_minutes: 240, configured: true },
  { priority: "medium", first_response_minutes: 60, resolution_minutes: 480, configured: false },
  { priority: "low", first_response_minutes: 120, resolution_minutes: 1440, configured: false },
];

function openPanel() {
  render(<CustomerServiceSlaPolicyPanel canManage />);
  fireEvent.click(screen.getByText("إعداد سياسات زمن الاستجابة والحل (SLA)"));
}

describe("CustomerServiceSlaPolicyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(initialPolicies);
    mocks.save.mockImplementation(async (input: {
      priority: CustomerServiceSlaPolicy["priority"];
      firstResponseMinutes: number;
      resolutionMinutes: number;
    }) => ({
      priority: input.priority,
      first_response_minutes: input.firstResponseMinutes,
      resolution_minutes: input.resolutionMinutes,
      configured: true,
    }));
  });

  afterEach(() => cleanup());

  it("loads all four server policies and shows the current configuration state", async () => {
    openPanel();
    expect(await screen.findByTestId("sla-policy-urgent")).toBeInTheDocument();
    expect(screen.getByTestId("sla-policy-high")).toBeInTheDocument();
    expect(screen.getByTestId("sla-policy-medium")).toHaveTextContent("قيمة السياسة الحالية");
    expect(screen.getByTestId("sla-policy-low")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("saves a valid priority policy and confirms it with a fresh server read", async () => {
    const updated = initialPolicies.map((policy) => policy.priority === "urgent"
      ? { ...policy, first_response_minutes: 20 }
      : policy);
    mocks.fetch.mockResolvedValueOnce(initialPolicies).mockResolvedValueOnce(updated);

    openPanel();
    const responseInput = await screen.findByRole("spinbutton", { name: "زمن الاستجابة الأولى — عاجلة (دقيقة)" });
    fireEvent.change(responseInput, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ سياسة عاجلة" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
      priority: "urgent",
      firstResponseMinutes: 20,
      resolutionMinutes: 120,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("أكد الخادم حفظ سياسة الأولوية عاجلة");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("spinbutton", { name: "زمن الاستجابة الأولى — عاجلة (دقيقة)" })).toHaveValue(20);
  });

  it("blocks a resolution deadline shorter than first-response time", async () => {
    openPanel();
    const responseInput = await screen.findByRole("spinbutton", { name: "زمن الاستجابة الأولى — عاجلة (دقيقة)" });
    const resolutionInput = screen.getByRole("spinbutton", { name: "زمن الحل — عاجلة (دقيقة)" });
    fireEvent.change(responseInput, { target: { value: "90" } });
    fireEvent.change(resolutionInput, { target: { value: "60" } });

    expect(screen.getByRole("alert")).toHaveTextContent("مهلة الحل لا يمكن أن تسبق مهلة الاستجابة الأولى");
    expect(screen.getByRole("button", { name: "حفظ سياسة عاجلة" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not report success when the save RPC fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("رفض الخادم حفظ سياسة SLA"));
    openPanel();
    const responseInput = await screen.findByRole("spinbutton", { name: "زمن الاستجابة الأولى — عالية (دقيقة)" });
    fireEvent.change(responseInput, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ سياسة عالية" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("رفض الخادم حفظ سياسة SLA");
    expect(screen.queryByText("أكد الخادم حفظ سياسة الأولوية عالية")).not.toBeInTheDocument();
  });

  it("keeps the policy UI and server reads unavailable to non-managers", () => {
    const { container } = render(<CustomerServiceSlaPolicyPanel canManage={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("withholds incomplete server policy sets instead of filling missing priorities with guesses", async () => {
    mocks.fetch.mockResolvedValueOnce(initialPolicies.slice(0, 3));
    openPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("لم يُرجع الخادم سياسة SLA كاملة");
    expect(screen.queryByTestId("sla-policy-low")).not.toBeInTheDocument();
  });
});
