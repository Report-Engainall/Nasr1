import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const storefront = readFileSync(join(process.cwd(), "src/components/Storefront.tsx"), "utf8");
const authContext = readFileSync(join(process.cwd(), "src/lib/auth.tsx"), "utf8");

describe("storefront dashboard navigation access", () => {
  it("renders the admin entry only for a server-derived staff identity", () => {
    expect(authContext).toContain("isStaff: p.roles.some((r) => STAFF_ROLES.includes(r))");
    expect(storefront).toMatch(
      /\{user\?\.isStaff === true && \(\s*<button className="sf-admin-btn" onClick=\{onExit\}>/s,
    );
  });

  it("keeps the dashboard action out of the customer and signed-out header path", () => {
    const adminEntry = storefront.indexOf('<button className="sf-admin-btn" onClick={onExit}>');
    expect(adminEntry).toBeGreaterThan(-1);
    const gateStart = storefront.lastIndexOf("{user?.isStaff === true && (", adminEntry);
    expect(gateStart).toBeGreaterThan(-1);
    expect(storefront.slice(gateStart, adminEntry)).not.toContain("user?.roles");
    expect(storefront.slice(gateStart, adminEntry)).toContain("user?.isStaff === true");
  });
});
