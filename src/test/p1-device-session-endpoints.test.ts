import { describe, expect, it } from "vitest";
import { validateP1DeviceSessionEndpoints } from "../../scripts/lib/p1-device-session-endpoints.mjs";

const API = "http://127.0.0.1:54321";
const DEFAULT_DATABASE = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ISOLATED_DATABASE = "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

describe("P1 device-session local fixture endpoint guard", () => {
  it("accepts ordinary local Supabase endpoints", () => {
    expect(validateP1DeviceSessionEndpoints(API, DEFAULT_DATABASE).origin).toBe(API);
  });

  it("accepts the isolated workflow PostgreSQL port without widening the host boundary", () => {
    expect(validateP1DeviceSessionEndpoints(API, ISOLATED_DATABASE).origin).toBe(API);
  });

  it("accepts a dynamically allocated PostgreSQL port while retaining loopback-only access", () => {
    expect(validateP1DeviceSessionEndpoints(API, "postgresql://postgres:postgres@127.0.0.1:55433/postgres").origin).toBe(API);
  });

  it.each([
    ["remote Supabase API", "https://example.supabase.co", DEFAULT_DATABASE],
    ["non-loopback database", API, "postgresql://postgres:secret@db.example.test:55432/postgres"],
    ["invalid database port", API, "postgresql://postgres:secret@127.0.0.1:0/postgres"],
    ["database URL without the expected database", API, "postgresql://postgres:secret@127.0.0.1:55432/other"],
    ["API on a different port", "http://127.0.0.1:54322", DEFAULT_DATABASE],
    ["API URL with embedded credentials", "http://user:secret@127.0.0.1:54321", DEFAULT_DATABASE],
  ])("rejects %s", (_label, apiUrl, databaseUrl) => {
    expect(() => validateP1DeviceSessionEndpoints(apiUrl, databaseUrl)).toThrow(/local-only/i);
  });

  it("rejects malformed connection strings without exposing them in the error", () => {
    expect(() => validateP1DeviceSessionEndpoints(API, "not-a-database-url"))
      .toThrow("P1 device-session fixtures require valid local Supabase API and PostgreSQL URLs.");
  });
});
