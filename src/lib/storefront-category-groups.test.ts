import { describe, expect, it } from "vitest";
import type { Category } from "@/lib/types";
import { groupStorefrontCategories } from "./storefront-category-groups";

function category(id: string, parentId: string | null): Category {
  return {
    id,
    name: id,
    name_en: null,
    code: null,
    description: null,
    parent_id: parentId,
    sort_order: 1,
    is_active: true,
    icon: null,
  };
}

describe("groupStorefrontCategories", () => {
  it("groups direct children under their visible parent and preserves input order", () => {
    const root = category("root", null);
    const firstChild = category("first-child", root.id);
    const secondChild = category("second-child", root.id);
    const otherRoot = category("other-root", null);
    const otherChild = category("other-child", otherRoot.id);

    const result = groupStorefrontCategories([root, firstChild, secondChild, otherRoot, otherChild]);

    expect(result.groups).toEqual([
      { category: root, children: [firstChild, secondChild], detached: false },
      { category: otherRoot, children: [otherChild], detached: false },
    ]);
    expect(result.additionalCategories).toEqual([]);
  });

  it("keeps categories whose parent is inactive or absent as visible independent groups", () => {
    const orphan = category("orphan", "inactive-parent");

    const result = groupStorefrontCategories([orphan]);

    expect(result.groups).toEqual([
      { category: orphan, children: [], detached: true },
    ]);
    expect(result.additionalCategories).toEqual([]);
  });

  it("does not drop deeper descendants or cyclic data from the public directory", () => {
    const root = category("root", null);
    const child = category("child", root.id);
    const grandchild = category("grandchild", child.id);
    const cycleA = category("cycle-a", "cycle-b");
    const cycleB = category("cycle-b", "cycle-a");

    const result = groupStorefrontCategories([root, child, grandchild, cycleA, cycleB]);

    expect(result.groups).toEqual([
      { category: root, children: [child], detached: false },
    ]);
    expect(result.additionalCategories).toEqual([grandchild, cycleA, cycleB]);

    const visibleIds = [
      ...result.groups.flatMap((group) => [group.category.id, ...group.children.map((item) => item.id)]),
      ...result.additionalCategories.map((item) => item.id),
    ];
    expect(visibleIds).toHaveLength(new Set(visibleIds).size);
    expect(new Set(visibleIds)).toEqual(new Set([root.id, child.id, grandchild.id, cycleA.id, cycleB.id]));
  });
});
