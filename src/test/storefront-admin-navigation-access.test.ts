import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const storefront = readFileSync(join(process.cwd(), "src/components/Storefront.tsx"), "utf8");
const authContext = readFileSync(join(process.cwd(), "src/lib/auth.tsx"), "utf8");
const adminApp = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");
const adminStyles = readFileSync(join(process.cwd(), "src/aghbari.css"), "utf8");

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
  it("exposes the mobile admin menu as a labelled, stateful navigation control", () => {
    expect(adminApp).toContain('aria-label="القائمة الإدارية"');
    expect(adminApp).toContain("aria-expanded={mobileNav}");
    expect(adminApp).toContain('aria-controls="admin-sidebar"');
    expect(adminApp).toContain('<nav aria-label="التنقل الإداري">');
    expect(adminApp).toContain("aria-current={view === id ? 'page' : undefined}");
  });

  it("closes the mobile menu with Escape, restores focus, and hides the closed drawer from keyboard navigation", () => {
    expect(adminApp).toContain("if (event.key !== 'Escape') return;");
    expect(adminApp).toContain("mobileMenuButtonRef.current?.focus()");
    expect(adminApp).toContain("firstMobileNavItemRef.current?.focus()");
    expect(adminStyles).toContain("visibility: hidden; transition: transform .25s ease, visibility 0s linear .25s;");
    expect(adminStyles).toContain(".sidebar.open { transform: translateX(0); visibility: visible;");
  });

});
