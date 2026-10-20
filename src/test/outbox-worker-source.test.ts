import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerSourcePath = fileURLToPath(
  new URL("../../supabase/functions/outbox-worker/index.ts", import.meta.url),
);
const workerSource = readFileSync(workerSourcePath, "utf8");

describe("outbox worker source wiring", () => {
  it("imports and uses the defined sanitized failure-message helper", () => {
    expect(workerSource).toContain(
      'import { classifyOutboxProcessResult, outboxFailureMessage } from "./logic.ts";',
    );
    expect(workerSource).toContain("p_error_message: outboxFailureMessage(error)");
    expect(workerSource).not.toMatch(/\bsafeErrorMessage\s*\(/);
  });
});
