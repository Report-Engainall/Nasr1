import { supabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY_CODE = /^[A-Z]{2}$/;

export type ProductSpecification = {
  name: string;
  value: string;
  unit: string | null;
};

export type ProductRecommendation = {
  id: string;
  name: string;
  item_code: string;
  unit: string;
  image_url: string | null;
  brand_name: string | null;
};

export type StorefrontProductFacts = {
  productId: string;
  brand: { id: string; name: string; name_en: string | null } | null;
  countryOfOriginCode: string | null;
  specifications: ProductSpecification[];
  packaging: {
    packageSizeValue: number | null;
    packageSizeUnit: string | null;
    cartonUnitName: string | null;
    unitsPerCarton: number | null;
  } | null;
  alternatives: ProductRecommendation[];
  complements: ProductRecommendation[];
};

export type AdminStorefrontProductDetails = {
  brandName: string;
  brandNameEn: string;
  countryOfOriginCode: string;
  originVerified: boolean;
  specifications: ProductSpecification[];
  specificationsVerified: boolean;
  packageSizeValue: number | null;
  packageSizeUnit: string;
  cartonUnitName: string;
  packagingVerified: boolean;
  alternatives: string[];
  complements: string[];
};

export const EMPTY_ADMIN_STOREFRONT_PRODUCT_DETAILS: AdminStorefrontProductDetails = {
  brandName: "",
  brandNameEn: "",
  countryOfOriginCode: "",
  originVerified: false,
  specifications: [],
  specificationsVerified: false,
  packageSizeValue: null,
  packageSizeUnit: "",
  cartonUnitName: "",
  packagingVerified: false,
  alternatives: [],
  complements: [],
};

type RpcError = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcInvoker = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

// The generated Supabase type file is refreshed by the schema-generation pipeline.
// Keep the extended RPC contract typed locally until that generated snapshot lands.
const invokeRpc = supabase.rpc.bind(supabase) as unknown as RpcInvoker;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim() && value.trim().length <= maxLength
    ? value.trim()
    : null;
}

function parseSpecification(value: unknown): ProductSpecification | null {
  if (!isRecord(value)) return null;
  const name = optionalText(value.name, 60);
  const specificationValue = optionalText(value.value, 200);
  const unit = value.unit === null || value.unit === undefined
    ? null
    : optionalText(value.unit, 40);
  if (!name || !specificationValue || (value.unit !== null && value.unit !== undefined && unit === null)) {
    return null;
  }
  return { name, value: specificationValue, unit };
}

function parseSpecifications(value: unknown): ProductSpecification[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("أعاد الخادم قائمة مواصفات غير صالحة.");
  }
  const specifications = value.map(parseSpecification);
  if (specifications.some((item) => item === null)) {
    throw new Error("تحتوي مواصفات المنتج على سجل غير مكتمل؛ لم تُعرض بيانات جزئية.");
  }
  const names = specifications.map((item) => item!.name.toLocaleLowerCase("ar"));
  if (new Set(names).size !== names.length) {
    throw new Error("أعاد الخادم أسماء مواصفات مكررة؛ لم تُعرض.");
  }
  return specifications as ProductSpecification[];
}

function parseRecommendation(value: unknown): ProductRecommendation | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID.test(value.id)) return null;
  const name = optionalText(value.name, 200);
  const itemCode = optionalText(value.item_code, 100);
  const unit = optionalText(value.unit, 40);
  if (!name || !itemCode || !unit) return null;
  const image = optionalText(value.image_url, 2048);
  const imageUrl = image && /^https:\/\//i.test(image) ? image : null;
  return {
    id: value.id,
    name,
    item_code: itemCode,
    unit,
    image_url: imageUrl,
    brand_name: optionalText(value.brand_name, 120),
  };
}

function parseRecommendations(value: unknown): ProductRecommendation[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("أعاد الخادم علاقات منتجات غير صالحة.");
  }
  const parsed = value.map(parseRecommendation);
  if (parsed.some((item) => item === null)) {
    throw new Error("تحتوي توصيات المنتج على مرجع غير مكتمل؛ لم تُعرض.");
  }
  const ids = parsed.map((item) => item!.id);
  if (new Set(ids).size !== ids.length) throw new Error("أعاد الخادم توصيات مكررة؛ لم تُعرض.");
  return parsed as ProductRecommendation[];
}

