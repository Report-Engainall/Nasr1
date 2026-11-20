import { describe, expect, it } from "vitest";
import {
  assertCanonicalSupabaseUrl,
  assertClientSupabaseUrl,
  assertLocalSupabaseE2EUrl,
} from "./project-config";

describe("Supabase endpoint guards", () => {
  it("keeps the official project as the only default client endpoint", () => {
    expect(assertClientSupabaseUrl("https://tfdwtuwkdddnzgyhcoyy.supabase.co"))
      .toBe("https://tfdwtuwkdddnzgyhcoyy.supabase.co");
    expect(() => assertClientSupabaseUrl("http://127.0.0.1:54321")).toThrow(/canonical Nasr1 Supabase project/);
  });

  it("allows an explicitly enabled local P2 loopback endpoint", () => {
    expect(assertClientSupabaseUrl("http://127.0.0.1:54321", true))
      .toBe("http://127.0.0.1:54321");
    expect(assertClientSupabaseUrl("http://localhost:54321/", true))
      .toBe("http://localhost:54321");
  });

  it("does not accept local endpoints unless the build explicitly enables the test-only path", () => {
    expect(() => assertClientSupabaseUrl("http://127.0.0.1:54321", false)).toThrow();
    expect(() => assertClientSupabaseUrl("http://127.0.0.1:54321")).toThrow();
  });

  it("rejects non-loopback, remote, HTTPS, and malformed local endpoints", () => {
    const rejected = [
      "http://192.168.1.10:54321",
      "http://10.0.0.5:54321",
      "http://localhost.evil.example:54321",
      "https://localhost:54321",
      "http://127.0.0.1",
      "http://user:pass@127.0.0.1:54321",
      "http://127.0.0.1:54321/rest/v1",
      "http://127.0.0.1:54321/?override=1",
      "http://127.0.0.1:54321/#fragment",
    ];

    for (const endpoint of rejected) {
      expect(() => assertLocalSupabaseE2EUrl(endpoint), endpoint).toThrow();
    }
  });

  it("preserves the strict production canonical URL validator", () => {
    expect(assertCanonicalSupabaseUrl("https://tfdwtuwkdddnzgyhcoyy.supabase.co/"))
      .toBe("https://tfdwtuwkdddnzgyhcoyy.supabase.co");
    expect(() => assertCanonicalSupabaseUrl("https://other-project.supabase.co")).toThrow();
  });
});
