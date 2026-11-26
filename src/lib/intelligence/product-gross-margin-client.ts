import { supabase } from "@/lib/supabase";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";
import type { EvidencePeriod } from "./types";

export interface ProductGrossMarginEvidenceRecord {
  id: string;
  source: { kind: "RPC"; name: string; version: string };
  sourceTimestamp: string;
  asOf: string;
  period: EvidencePeriod;
  status: "VERIFIED" | "NEEDS_REVIEW";
  completeness: "COMPLETE" | "PARTIAL";
  quality: "ACCEPTABLE" | "WARNINGS";
  currency: string | null;
  warnings: string[];
}

export interface ProductGrossMarginRow {
  productRef: string;
  productLabel: string;
  currency: string | null;
  currencyCount: number;
  unitOfMeasure: string | null;
  unitVariantCount: number;
  status: "VERIFIED" | "PARTIAL" | "NEEDS_REVIEW";
  invoiceCount: number;
  invoiceLineCount: number;
  invoicedQuantity: number;
  grossInvoiceLineAmount: number | null;
  postedCreditAmount: number | null;
  netRevenue: number | null;
  expectedShippedQuantity: number;
  actualShippedQuantity: number;
  saleMovementCount: number;
  uncostedMovementCount: number;
  costOfGoodsSold: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  hasReturns: boolean;
  evidenceIds: string[];
  formulaId: "nasr1.product-gross-margin.invoice-line-net-batch-cogs";
  formulaVersion: "1";
  warnings: string[];
}

export interface ProductGrossMarginSnapshot {
  status: "VERIFIED" | "PARTIAL" | "EMPTY";
  asOf: string;
  period: EvidencePeriod;
  completePopulation: boolean;
  invoiceCount: number;
  invoiceLineCount: number;
  invoicesWithoutLinesCount: number;
  unmappedLineCount: number;
  invalidCreditLineCount: number;
  productCount: number;
  verifiedProductCount: number;
  currency: string;
  products: ProductGrossMarginRow[];
  evidenceRecords: ProductGrossMarginEvidenceRecord[];
  formulaId: "nasr1.product-gross-margin.invoice-line-net-batch-cogs";
  formulaVersion: "1";
  formulaDescription: string;
  sourceTables: string[];
}

export type ProductGrossMarginFetchResult =
  | { ok: true; snapshot: ProductGrossMarginSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const FORMULA_ID = "nasr1.product-gross-margin.invoice-line-net-batch-cogs";
const SOURCE_TABLES = [
  "customer_invoices",
  "customer_invoice_items",
  "customer_return_credit_memos",
  "customer_return_credit_memo_items",
  "customer_return_request_items",
  "customer_return_receipt_items",
  "customer_return_receipts",
  "orders",
  "order_items",
  "inventory_movements",
  "inventory_batches",
  "purchase_receipt_items",
  "purchase_receipts",
  "purchase_order_items",
];

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validInstant(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    return false;
  }
  const day = value.slice(0, 10);
  const parsedDay = Date.parse(day + "T00:00:00.000Z");
  return Number.isFinite(Date.parse(value)) &&
    Number.isFinite(parsedDay) &&
    new Date(parsedDay).toISOString().slice(0, 10) === day;
}

function isPeriod(value: unknown): value is EvidencePeriod {
  const raw = object(value);
  return Boolean(raw && validDay(raw.from) && validDay(raw.to) && raw.from <= raw.to);
}

function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function boundedDecimal(value: unknown, scale: number, allowNegative = false): number | null {
  const minor = decimalToMinorUnits(value, scale, allowNegative);
  return minor === null ? null : minorUnitsToNumber(minor, scale);
}

function exactMinor(value: number | null, scale: number, allowNegative = false): bigint | null {
  return value === null ? null : decimalToMinorUnits(value, scale, allowNegative);
}

function marginHundredths(grossProfitMinor: bigint, revenueMinor: bigint): bigint | null {
  if (revenueMinor <= 0n) return null;
  const negative = grossProfitMinor < 0n;
  const magnitude = negative ? -grossProfitMinor : grossProfitMinor;
  const scaled = magnitude * 10_000n;
  const quotient = scaled / revenueMinor;
  const remainder = scaled % revenueMinor;
  const rounded = quotient + (remainder * 2n >= revenueMinor ? 1n : 0n);
  return negative ? -rounded : rounded;
}

