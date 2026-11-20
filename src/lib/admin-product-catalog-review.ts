import type { ProductWithInventory } from './types';
import { getProductImageDisplayStatus } from './product-image-batch-match';

export type AdminCatalogReviewProduct = {
  id: string;
  name: string;
  item_code: string;
  issues: string[];
};

export type AdminCatalogDuplicateIdentifier = {
  kind: 'رمز الصنف' | 'SKU' | 'الباركود';
  value: string;
  products: Array<{ id: string; name: string; item_code: string }>;
};

export type AdminProductCatalogReview = {
  totalProducts: number;
  missingPrimaryImage: AdminCatalogReviewProduct[];
  missingUnit: AdminCatalogReviewProduct[];
  missingDescription: AdminCatalogReviewProduct[];
  missingBasePrice: AdminCatalogReviewProduct[] | null;
  duplicateIdentifiers: AdminCatalogDuplicateIdentifier[];
  productsWithIssues: AdminCatalogReviewProduct[];
};

type IdentifierKind = AdminCatalogDuplicateIdentifier['kind'];

function productSummary(product: ProductWithInventory, issues: string[]): AdminCatalogReviewProduct {
  return { id: product.id, name: product.name, item_code: product.item_code, issues };
}

/** Audits the complete caller-supplied catalog; unknown or hidden prices are never treated as zero. */
export function reviewAdminProductCatalog(
  products: readonly ProductWithInventory[],
  canViewBasePrice: boolean,
): AdminProductCatalogReview {
  const missingPrimaryImage: AdminCatalogReviewProduct[] = [];
  const missingUnit: AdminCatalogReviewProduct[] = [];
  const missingDescription: AdminCatalogReviewProduct[] = [];
  const missingBasePrice: AdminCatalogReviewProduct[] | null = canViewBasePrice ? [] : null;
  const issueMap = new Map<string, AdminCatalogReviewProduct>();
  const identifiers = new Map<string, { kind: IdentifierKind; value: string; products: Array<{ id: string; name: string; item_code: string }> }>();

  const addIssue = (product: ProductWithInventory, issue: string) => {
    const current = issueMap.get(product.id) ?? productSummary(product, []);
    if (!current.issues.includes(issue)) current.issues.push(issue);
    issueMap.set(product.id, current);
  };

  for (const product of products) {
    const image = getProductImageDisplayStatus(product.image_url, product.image_gallery_urls);
    if (!image.hasPrimary) {
      missingPrimaryImage.push(productSummary(product, ['لا توجد صورة رئيسية']));
      addIssue(product, 'لا توجد صورة رئيسية');
    }
    if (typeof product.unit !== 'string' || !product.unit.trim()) {
      missingUnit.push(productSummary(product, ['وحدة البيع غير محددة']));
      addIssue(product, 'وحدة البيع غير محددة');
    }
    if (typeof product.description !== 'string' || !product.description.trim()) {
      missingDescription.push(productSummary(product, ['وصف المنتج فارغ']));
      addIssue(product, 'وصف المنتج فارغ');
    }
    if (canViewBasePrice && (typeof product.base_price !== 'number' || !Number.isFinite(product.base_price) || product.base_price < 0)) {
      missingBasePrice!.push(productSummary(product, ['سعر الأساس غير متاح']));
      addIssue(product, 'سعر الأساس غير متاح');
    }

    const productRef = { id: product.id, name: product.name, item_code: product.item_code };
    const fields: Array<[IdentifierKind, string | null | undefined]> = [
      ['رمز الصنف', product.item_code],
      ['SKU', product.sku],
      ['الباركود', product.barcode],
    ];
    for (const [kind, raw] of fields) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!value) continue;
      const normalized = value.toLocaleUpperCase('en');
      const key = kind + ':' + normalized;
      const existing = identifiers.get(key);
      if (existing) {
        if (!existing.products.some((entry) => entry.id === product.id)) existing.products.push(productRef);
      } else {
        identifiers.set(key, { kind, value, products: [productRef] });
      }
    }
  }

  const duplicateIdentifiers = [...identifiers.values()].filter((entry) => entry.products.length > 1);
  for (const duplicate of duplicateIdentifiers) {
    for (const product of duplicate.products) {
      const target = products.find((entry) => entry.id === product.id);
      if (target) addIssue(target, duplicate.kind + ' مكرر: ' + duplicate.value);
    }
  }

  return {
    totalProducts: products.length,
    missingPrimaryImage,
    missingUnit,
    missingDescription,
    missingBasePrice,
    duplicateIdentifiers,
    productsWithIssues: [...issueMap.values()].sort((a, b) => a.item_code.localeCompare(b.item_code, 'ar')),
  };
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  // Prevent spreadsheet formula execution when catalog text starts with a formula marker.
  const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Exports only catalog fields allowed by the caller's price-read capability. */
export function buildAdminProductCatalogCsv(
  products: readonly ProductWithInventory[],
  canViewBasePrice: boolean,
): string {
  const columns: Array<{ header: string; value: (product: ProductWithInventory) => string | number | boolean | null | undefined }> = [
    { header: 'رمز الصنف', value: (product) => product.item_code },
    { header: 'اسم المنتج', value: (product) => product.name },
    { header: 'SKU', value: (product) => product.sku ?? null },
    { header: 'الباركود', value: (product) => product.barcode ?? null },
    { header: 'التصنيف', value: (product) => product.category?.name ?? null },
    { header: 'وحدة البيع', value: (product) => product.unit },
    { header: 'الوصف', value: (product) => product.description ?? null },
    { header: 'حالة النشر', value: (product) => product.status === 'active' ? 'نشط' : product.status === 'inactive' ? 'مؤرشف' : 'غير محدد' },
    { header: 'منتج مميز', value: (product) => product.is_featured ? 'نعم' : 'لا' },
    { header: 'الحد الأدنى للطلب', value: (product) => product.min_order_quantity ?? 1 },
    { header: 'مضاعف كمية الطلب', value: (product) => product.order_quantity_multiple ?? 1 },
  ];
  if (canViewBasePrice) columns.push({ header: 'سعر الأساس', value: (product) => product.base_price });
  return [
    columns.map((column) => csvCell(column.header)).join(','),
    ...products.map((product) => columns.map((column) => csvCell(column.value(product))).join(',')),
  ].join('\r\n');
}