export function parseStorefrontProductFactsRow(value: unknown, expectedProductId: string): StorefrontProductFacts {
  if (!isRecord(value) || value.id !== expectedProductId) {
    throw new Error("لم تتطابق تفاصيل المنتج مع الصنف المطلوب.");
  }

  let brand: StorefrontProductFacts["brand"] = null;
  if (value.brand !== null && value.brand !== undefined) {
    if (!isRecord(value.brand) || value.brand.id !== value.brand_id) {
      throw new Error("هوية العلامة التجارية غير متسقة؛ لم تُعرض.");
    }
    const name = optionalText(value.brand.name, 120);
    if (!name || typeof value.brand.id !== "string" || !UUID.test(value.brand.id)) {
      throw new Error("اسم العلامة التجارية غير صالح؛ لم يُعرض.");
    }
    brand = {
      id: value.brand.id,
      name,
      name_en: optionalText(value.brand.name_en, 120),
    };
  }

  if (value.country_of_origin_code !== null && value.country_of_origin_code !== undefined
      && (typeof value.country_of_origin_code !== "string" || !COUNTRY_CODE.test(value.country_of_origin_code))) {
    throw new Error("أعاد الخادم رمز بلد منشأ غير صالح؛ لم تُعرض بيانات غير موثوقة.");
  }
  const countryCode = typeof value.country_of_origin_code === "string"
    ? value.country_of_origin_code
    : null;

  let packaging: StorefrontProductFacts["packaging"] = null;
  if (value.packaging !== null && value.packaging !== undefined) {
    if (!isRecord(value.packaging)) throw new Error("بيانات العبوة غير صالحة.");
    const rawSize = value.packaging.package_size_value;
    const packageSizeValue = rawSize === null ? null : finiteNumber(rawSize);
    const packageSizeUnit = rawSize === null ? null : optionalText(value.packaging.package_size_unit, 40);
    if (rawSize !== null && (packageSizeValue === null || packageSizeValue <= 0 || packageSizeUnit === null)) {
      throw new Error("حجم العبوة غير مكتمل؛ لم يُعرض.");
    }
    const cartonUnitName = optionalText(value.packaging.carton_unit_name, 40);
    const rawFactor = value.packaging.units_per_carton;
    const unitsPerCarton = rawFactor === null || rawFactor === undefined
      ? null
      : finiteNumber(rawFactor);
    if (unitsPerCarton !== null && (!Number.isSafeInteger(unitsPerCarton) || unitsPerCarton < 2 || unitsPerCarton > 1000000)) {
      throw new Error("تحويل الكرتون غير صالح؛ لم يُعرض.");
    }
    packaging = {
      packageSizeValue,
      packageSizeUnit,
      cartonUnitName: unitsPerCarton !== null ? cartonUnitName : null,
      unitsPerCarton: unitsPerCarton as number | null,
    };
  }

  return {
    productId: expectedProductId,
    brand,
    countryOfOriginCode: countryCode,
    specifications: parseSpecifications(value.specifications ?? []),
    packaging,
    alternatives: parseRecommendations(value.alternatives ?? []),
    complements: parseRecommendations(value.complements ?? []),
  };
}

export async function fetchStorefrontProductFacts(productId: string): Promise<StorefrontProductFacts> {
  if (!UUID.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  const { data, error } = await invokeRpc("get_storefront_catalog_page", {
    p_search: null,
    p_category_id: null,
    p_page: 1,
    p_page_size: 1,
    p_available_only: false,
    p_brand_id: null,
    p_unit: null,
    p_price_displayable_only: false,
    p_product_id: productId,
  });
  if (error) throw new Error(error.message || "تعذر تحميل بيانات المنتج المعتمدة.");
  if (!isRecord(data) || !Array.isArray(data.items) || data.items.length !== 1) {
    throw new Error("المنتج غير منشور أو غير متاح ضمن مؤسسة المتجر الحالية.");
  }
  return parseStorefrontProductFactsRow(data.items[0], productId);
}

function parseAdminRelations(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) {
    throw new Error("تعذر قراءة علاقات المنتج المحفوظة.");
  }
  const ids: string[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.target_product_id !== "string" || !UUID.test(item.target_product_id)) {
      throw new Error("أعاد الخادم علاقة منتج إدارية غير صالحة.");
    }
    if (!ids.includes(item.target_product_id)) ids.push(item.target_product_id);
  }
  return ids;
}

