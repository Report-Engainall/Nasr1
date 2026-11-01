import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forgotRoute = readFileSync(
  join(process.cwd(), "src", "routes", "forgot-password.tsx"),
  "utf8",
);
const resetRoute = readFileSync(
  join(process.cwd(), "src", "routes", "reset-password.tsx"),
  "utf8",
);
const routeTree = readFileSync(
  join(process.cwd(), "src", "routeTree.gen.ts"),
  "utf8",
);


const resetRouteTryPattern = /try\s*\{[\s\S]*?supabase\.auth\.updateUser\(\{ password \}\)/;
const resetRouteCatchPattern = /catch\s*\{[\s\S]*?setMsg\("تعذر الاتصال بالخادم/;
const resetRouteFinallyPattern = /finally\s*\{\s*setBusy\(false\);\s*\}/;

function expectResetRouteTransportFailureHandling(): void {
  expect(resetRoute).toMatch(resetRouteTryPattern);
  expect(resetRoute).toMatch(resetRouteCatchPattern);
  expect(resetRoute).toMatch(resetRouteFinallyPattern);
}

describe("password recovery and reset route security", () => {
  it("keeps recovery and reset pages out of search indexing and suppresses referrer disclosure", () => {
    for (const source of [forgotRoute, resetRoute]) {
      expect(source).toMatch(/name:\s*"robots",\s*content:\s*"noindex, nofollow"/);
      expect(source).toMatch(/name:\s*"referrer",\s*content:\s*"no-referrer"/);
    }
  });

  it("keeps both first-party authentication routes registered", () => {
    expect(routeTree).toContain("'/forgot-password'");
    expect(routeTree).toContain("'/reset-password'");
    expect(forgotRoute).toContain('createFileRoute("/forgot-password")');
    expect(resetRoute).toContain('createFileRoute("/reset-password")');
  });

  it("updates through the authenticated Supabase session and does not navigate on returned errors", () => {
    expect(resetRoute).toContain("supabase.auth.updateUser({ password })");
    expect(resetRoute).toMatch(/if\s*\(error\)\s*\{\s*setMsg\(/);
    expect(resetRoute).toMatch(/if\s*\(error\)[\s\S]*?return;[\s\S]*?void navigate\(\{\s*to:\s*"\/"\s*\}\)/);
  });

  it("catches thrown transport failures and always clears the busy state", () => {
    expectResetRouteTransportFailureHandling();
  });
});
