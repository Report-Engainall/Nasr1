export type CartSummaryLine = { product_id: string; quantity: number };
export type CartSummaryProduct = {
  id: string;
  name: string;
  unit: string;
  category_id: string | null;
};
export type CartSummaryCategory = { id: string; name: string };
export type CartSummaryGroup = {
  categoryId: string | null;
  categoryName: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }>;
};

export function summarizeCartLines(lines: readonly CartSummaryLine[]): {
  skuCount: number;
  totalQuantity: number;
} {
  return {
    skuCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export function groupCartLinesByCategory(
  lines: readonly CartSummaryLine[],
  products: readonly CartSummaryProduct[],
  categories: readonly CartSummaryCategory[],
): CartSummaryGroup[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const groups = new Map<string, CartSummaryGroup>();

  for (const line of lines) {
    const product = productsById.get(line.product_id);
    const categoryId = product?.category_id ?? null;
    const key = categoryId ?? "__uncategorized__";
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId,
        categoryName: categoryId ? categoriesById.get(categoryId) ?? "تصنيف غير معروف" : "غير مصنف",
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push({
      productId: line.product_id,
      productName: product?.name ?? "صنف لم يعد متاحًا",
      quantity: line.quantity,
      unit: product?.unit ?? "",
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.productName.localeCompare(b.productName, "ar")),
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, "ar"));
}


/** Compare server and browser cart drafts without depending on line ordering. */
export function cartLineSetsMatch(
  left: readonly CartSummaryLine[],
  right: readonly CartSummaryLine[],
): boolean {
  if (left.length !== right.length) return false;
  const quantities = new Map(left.map((line) => [line.product_id.toLowerCase(), line.quantity]));
  if (quantities.size !== left.length) return false;
  for (const line of right) {
    if (quantities.get(line.product_id.toLowerCase()) !== line.quantity) return false;
  }
  return true;
}
