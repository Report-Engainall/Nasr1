import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EvidenceWarnings, IntelligenceStatePanel } from "./shared";

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

  it("wraps long evidence warning tokens inside narrow intelligence cards", () => {
    const longWarning = "SOURCE_EVIDENCE_" + "a".repeat(220);
    render(<EvidenceWarnings warnings={[longWarning]} />);
    const list = screen.getByRole("list", { name: "تحذيرات المصدر" });
    const item = list.querySelector("li");
    expect(item).not.toBeNull();
    expect(list.style.minWidth).toBe("0px");
    expect(list.style.maxWidth).toBe("100%");
    expect(list.style.overflowWrap).toBe("anywhere");
    expect(item?.style.minWidth).toBe("0px");
    expect(item?.style.overflowWrap).toBe("anywhere");
  });
});
