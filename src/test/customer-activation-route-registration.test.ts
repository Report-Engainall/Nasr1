import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = join(process.cwd(), "src", "routes", "customer.activate.$token.tsx");
const routeTreePath = join(process.cwd(), "src", "routeTree.gen.ts");
const routeSource = readFileSync(routePath, "utf8");
const routeTreeSource = readFileSync(routeTreePath, "utf8");

describe("customer activation source-route integration", () => {
  it("keeps the activation route registered in the generated TanStack route tree", () => {
    expect(routeSource).toContain('createFileRoute("/customer/activate/$token")');
    expect(routeTreeSource).toContain(
      "import { Route as CustomerActivateTokenRouteImport } from './routes/customer.activate.$token'",
    );
    expect(routeTreeSource).toContain("id: '/customer/activate/$token'");
    expect(routeTreeSource).toContain("path: '/customer/activate/$token'");
    expect(routeTreeSource).toContain("CustomerActivateTokenRouteImport");
  });

  it("keeps bearer-token pages out of indexing and suppresses referrer disclosure", () => {
    expect(routeSource).toMatch(/name:\s*"robots",\s*content:\s*"noindex, nofollow"/);
    expect(routeSource).toMatch(/name:\s*"referrer",\s*content:\s*"no-referrer"/);
  });

  it("passes the route token to the activation page only inside the client-only boundary", () => {
    expect(routeSource).toMatch(/const\s*\{\s*token\s*\}\s*=\s*Route\.useParams\(\)/);
    expect(routeSource).toContain("<CustomerActivationInvitationPage token={token} />");
    expect(routeSource).toContain("<ClientOnly fallback=");
  });
});
