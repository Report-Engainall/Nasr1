import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const registerPath = join(
  process.cwd(),
  "docs",
  "bolt-source-reconciliation",
  "API_OPS_CONTRACT_REGISTER_2026-10-24.md",
);
const register = readFileSync(registerPath, "utf8");

describe("API-OPS semantic contract register", () => {
  it("keeps one authoritative live checkpoint and a concrete resume action", () => {
    expect(register).toContain("AUTHORITATIVE RECONCILIATION");
    expect(register).toContain("## NEXT_ACTION");
    expect(register).toContain("Poll Core/P2");
    expect(register).toContain("Do not merge without actual approval");
  });

  it("records semantic review beyond source-name inventory", () => {
    expect(register).toContain("179 callable RPC candidates");
    expect(register).toContain("الدفعة الدلالية الثامنة");
    expect(register).toContain("الدفعة الدلالية التاسعة");
    expect(register).toContain("الدفعة الدلالية العاشرة");
    expect(register).toContain("الدفعة الدلالية الحادية عشرة");
  });

  it("keeps security, tenancy, idempotency, and audit contracts discoverable", () => {
    for (const contract of [
      "start_stock_count",
      "set_stock_count_line",
      "complete_stock_count",
      "record_customer_payment",
      "reverse_general_journal_entry",
      "record_import_upload_chunk",
      "create_import_job_idempotent",
      "claim_async_export_jobs",
      "set_admin_customer_status",
      "accept_customer_activation_invitation",
      "accept_customer_company_invitation",
      "save_customer_address",
    ]) {
      expect(register, contract + " must be covered in the semantic register").toContain(contract);
    }
  });

  it("does not mislabel external evidence or partial acceptance as PASS", () => {
    expect(register).toContain("PARTIAL");
    expect(register).toContain("BLOCKED_EXTERNAL");
    expect(register).toContain("NOT RUN");
    expect(register).toContain("hosted authenticated customer E2E");
  });
});
