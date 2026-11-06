import type { SupplierQuote } from "@/lib/supplier-quotes";

export type SupplierQuoteComparisonWithheldReason =
  | "UNIT_MISSING"
  | "PRODUCT_SNAPSHOT_MISMATCH"
  | "LINE_TOTAL_MISMATCH"
  | "INSUFFICIENT_DISTINCT_SUPPLIERS";

export interface SupplierQuoteComparisonOffer {
  supplierName: string;
  quoteNumber: string;
  unitCost: number;
  updatedAt: string;
}

export interface SupplierQuoteProductComparison {
  key: string;
  productName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  currency: string;
  offerCount: number;
  offers: SupplierQuoteComparisonOffer[];
  omittedOfferCount: number;
  lowestUnitCost: number;
  secondLowestUnitCost: number | null;
  differenceToNextUnitCost: number | null;
}

export interface SupplierQuoteComparisonWithheld {
  key: string;
  productName: string;
  itemCode: string;
  reason: SupplierQuoteComparisonWithheldReason;
}

export interface SupplierQuoteComparisonAssistantResult {
  kind: "SUPPLIER_QUOTE_COMPARISON";
  state: "READY" | "PARTIAL" | "EMPTY";
  intent: "SUPPLIER_QUOTE_COMPARISON_OVERVIEW";
  sourceRpc: "fetch_purchase_supplier_quotes";
  queriedAt: string;
  quoteCount: number;
  completePopulation: boolean;
  quoteCounts: { received: number; awarded: number; expired: number };
  comparisonGroupCount: number;
  comparisons: SupplierQuoteProductComparison[];
  comparisonsTruncated: boolean;
  withheldGroupCount: number;
  withheld: SupplierQuoteComparisonWithheld[];
  warnings: string[];
  answer: string;
}

type Candidate = { quote: SupplierQuote; productId: string; line: SupplierQuote["items"][number] };
const SOURCE_LIMIT = 200;
const MAX_RENDERED_COMPARISONS = 20;
const MAX_RENDERED_OFFERS = 10;
const MAX_RENDERED_WITHHELD = 30;