export function parseAdminStorefrontProductDetails(value: unknown, expectedProductId: string): AdminStorefrontProductDetails {
  if (!isRecord(value) || value.product_id !== expectedProductId) {
    throw new Error("لم تتطابق بيانات إدارة المنتج مع الصنف المطلوب.");
  }
  const countryCode = value.country_of_origin_code === null
    ? ""
    : typeof value.country_of_origin_code === "string" && COUNTRY_CODE.test(value.country_of_origin_code)
      ? value.country_of_origin_code
      : (() => { throw new Error("رمز بلد المنشأ المحفوظ غير صالح."); })();

  const rawPackageSize = value.package_size_value;
  const packageSizeValue = rawPackageSize === null || rawPackageSize === undefined
    ? null
    : finiteNumber(rawPackageSize);
  if (rawPackageSize !== null && rawPackageSize !== undefined &&
      (packageSizeValue === null || packageSizeValue <= 0 || packageSizeValue > 1000000)) {
    throw new Error("حجم العبوة المحفوظ غير صالح.");
  }

  return {
    brandName: optionalText(value.brand_name, 120) ?? "",
    brandNameEn: optionalText(value.brand_name_en, 120) ?? "",
    countryOfOriginCode: countryCode,
    originVerified: value.origin_verified === true,
    specifications: parseSpecifications(value.specifications ?? []),
    specificationsVerified: value.specifications_verified === true,
    packageSizeValue,
    packageSizeUnit: optionalText(value.package_size_unit, 40) ?? "",
    cartonUnitName: optionalText(value.carton_unit_name, 40) ?? "",
    packagingVerified: value.packaging_verified === true,
    alternatives: parseAdminRelations(value.alternatives ?? []),
    complements: parseAdminRelations(value.complements ?? []),
  };
}

