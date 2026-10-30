import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntelligenceStatePanel } from "./shared";

describe("intelligence state panel", () => {
  it("keeps unavailable distinct from empty and does not render a value", () => {
    render(<IntelligenceStatePanel state="unavailable" />);
    expect(screen.getByRole("note")).toHaveTextContent("المصدر غير متاح");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("exposes retry only for an explicit error state", () => {
    const onRetry = vi.fn();
    render(<IntelligenceStatePanel state="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
