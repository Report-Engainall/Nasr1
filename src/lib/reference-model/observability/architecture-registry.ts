import { ADMIN_NAV_GROUPS } from "@/lib/admin-access-matrix";
import { routeTree } from "@/routeTree.gen";

export type ArchitectureRouteSurface = "ADMIN" | "API" | "PUBLIC";

export interface ArchitectureNavigationGroup {
  id: string;
  label: string;
}

export interface ArchitectureRouteRecord {
  routeId: string;
  path: string;
  parentRouteId: string | null;
  surface: ArchitectureRouteSurface;
  viewId: string | null;
  navigationGroup: ArchitectureNavigationGroup | null;
  dynamicSegmentCount: number;
  hasChildren: boolean;
}

export interface ArchitectureRegistrySnapshot {
  source: "TANSTACK_ROUTER_FILE_TREE";
  routes: ArchitectureRouteRecord[];
  warnings: string[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string =>
    typeof value === "string" && value.trim().length > 0,
  );
}

function routeOptions(node: UnknownRecord): UnknownRecord {
  return isRecord(node.options) ? node.options : {};
}

function readChildren(node: UnknownRecord): UnknownRecord[] {
  const children = node.children;
  if (Array.isArray(children)) return children.filter(isRecord);
  if (!isRecord(children)) return [];
  return Object.values(children).filter(isRecord);
}

function normalizePath(path: string): string {
  const leadingSlash = path.startsWith("/") ? path : `/${path}`;
  const compact = leadingSlash.replace(/\/{2,}/g, "/");
  if (compact === "/") return compact;
  return compact.replace(/\/+$/, "");
}

function joinRoutePath(parentPath: string, childPath: string): string {
  if (childPath === "/") return parentPath || "/";
  if (childPath.startsWith("/")) return normalizePath(childPath);
  const base = parentPath === "/" ? "" : parentPath;
  return normalizePath(`${base}/${childPath}`);
}

function readRoutePath(node: UnknownRecord, parentPath: string): string {
  const options = routeOptions(node);
  const fullPath = firstString(node.fullPath, options.fullPath);
  if (fullPath) return normalizePath(fullPath);

  const path = firstString(node.path, options.path);
  if (!path) return parentPath || "/";
  return joinRoutePath(parentPath, path);
}

function routeSurface(routeId: string, path: string): ArchitectureRouteSurface {
  if (path === "/admin" || path.startsWith("/admin/") || routeId.startsWith("/admin_/")) {
    return "ADMIN";
  }
  if (path === "/api" || path.startsWith("/api/") || routeId.startsWith("/api.")) {
    return "API";
  }
  return "PUBLIC";
}

function adminViewId(routeId: string, navigationGroups: readonly (typeof ADMIN_NAV_GROUPS)[number][]): string | null {
  const match = routeId.match(/^\/admin_\/(.+)$/);
  if (!match) return null;

  const candidate = match[1].replace(/\/+$/, "");
  return navigationGroups.some((group) => group.views.some((view) => view === candidate))
    ? candidate
    : null;
}

/**
 * Builds a read-only route inventory from the actual TanStack Router file tree.
 * It deliberately does not infer server authorization or route availability.
 */
export function buildArchitectureRegistry(
  root: unknown,
  navigationGroups: readonly (typeof ADMIN_NAV_GROUPS)[number][] = ADMIN_NAV_GROUPS,
): ArchitectureRegistrySnapshot {
  const routes: ArchitectureRouteRecord[] = [];
  const warnings: string[] = [];
  const visitedNodes = new WeakSet<object>();
  const routeIds = new Set<string>();

  if (!isRecord(root)) {
    return {
      source: "TANSTACK_ROUTER_FILE_TREE",
      routes,
      warnings: ["ROUTE_TREE_UNAVAILABLE"],
    };
  }

  const visit = (node: UnknownRecord, parentRouteId: string | null, parentPath: string) => {
    if (visitedNodes.has(node)) {
      warnings.push("DUPLICATE_ROUTE_NODE");
      return;
    }
    visitedNodes.add(node);

    const options = routeOptions(node);
    const routeId = firstString(node.id, options.id);
    const path = readRoutePath(node, parentPath);
    const children = readChildren(node);

    if (!routeId) {
      warnings.push("ROUTE_ID_MISSING");
      children.forEach((child) => visit(child, parentRouteId, path));
      return;
    }

    const viewId = adminViewId(routeId, navigationGroups);
    const group = viewId
      ? navigationGroups.find((candidate) => candidate.views.includes(viewId as never))
      : undefined;

    if (routeIds.has(routeId)) {
      warnings.push("DUPLICATE_ROUTE_ID");
    } else {
      routeIds.add(routeId);
      routes.push({
        routeId,
        path,
        parentRouteId,
        surface: routeSurface(routeId, path),
        viewId,
        navigationGroup: group ? { id: group.id, label: group.label } : null,
        dynamicSegmentCount: path.split("/").filter((segment) => segment.startsWith("$")).length,
        hasChildren: children.length > 0,
      });
    }

    children.forEach((child) => visit(child, routeId, path));
  };

  visit(root, null, "/");

  routes.sort((left, right) =>
    left.path.localeCompare(right.path) || left.routeId.localeCompare(right.routeId),
  );

  return {
    source: "TANSTACK_ROUTER_FILE_TREE",
    routes,
    warnings: [...new Set(warnings)],
  };
}

/** Uses the application's generated route tree and existing admin navigation groups. */
export function getCurrentArchitectureRegistry(): ArchitectureRegistrySnapshot {
  return buildArchitectureRegistry(routeTree);
}