function parseProduct(value: unknown): ProductGrossMarginRow | null {
  const raw = object(value);
  if (!raw || typeof raw.productRef !== "string" || !UUID.test(raw.productRef) ||
      typeof raw.productLabel !== "string" || !raw.productLabel.trim() || raw.productLabel.length > 180 ||
      (raw.currency !== null && (typeof raw.currency !== "string" || !CURRENCY.test(raw.currency))) ||
      !safeCount(raw.currencyCount) || !safeCount(raw.unitVariantCount) ||
      (raw.unitOfMeasure !== null && (typeof raw.unitOfMeasure !== "string" || !raw.unitOfMeasure.trim() || raw.unitOfMeasure.length > 80)) ||
      !["VERIFIED", "PARTIAL", "NEEDS_REVIEW"].includes(String(raw.status)) ||
      !safeCount(raw.invoiceCount) || raw.invoiceCount < 1 ||
      !safeCount(raw.invoiceLineCount) || raw.invoiceLineCount < 1 ||
      !safeCount(raw.saleMovementCount) || !safeCount(raw.uncostedMovementCount) ||
      raw.uncostedMovementCount > raw.saleMovementCount ||
      typeof raw.hasReturns !== "boolean" ||
      !Array.isArray(raw.evidenceIds) || raw.evidenceIds.length !== 3 ||
      raw.evidenceIds.some(item => typeof item !== "string" || !item.trim()) ||
      new Set(raw.evidenceIds).size !== raw.evidenceIds.length ||
      raw.formulaId !== FORMULA_ID || raw.formulaVersion !== "1" ||
      !Array.isArray(raw.warnings) || raw.warnings.some(item => typeof item !== "string" || !item.trim() || item.length > 180)) {
    return null;
  }

  const invoicedQuantity = boundedDecimal(raw.invoicedQuantity, 3);
  const expectedShippedQuantity = boundedDecimal(raw.expectedShippedQuantity, 3);
  const actualShippedQuantity = boundedDecimal(raw.actualShippedQuantity, 3);
  const grossInvoiceLineAmount = raw.grossInvoiceLineAmount === null ? null : boundedDecimal(raw.grossInvoiceLineAmount, 2);
  const postedCreditAmount = raw.postedCreditAmount === null ? null : boundedDecimal(raw.postedCreditAmount, 2);
  const netRevenue = raw.netRevenue === null ? null : boundedDecimal(raw.netRevenue, 2);
  const costOfGoodsSold = raw.costOfGoodsSold === null ? null : boundedDecimal(raw.costOfGoodsSold, 2);
  const grossProfit = raw.grossProfit === null ? null : boundedDecimal(raw.grossProfit, 2, true);
  const grossMarginPercent = raw.grossMarginPercent === null ? null : boundedDecimal(raw.grossMarginPercent, 2, true);

  if (invoicedQuantity === null || expectedShippedQuantity === null || actualShippedQuantity === null ||
      (raw.grossInvoiceLineAmount !== null && grossInvoiceLineAmount === null) ||
      (raw.postedCreditAmount !== null && postedCreditAmount === null) ||
      (raw.netRevenue !== null && netRevenue === null) ||
      (raw.costOfGoodsSold !== null && costOfGoodsSold === null) ||
      (raw.grossProfit !== null && grossProfit === null) ||
      (raw.grossMarginPercent !== null && grossMarginPercent === null)) {
    return null;
  }

  const status = raw.status as ProductGrossMarginRow["status"];
  if ((grossInvoiceLineAmount === null) !== (postedCreditAmount === null) ||
      (grossInvoiceLineAmount !== null && postedCreditAmount !== null &&
        (grossInvoiceLineAmount < postedCreditAmount || netRevenue === null ||
         exactMinor(netRevenue, 2) !== exactMinor(grossInvoiceLineAmount, 2)! - exactMinor(postedCreditAmount, 2)!))) {
    return null;
  }

  if (status === "VERIFIED") {
    if (raw.currency !== "YER" || raw.currencyCount !== 1 || raw.hasReturns ||
        raw.unitVariantCount < 1 ||
        (raw.unitVariantCount === 1 && !raw.unitOfMeasure) ||
        (raw.unitVariantCount > 1 && raw.unitOfMeasure !== null) ||
        expectedShippedQuantity !== actualShippedQuantity ||
        expectedShippedQuantity !== invoicedQuantity ||
        raw.saleMovementCount < 1 || raw.uncostedMovementCount !== 0 ||
        grossInvoiceLineAmount === null || postedCreditAmount === null || netRevenue === null ||
        costOfGoodsSold === null || grossProfit === null ||
        exactMinor(grossProfit, 2, true) !== exactMinor(netRevenue, 2)! - exactMinor(costOfGoodsSold, 2)! ||
        (netRevenue > 0
          ? grossMarginPercent === null ||
            marginHundredths(exactMinor(grossProfit, 2, true) as bigint, exactMinor(netRevenue, 2) as bigint) !==
              decimalToMinorUnits(grossMarginPercent, 2, true)
          : grossMarginPercent !== null)) {
      return null;
    }
  } else if (grossProfit !== null || grossMarginPercent !== null || costOfGoodsSold !== null) {
    return null;
  }

  return {
    productRef: raw.productRef,
    productLabel: raw.productLabel.trim(),
    currency: raw.currency as string | null,
    currencyCount: raw.currencyCount,
    unitOfMeasure: raw.unitOfMeasure as string | null,
    unitVariantCount: raw.unitVariantCount,
    status,
    invoiceCount: raw.invoiceCount,
    invoiceLineCount: raw.invoiceLineCount,
    invoicedQuantity,
    grossInvoiceLineAmount,
    postedCreditAmount,
    netRevenue,
    expectedShippedQuantity,
    actualShippedQuantity,
    saleMovementCount: raw.saleMovementCount,
    uncostedMovementCount: raw.uncostedMovementCount,
    costOfGoodsSold,
    grossProfit,
    grossMarginPercent,
    hasReturns: raw.hasReturns,
    evidenceIds: raw.evidenceIds as string[],
    formulaId: FORMULA_ID,
    formulaVersion: "1",
    warnings: raw.warnings as string[],
  };
}

