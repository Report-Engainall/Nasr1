import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBoundedTextBody } from "../../supabase/functions/_shared/bounded-body";

const root = process.cwd();
const routes = [
  { name: "AI gateway", path: "supabase/functions/ai-gateway/index.ts", cap: 4096 },
  { name: "outbox worker", path: "supabase/functions/outbox-worker/index.ts", cap: 4096 },
  { name: "async export worker", path: "supabase/functions/async-export-worker/index.ts", cap: 4096 },
  { name: "async export download", path: "supabase/functions/async-export-download/index.ts", cap: 2048 },
];

describe("bounded streaming Edge Function request bodies", () => {
  it("keeps valid UTF-8 text intact within the byte limit", async () => {
    const text = JSON.stringify({ question: "كيف أراجع الطلبات؟" });
    const bytes = new TextEncoder().encode(text);
    const result = await readBoundedTextBody(
      new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      bytes.byteLength,
    );
    expect(result).toEqual({ ok: true, text });
  });

  it("cancels an over-limit stream without pulling further chunks", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 2) controller.enqueue(new Uint8Array([1, 2, 3]));
        else controller.enqueue(new Uint8Array([4]));
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const result = await readBoundedTextBody(body, 4);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(pulls).toBe(2);
    expect(cancelled).toBe(true);
  });

  it("rejects declared oversize bodies without reading them", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const result = await readBoundedTextBody(body, 4, "5");
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(pulls).toBe(0);
    expect(cancelled).toBe(true);
  });

  it("rejects malformed UTF-8 rather than silently replacing bytes", async () => {
    const result = await readBoundedTextBody(
      new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); } }),
      8,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_utf8" });
  });

  it("handles a missing body as an empty body", async () => {
    expect(await readBoundedTextBody(null, 1)).toEqual({ ok: true, text: "" });
  });

  it.each(routes)("$name uses the bounded streaming reader and byte cap", ({ path, cap }) => {
    const source = readFileSync(join(root, path), "utf8");
    expect(source).toContain("readBoundedTextBody(request.body");
    expect(source).toContain(`readBoundedTextBody(request.body, ${cap}, request.headers.get("content-length"))`);
    expect(source).not.toContain("request.text()");
  });
});
