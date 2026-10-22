import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pathTokenRoute = readFileSync(
  join(process.cwd(), "src", "routes", "invite.$token.tsx"),
  "utf8",
);
const queryTokenRoute = readFileSync(
  join(process.cwd(), "src", "routes", "company.accept-invitation.tsx"),
  "utf8",
);
const routeTreeSource = readFileSync(
  join(process.cwd(), "src", "routeTree.gen.ts"),
  "utf8",
);
const acceptanceSource = readFileSync(
  join(process.cwd(), "src", "components", "CustomerCompanyMembers.tsx"),
  "utf8",
);

describe("company invitation bearer-token route security", () => {
  it("prevents indexing, link following and Referer disclosure from both invitation URL forms", () => {
    for (const routeSource of [pathTokenRoute, queryTokenRoute]) {
      expect(routeSource).toMatch(/name:\s*"robots",\s*content:\s*"noindex, nofollow"/);
      expect(routeSource).toMatch(/name:\s*"referrer",\s*content:\s*"no-referrer"/);
    }
  });

  it("keeps the path-token route registered and passes its token within ClientOnly", () => {
    expect(pathTokenRoute).toContain('createFileRoute("/invite/$token")');
    expect(routeTreeSource).toContain(
      "import { Route as InviteTokenRouteImport } from './routes/invite.$token'",
    );
    expect(routeTreeSource).toContain("id: '/invite/$token'");
    expect(routeTreeSource).toContain("path: '/invite/$token'");
    expect(pathTokenRoute).toContain("<CompanyInvitationAcceptancePage initialToken={token} />");
    expect(pathTokenRoute).toContain("<ClientOnly fallback=");
  });

  it("keeps the query-token route registered", () => {
    expect(queryTokenRoute).toContain('createFileRoute("/company/accept-invitation")');
    expect(routeTreeSource).toContain("'/company/accept-invitation'");
  });

  it("removes the bearer token URL after the server accepts the invitation", () => {
    expect(acceptanceSource).toContain("await acceptCompanyInvitation(token)");
    expect(acceptanceSource).toContain('window.history.replaceState(null,"","/company/accept-invitation")');
  });
});
