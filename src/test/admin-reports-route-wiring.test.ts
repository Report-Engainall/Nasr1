import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "src/routes/admin_.reports.tsx"), "utf8");
const adminApp = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");
const reportStart = adminApp.indexOf("function Reports()");
const reportEnd = adminApp.indexOf("function ReportMetric(", reportStart);
const reportsImplementation = reportStart >= 0 && reportEnd > reportStart
  ? adminApp.slice(reportStart, reportEnd)
  : "";

describe("admin reports analytics wiring", () => {
  it("uses the Reports view as the sole mount for executive analytics", () => {
    expect(route).toContain('createFileRoute("/admin_/reports")');
    expect(route).toContain('<AdminApp initialView="reports" />');
    expect(route).not.toContain("ExecutiveStoreAnalytics");
    expect(route).toContain('role="status">جار تحميل التقارير...');
    expect(reportsImplementation).not.toBe("");
    expect(reportsImplementation.match(/<ExecutiveStoreAnalytics\s*\/>/g) ?? []).toHaveLength(1);
  });
});
