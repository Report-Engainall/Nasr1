import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest's transformed import.meta.url is not guaranteed to be a file: URL.
const workerDirectory = join(process.cwd(), "supabase", "functions", "outbox-worker");
const workerSource = readFileSync(join(workerDirectory, "index.ts"), "utf8");
const handlerSource = readFileSync(join(workerDirectory, "handler.ts"), "utf8");

describe("outbox worker source wiring", () => {
  it("keeps the Edge entrypoint limited to runtime adapters and handler registration", () => {
    expect(workerSource).toContain('import { createOutboxWorkerHandler } from "./handler.ts";');
    expect(workerSource).toContain("runtime.serve(createOutboxWorkerHandler(");
    expect(workerSource).toContain("readBoundedTextBody(");
    expect(workerSource).not.toContain('rpc("claim_outbox_events"');
    expect(workerSource).not.toContain('rpc("process_outbox_event"');
    expect(workerSource).not.toContain('rpc("fail_outbox_event"');
  });

  it("keeps the existing sanitized failure-message helper in the extracted handler", () => {
    expect(handlerSource).toContain('import {');
    expect(handlerSource).toContain('outboxFailureMessage(error)');
    expect(handlerSource).toContain('classifyOutboxProcessResult(data)');
    expect(handlerSource).not.toMatch(/\\bsafeErrorMessage\\s*\\(/);
  });
});
