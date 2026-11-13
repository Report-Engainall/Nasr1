// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceBoundaryStatusPanel } from "./SourceBoundaryStatusPanel";

describe("SourceBoundaryStatusPanel", () => {
  it("surfaces actual missing contracts and does not show placeholder data actions", () => {
    render(<SourceBoundaryStatusPanel />);
    expect(screen.getByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).toBeInTheDocument();
    expect(screen.getByText("BLOCKED_NO_TENANT_SAFE_READ_CONTRACT")).toBeInTheDocument();
    expect(screen.getAllByText("BLOCKED_NO_PERSISTENT_SOURCE")).toHaveLength(2);
    expect(screen.getByText("BLOCKED_NO_SAFE_REPOSITORY_READ_SOURCE")).toBeInTheDocument();
    expect(screen.getByText(/لا تعرض هذه اللوحة بيانات تشغيل أو سجلات افتراضية/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