function parseEvidence(value: unknown, asOf: string, period: EvidencePeriod): ProductGrossMarginEvidenceRecord | null {
  const raw = object(value);
  const source = object(raw?.source);
  if (!raw || !source || typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 220 ||
      source.kind !== "RPC" || typeof source.name !== "string" || !source.name.trim() ||
      source.version !== "1" || raw.asOf !== asOf || !validInstant(raw.sourceTimestamp) ||
      Date.parse(raw.sourceTimestamp) > Date.parse(asOf) || !isPeriod(raw.period) ||
      raw.period.from !== period.from || raw.period.to !== period.to ||
      !["VERIFIED", "NEEDS_REVIEW"].includes(String(raw.status)) ||
      !["COMPLETE", "PARTIAL"].includes(String(raw.completeness)) ||
      !["ACCEPTABLE", "WARNINGS"].includes(String(raw.quality)) ||
      (raw.currency !== null && (typeof raw.currency !== "string" || !CURRENCY.test(raw.currency))) ||
      !Array.isArray(raw.warnings) || raw.warnings.some(item => typeof item !== "string" || item.length > 180)) {
    return null;
  }
  return {
    id: raw.id,
    source: { kind: "RPC", name: source.name, version: "1" },
    sourceTimestamp: raw.sourceTimestamp,
    asOf,
    period: raw.period,
    status: raw.status as ProductGrossMarginEvidenceRecord["status"],
    completeness: raw.completeness as ProductGrossMarginEvidenceRecord["completeness"],
    quality: raw.quality as ProductGrossMarginEvidenceRecord["quality"],
    currency: raw.currency as string | null,
    warnings: raw.warnings as string[],
  };
}