function validTime(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function newestFirst(a: Candidate, b: Candidate): number {
  const time = Date.parse(b.quote.updated_at) - Date.parse(a.quote.updated_at);
  if (time !== 0) return time;
  return b.quote.id.localeCompare(a.quote.id);
}

function compareOffers(a: SupplierQuoteComparisonOffer, b: SupplierQuoteComparisonOffer): number {
  return a.unitCost - b.unitCost ||
    a.supplierName.localeCompare(b.supplierName, "ar") ||
    a.quoteNumber.localeCompare(b.quoteNumber);
}

/**
 * Compares only persisted, currently received supplier offers for the same product,
 * exact quoted quantity, unit of measure and currency. It never awards a quote or
 * creates a purchase order. The RPC has a 200-row ceiling and no total/cursor;
 * exactly 200 returned rows are therefore conservatively marked PARTIAL.
 */
export function buildSupplierQuoteComparisonAssistant(
  quotes: readonly SupplierQuote[],
  queriedAt: string,
): SupplierQuoteComparisonAssistantResult {
  if (!Array.isArray(quotes) || quotes.length > SOURCE_LIMIT || !validTime(queriedAt)) {
    throw new Error("supplier_quote_comparison_input_invalid");
  }

  const quoteCounts = { received: 0, awarded: 0, expired: 0 };
  for (const quote of quotes) quoteCounts[quote.status] += 1;

  const byProduct = new Map<string, Candidate[]>();
  for (const quote of quotes) {
    if (quote.status !== "received") continue;
    for (const line of quote.items) {
      const rows = byProduct.get(line.product_id) ?? [];
      rows.push({ quote, productId: line.product_id, line });
      byProduct.set(line.product_id, rows);
    }
  }

  const comparisons: SupplierQuoteProductComparison[] = [];
  const withheld: SupplierQuoteComparisonWithheld[] = [];
  for (const [productId, productRows] of byProduct) {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of productRows) {
      const key = JSON.stringify([
        candidate.line.unit,
        candidate.quote.currency,
        candidate.line.quantity_quoted,
      ]);
      const rows = groups.get(key) ?? [];
      rows.push(candidate);
      groups.set(key, rows);
    }

    for (const [basis, candidates] of groups) {
      const key = productId + ":" + basis;
      const first = candidates[0];
      const productName = first.line.product_name;
      const itemCode = first.line.item_code;
      const addWithheld = (reason: SupplierQuoteComparisonWithheldReason) => {
        withheld.push({ key, productName, itemCode, reason });
      };

      const units = new Set(candidates.map(item => item.line.unit?.trim() ?? ""));
      if (units.size !== 1 || !first.line.unit?.trim()) {
        addWithheld("UNIT_MISSING");
        continue;
      }
      const productNames = new Set(candidates.map(item => item.line.product_name.trim()));
      const itemCodes = new Set(candidates.map(item => item.line.item_code.trim()));
      if (productNames.size !== 1 || itemCodes.size !== 1) {
        addWithheld("PRODUCT_SNAPSHOT_MISMATCH");
        continue;
      }
      if (candidates.some(item =>
        !Number.isFinite(item.line.quantity_quoted) || item.line.quantity_quoted <= 0 ||
        !Number.isFinite(item.line.unit_cost) || item.line.unit_cost < 0 ||
        !Number.isFinite(item.line.line_total) || item.line.line_total < 0 ||
        Math.abs(item.line.quantity_quoted * item.line.unit_cost - item.line.line_total) > 0.011
      )) {
        addWithheld("LINE_TOTAL_MISMATCH");
        continue;
      }

      // A supplier can submit several revisions. Keep its latest saved offer
      // for this exact comparison basis so one supplier cannot occupy several ranks.
      const latestBySupplier = new Map<string, Candidate>();
      for (const candidate of [...candidates].sort(newestFirst)) {
        if (!latestBySupplier.has(candidate.quote.supplier_id)) {
          latestBySupplier.set(candidate.quote.supplier_id, candidate);
        }
      }
      const distinctOffers = [...latestBySupplier.values()];
      if (distinctOffers.length < 2) {
        addWithheld("INSUFFICIENT_DISTINCT_SUPPLIERS");
        continue;
      }

      const offers = distinctOffers.map(item => ({
        supplierName: item.quote.supplier_name,
        quoteNumber: item.quote.quote_number,
        unitCost: item.line.unit_cost,
        updatedAt: item.quote.updated_at,
      })).sort(compareOffers);
      const lowestUnitCost = offers[0].unitCost;
      const secondLowestUnitCost = offers[1]?.unitCost ?? null;
      comparisons.push({
        key,
        productName,
        itemCode,
        quantity: first.line.quantity_quoted,
        unit: first.line.unit as string,
        currency: first.quote.currency,
        offerCount: offers.length,
        offers: offers.slice(0, MAX_RENDERED_OFFERS),
        omittedOfferCount: Math.max(0, offers.length - MAX_RENDERED_OFFERS),
        lowestUnitCost,
        secondLowestUnitCost,
        differenceToNextUnitCost: secondLowestUnitCost === null
          ? null
          : Number((secondLowestUnitCost - lowestUnitCost).toFixed(2)),
      });
    }
  }

  comparisons.sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") ||
    a.itemCode.localeCompare(b.itemCode) ||
    a.quantity - b.quantity ||
    a.unit.localeCompare(b.unit) ||
    a.currency.localeCompare(b.currency)
  );
  withheld.sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") ||
    a.itemCode.localeCompare(b.itemCode) ||
    a.reason.localeCompare(b.reason)
  );

  const completePopulation = quotes.length < SOURCE_LIMIT;
  const state: SupplierQuoteComparisonAssistantResult["state"] = quotes.length === 0
    ? "EMPTY"
    : completePopulation ? "READY" : "PARTIAL";
  const warnings: string[] = [];
  if (!completePopulation) {
    warnings.push("SOURCE_LIMIT_REACHED: تعرض الخدمة أحدث 200 عرض فقط ولا تعيد total أو cursor؛ قد توجد عروض أقدم لم تدخل المقارنة.");
  }
  if (withheld.length > 0) {
    warnings.push("NON_COMPARABLE_OFFERS_WITHHELD: لا تقارن العروض عند اختلاف الوحدة أو الكمية أو العملة أو لقطة الصنف أو سلامة إجمالي السطر.");
  }
  if (comparisons.length > MAX_RENDERED_COMPARISONS) {
    warnings.push("COMPARISON_RENDER_LIMIT: عُرضت أول 20 مجموعة مقارنة فقط.");
  }

  const answer = quotes.length === 0
    ? "لا توجد عروض موردين محفوظة في المصدر المصرح به."
    : quoteCounts.received === 0
      ? "تم تحميل " + quotes.length + " عرضاً، لكن لا يوجد عرض مستلم وساري حالياً ضمن المصدر للمقارنة."
      : comparisons.length === 0
        ? "تم تحميل " + quotes.length + " عرضاً، لكن لم تتوافر مجموعتان من عروض موردين مختلفين للصنف نفسه وبالكمية والوحدة والعملة نفسها؛ لم تُنشأ مقارنة تخمينية."
        : "تم تكوين " + comparisons.length + " مجموعة مقارنة من عروض الموردين المحفوظة. ترتيب العروض مبني على تكلفة الوحدة المسجلة فقط، وليس توصية بالترسية أو تقييماً لجودة المورد.";

  return {
    kind: "SUPPLIER_QUOTE_COMPARISON",
    state,
    intent: "SUPPLIER_QUOTE_COMPARISON_OVERVIEW",
    sourceRpc: "fetch_purchase_supplier_quotes",
    queriedAt,
    quoteCount: quotes.length,
    completePopulation,
    quoteCounts,
    comparisonGroupCount: comparisons.length,
    comparisons: comparisons.slice(0, MAX_RENDERED_COMPARISONS),
    comparisonsTruncated: comparisons.length > MAX_RENDERED_COMPARISONS,
    withheldGroupCount: withheld.length,
    withheld: withheld.slice(0, MAX_RENDERED_WITHHELD),
    warnings,
    answer,
  };
}
