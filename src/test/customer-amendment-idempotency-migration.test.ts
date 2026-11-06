import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261106300000_customer_amendment_idempotency_payload_guard.sql",
), "utf8");
const customerOrders = readFileSync(join(
  process.cwd(),
  "src/components/CustomerOrders.tsx",
), "utf8");

describe("customer amendment idempotency payload binding", () => {
  it("replaces the canonical RPC only after the immutable snapshot migration", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_customer_order_amendment\(/i);
    expect(migration).toContain("public.customer_order_amendment_line_snapshots");
    expect(migration).toContain("s.proposed_quantity");
  });

  it("accepts a replay only for the same note and complete exact line set", () => {
    const replay = migration.slice(
      migration.indexOf("IF FOUND THEN", migration.indexOf("CREATE OR REPLACE FUNCTION")),
      migration.indexOf("IF v_order.status NOT IN", migration.indexOf("CREATE OR REPLACE FUNCTION")),
    );
    expect(replay).toMatch(/v_amendment\.note IS DISTINCT FROM v_note/i);
    expect(replay).toMatch(/v_replay_match_count IS DISTINCT FROM v_amendment\.line_count/i);
    expect(replay).toMatch(/v_replay_unique_count IS DISTINCT FROM v_amendment\.line_count/i);
    expect(replay).toMatch(/v_replay_snapshot_count IS DISTINCT FROM v_amendment\.line_count/i);
    expect(replay).toMatch(/jsonb_object_length\(submitted\.line\) = 2/i);
    expect(replay).toMatch(/مفتاح إعادة الإرسال مرتبط بمحتوى مختلف/);
    expect(replay).toMatch(/'replayed',true/);
  });

  it("keeps customer edits quantity-only and binds browser retries to the exact submitted fingerprint", () => {
    expect(migration).toMatch(/لا يسمح بإرسال سعر أو حالة أو قيمة مالية ضمن تعديل العميل/);
    expect(customerOrders).toMatch(/const amendmentRequestFingerprint = useRef<string \| null>\(null\)/);
    expect(customerOrders).toMatch(/const requestFingerprint = JSON\.stringify\(\{/);
    expect(customerOrders).toMatch(/amendmentRequestFingerprint\.current === requestFingerprint/);
    expect(customerOrders).toMatch(/amendmentRequestFingerprint\.current = null/);
  });
});
