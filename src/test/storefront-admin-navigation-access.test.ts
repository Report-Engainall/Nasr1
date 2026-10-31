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
    expect(adminApp).toContain("const focusWhenDrawerIsReady = () =>");
    expect(adminApp).toContain("const isVisible =");
    expect(adminApp).toContain("const hasActiveMotion =");
    expect(adminApp).toContain("firstItem.focus({ preventScroll: true })");
    expect(adminApp).toContain("animation.playState === 'running' || animation.playState === 'pending'");
    expect(adminApp).toContain("cancelled = true");
    expect(adminApp).toContain("const navigateAdmin = (id: View, restoreMobileFocus: boolean) =>");
    expect(adminApp).toContain("'.mobile-menu[aria-controls=\"admin-sidebar\"]'");
    expect(adminApp).toContain("Promise.resolve(navigation).then(() =>");
    expect(adminApp).toContain("const restoreMobileFocus = closeMobileNav()");
    expect(adminStyles).toContain("transform: none; clip-path: inset(0 0 0 100%); visibility: hidden; transition: clip-path .25s ease, visibility 0s linear .25s;");
    expect(adminStyles).toContain(".sidebar.open { transform: none; clip-path: inset(0); visibility: visible; transition: clip-path .25s ease, visibility 0s;");
  });

});
