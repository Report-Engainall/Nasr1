import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "src/routes/admin_.exports.tsx"), "utf8");
const reportsRoute = readFileSync(join(process.cwd(), "src/routes/admin_.reports.tsx"), "utf8");
const component = readFileSync(join(process.cwd(), "src/components/AsyncExportCenter.tsx"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/async-export-jobs.ts"), "utf8");

describe("async export center route wiring", () => {
  it("registers the admin route and a reports-page entry point", () => {
    expect(route).toContain('createFileRoute("/admin_/exports")');
    expect(route).toContain("AsyncExportCenter");
    expect(route).toContain('content: "noindex"');
    expect(reportsRoute).toContain('href="/admin/exports"');
  });
  it("connects the form and actions to server-owned operations", () => {
    expect(component).toContain("requestAsyncOrdersCsvExport");
    expect(component).toContain("listMyAsyncExportJobs");
    expect(component).toContain("getMyAsyncExportDownload");
    expect(component).toContain("triggerAsyncExportWorker(job.job_id)");
    expect(component).toContain("cancelMyAsyncExportJob");
    expect(component).toContain('type="date"');
    expect(component).toContain("window.location.assign(link.url)");
    expect(component).toContain("كل 5 ثوانٍ");
    expect(component).toContain("60 ثانية");
    expect(component).toContain('role="status"');
    expect(service).toContain('body: { job_id: jobId }');
  });
});