export function parseProductGrossMarginSnapshot(
  value: unknown,
  request: { from: string; to: string; asOf: string },
): ProductGrossMarginSnapshot | null {
  if (!validDay(request.from) || !validDay(request.to) || request.from > request.to ||
      Date.parse(request.to + "T00:00:00.000Z") - Date.parse(request.from + "T00:00:00.000Z") > 365 * 86_400_000 ||
      !validInstant(request.asOf)) {
    return null;
  }
  const raw = object(value);
  const sourceTables = Array.isArray(raw?.sourceTables)
    ? raw.sourceTables.filter((table: unknown): table is string => typeof table === "string")
    : null;
  if (!raw || !validInstant(raw.asOf) || Date.parse(raw.asOf) !== Date.parse(request.asOf) ||
      !isPeriod(raw.period) || raw.period.from !== request.from || raw.period.to !== request.to ||
      !["VERIFIED", "PARTIAL", "EMPTY"].includes(String(raw.status)) ||
      typeof raw.completePopulation !== "boolean" ||
      !safeCount(raw.invoiceCount) || !safeCount(raw.invoiceLineCount) ||
      !safeCount(raw.invoicesWithoutLinesCount) || !safeCount(raw.unmappedLineCount) ||
      !safeCount(raw.invalidCreditLineCount) || !safeCount(raw.productCount) ||
      !safeCount(raw.verifiedProductCount) || raw.verifiedProductCount > raw.productCount ||
      typeof raw.currency !== "string" || !CURRENCY.test(raw.currency) ||
      !Array.isArray(raw.products) || raw.products.length > 2000 ||
      raw.products.length !== raw.productCount ||
      !Array.isArray(raw.evidenceRecords) || raw.evidenceRecords.length > 6000 ||
      raw.formulaId !== FORMULA_ID || raw.formulaVersion !== "1" ||
      typeof raw.formulaDescription !== "string" || raw.formulaDescription.length < 40 || raw.formulaDescription.length > 1600 ||
      sourceTables === null || sourceTables.length !== (raw.sourceTables as unknown[]).length ||
      SOURCE_TABLES.some(table => !sourceTables.includes(table)) ||
      raw.sideEffects !== "NONE") {
    return null;
  }

  const products = raw.products.map(parseProduct);
  if (products.some(product => product === null) ||
      new Set((products as ProductGrossMarginRow[]).map(product => product.productRef)).size !== products.length) {
    return null;
  }
  const evidenceRecords = raw.evidenceRecords.map(item => parseEvidence(item, request.asOf, request));
  if (evidenceRecords.some(item => item === null) ||
      new Set((evidenceRecords as ProductGrossMarginEvidenceRecord[]).map(item => item.id)).size !== evidenceRecords.length) {
    return null;
  }

  const productIds = new Set((products as ProductGrossMarginRow[]).flatMap(product => product.evidenceIds));
  const evidenceIds = new Set((evidenceRecords as ProductGrossMarginEvidenceRecord[]).map(item => item.id));
  if ([...productIds].some(id => !evidenceIds.has(id))) return null;

  const verifiedCount = (products as ProductGrossMarginRow[]).filter(product => product.status === "VERIFIED").length;
  if (raw.status === "EMPTY") {
    if (raw.invoiceCount !== 0 || raw.invoiceLineCount !== 0 || products.length !== 0 || !raw.completePopulation) return null;
  } else if (raw.status === "VERIFIED") {
    if (!raw.completePopulation || raw.currency !== "YER" ||
        raw.invoicesWithoutLinesCount !== 0 || raw.unmappedLineCount !== 0 ||
        raw.invalidCreditLineCount !== 0 || verifiedCount !== products.length ||
        raw.verifiedProductCount !== verifiedCount || products.length === 0) {
      return null;
    }
  } else if (raw.completePopulation || verifiedCount !== raw.verifiedProductCount) {
    return null;
  }

  return {
    status: raw.status as ProductGrossMarginSnapshot["status"],
    asOf: raw.asOf,
    period: raw.period,
    completePopulation: raw.completePopulation,
    invoiceCount: raw.invoiceCount,
    invoiceLineCount: raw.invoiceLineCount,
    invoicesWithoutLinesCount: raw.invoicesWithoutLinesCount,
    unmappedLineCount: raw.unmappedLineCount,
    invalidCreditLineCount: raw.invalidCreditLineCount,
    productCount: raw.productCount,
    verifiedProductCount: raw.verifiedProductCount,
    currency: raw.currency,
    products: products as ProductGrossMarginRow[],
    evidenceRecords: evidenceRecords as ProductGrossMarginEvidenceRecord[],
    formulaId: FORMULA_ID,
    formulaVersion: "1",
    formulaDescription: raw.formulaDescription,
    sourceTables,
  };
}

function mapFailure(error: unknown): ProductGrossMarginFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة ربحية المنتجات من دفاتر المؤسسة." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "مصدر تكلفة الشحن وربح المنتجات غير متاح قبل تطبيق ترحيل دفتر الربحية." };
  }
  return { ok: false, status: "ERROR", message: "تعذر قراءة الربحية الإجمالية للمنتجات من المصادر المعتمدة." };
}

export async function fetchProductGrossMargin(input: {
  from: string;
  to: string;
  asOf: string;
}): Promise<ProductGrossMarginFetchResult> {
  if (!validDay(input.from) || !validDay(input.to) || input.from > input.to ||
      Date.parse(input.to + "T00:00:00.000Z") - Date.parse(input.from + "T00:00:00.000Z") > 365 * 86_400_000 ||
      !validInstant(input.asOf) ||
      input.to !== new Date(Date.parse(input.asOf)).toISOString().slice(0, 10)) {
    return { ok: false, status: "ERROR", message: "فترة الربحية أو يوم لقطة UTC غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_product_gross_margin_by_invoice_source", {
      p_from: input.from,
      p_to: input.to,
      p_as_of: input.asOf,
    });
    if (error) return mapFailure(error);
    const snapshot = parseProductGrossMarginSnapshot(data, input);
    if (!snapshot) {
      return { ok: false, status: "ERROR", message: "استجابة ربحية المنتجات لا تطابق عقد المصدر المحاسبي؛ حُجبت النتائج." };
    }
    return { ok: true, snapshot };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بمصدر ربحية المنتجات." };
  }
}