export async function fetchAdminStorefrontProductDetails(productId: string): Promise<AdminStorefrontProductDetails> {
  if (!UUID.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  const { data, error } = await invokeRpc("get_admin_storefront_product_details", {
    p_product_id: productId,
  });
  if (error) throw new Error(error.message || "تعذر تحميل بيانات إدارة تفاصيل المنتج.");
  return parseAdminStorefrontProductDetails(data, productId);
}

function normalizeAdminDetails(input: AdminStorefrontProductDetails, productId?: string): Record<string, unknown> {
  if (productId !== undefined && !UUID.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  const brandName = input.brandName.trim();
  const brandNameEn = input.brandNameEn.trim();
  const countryCode = input.countryOfOriginCode.trim().toUpperCase();
  if (brandName.length > 120 || brandNameEn.length > 120 || (!brandName && brandNameEn)) {
    throw new Error("اسم العلامة التجارية غير صالح.");
  }
  if (countryCode && !COUNTRY_CODE.test(countryCode)) {
    throw new Error("أدخل رمز بلد المنشأ بصيغة ISO من حرفين كبيرين، مثل YE.");
  }
  if (input.originVerified && !countryCode) {
    throw new Error("لا يمكن اعتماد بلد المنشأ قبل إدخال رمزه.");
  }

  const seenSpecs = new Set<string>();
  if (input.specifications.length > 50) throw new Error("الحد الأقصى 50 مواصفة للمنتج.");
  const specifications = input.specifications.map((specification) => {
    const name = specification.name.trim();
    const specValue = specification.value.trim();
    const unit = specification.unit?.trim() || null;
    const key = name.toLocaleLowerCase("ar");
    if (!name || name.length > 60 || !specValue || specValue.length > 200 || (unit && unit.length > 40) || seenSpecs.has(key)) {
      throw new Error("تحقق من أسماء وقيم المواصفات وتأكد من عدم تكرار الاسم.");
    }
    seenSpecs.add(key);
    return { name, value: specValue, unit };
  });
  if (input.specificationsVerified && specifications.length === 0) {
    throw new Error("أضف مواصفة واحدة على الأقل قبل اعتماد المواصفات.");
  }

  const packageSizeUnit = input.packageSizeUnit.trim();
  if ((input.packageSizeValue === null) !== (packageSizeUnit.length === 0)) {
    throw new Error("أدخل قيمة حجم العبوة ووحدتها معاً، أو اتركهما فارغين.");
  }
  if (input.packageSizeValue !== null &&
      (!Number.isFinite(input.packageSizeValue) || input.packageSizeValue <= 0 || input.packageSizeValue > 1000000
        || Math.round(input.packageSizeValue * 1000) !== input.packageSizeValue * 1000)) {
    throw new Error("حجم العبوة يجب أن يكون رقماً موجباً لا يتجاوز مليوناً.");
  }
  if (input.packagingVerified && input.packageSizeValue === null && !input.cartonUnitName.trim()) {
    throw new Error("أدخل حجم العبوة أو عيّن وحدة الكرتون قبل اعتماد التغليف.");
  }

  const alternatives = [...new Set(input.alternatives)];
  const complements = [...new Set(input.complements)];
  const allRelations = [
    ...alternatives.map((target_product_id) => ({ target_product_id, relation_type: "alternative", is_published: true })),
    ...complements.map((target_product_id) => ({ target_product_id, relation_type: "complementary", is_published: true })),
  ];
  if (allRelations.length > 40 || [...alternatives, ...complements].some((id) => !UUID.test(id) || (productId !== undefined && id === productId))) {
    throw new Error("قائمة البدائل والمكملات غير صالحة أو تجاوزت الحد المسموح.");
  }
  if (new Set(allRelations.map((relation) => relation.target_product_id + ":" + relation.relation_type)).size !== allRelations.length) {
    throw new Error("لا تكرر المنتج نفسه ضمن النوع الواحد من العلاقات.");
  }

  return {
    ...(productId !== undefined ? { p_product_id: productId } : {}),
    p_brand_name: brandName || null,
    p_brand_name_en: brandNameEn || null,
    p_country_of_origin_code: countryCode || null,
    p_origin_verified: input.originVerified,
    p_specifications: specifications,
    p_specifications_verified: input.specificationsVerified,
    p_package_size_value: input.packageSizeValue,
    p_package_size_unit: packageSizeUnit || null,
    p_carton_unit_name: input.cartonUnitName.trim() || null,
    p_packaging_verified: input.packagingVerified,
    p_relations: allRelations,
  };
}

export function buildAdminStorefrontProductDetailsPayload(
  details: AdminStorefrontProductDetails,
): Record<string, unknown> {
  const normalized = normalizeAdminDetails(details);
  return {
    brand_name: normalized.p_brand_name,
    brand_name_en: normalized.p_brand_name_en,
    country_of_origin_code: normalized.p_country_of_origin_code,
    origin_verified: normalized.p_origin_verified,
    specifications: normalized.p_specifications,
    specifications_verified: normalized.p_specifications_verified,
    package_size_value: normalized.p_package_size_value,
    package_size_unit: normalized.p_package_size_unit,
    carton_unit_name: normalized.p_carton_unit_name,
    packaging_verified: normalized.p_packaging_verified,
    relations: normalized.p_relations,
  };
}

export async function saveAdminStorefrontProductDetails(
  productId: string,
  details: AdminStorefrontProductDetails,
): Promise<void> {
  const { data, error } = await invokeRpc(
    "save_admin_storefront_product_details",
    normalizeAdminDetails(details, productId),
  );
  if (error) throw new Error(error.message || "تعذر حفظ تفاصيل المنتج.");
  if (!isRecord(data) || data.product_id !== productId || data.changed !== true) {
    throw new Error("لم يؤكد الخادم حفظ تفاصيل المنتج وتدقيقها.");
  }
}
