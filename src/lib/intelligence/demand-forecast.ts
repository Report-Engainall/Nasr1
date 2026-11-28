import { buildEvidencePassport } from "./evidence-passport";
import { decimalToMinorUnits, minorUnitsToNumber, roundedPercentageHundredths } from "./financial-precision";
import type { GrowthOpportunitySignal } from "./growth-opportunities";
import type { EvidencePeriod, EvidenceRecord, EvidenceStatus, MetricSnapshot } from "./types";

export type DemandTrend = "INCREASING" | "DECLINING" | "STABLE" | "NEW_ACTIVITY" | "NO_DEMAND";

export interface DemandForecastHorizon {
  days: 7 | 30 | 90;
  lowQuantity: number;
  expectedQuantity: number;
  highQuantity: number;
}

export interface ProductDemandForecast {
  productRef: string;
  productLabel: string;
  unitOfMeasure: string;
  trend: DemandTrend;
  currentDailyDemand: number;
  baselineDailyDemand: number;
  changePercentHundredths: number | null;
  currentOrders: number;
  baselineOrders: number;
  horizons: DemandForecastHorizon[];
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod;
  asOf: string;
  evidenceIds: string[];
  metricKeys: string[];
  formulaVersions: string[];
  warnings: string[];
}

export interface DemandForecastWithheld {
  signalId: string;
  productRef: string;
  reason:
    | "INVALID_SIGNAL"
    | "DUPLICATE_PRODUCT"
    | "METRIC_MISSING"
    | "METRIC_AMBIGUOUS"
    | "METRIC_NOT_VERIFIED"
    | "METRIC_SCOPE_MISMATCH"
    | "SAMPLE_INSUFFICIENT"
    | "INVALID_COMPARISON"
    | "UNSUPPORTED_PRECISION";
}

export interface DemandForecastResult {
  id: string;
  asOf: string;
  status: EvidenceStatus;
  completePopulation: boolean;
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod;
  forecasts: ProductDemandForecast[];
  withheld: DemandForecastWithheld[];
  warnings: string[];
}

type MetricRead = { metric: MetricSnapshot; minorUnits: bigint };
const DAY_MS = 86_400_000;
const SCALE = 1_000_000n;
const MIN_SAMPLE = 5;
const TREND_THRESHOLD_HUNDREDTHS = 2_000;

function validInstant(value: string): boolean {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value)) return false;
  const day = value.slice(0, 10);
  const millis = Date.parse(day + "T00:00:00.000Z");
  return Number.isFinite(Date.parse(value)) && Number.isFinite(millis) &&
    new Date(millis).toISOString().slice(0, 10) === day;
}

function validDay(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const millis = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value;
}

function days(period: EvidencePeriod): number | null {
  if (!validDay(period.from) || !validDay(period.to) || period.from > period.to) return null;
  return (Date.parse(period.to + "T00:00:00.000Z") -
    Date.parse(period.from + "T00:00:00.000Z")) / DAY_MS + 1;
}

function comparablePeriods(current: EvidencePeriod, baseline: EvidencePeriod, asOf: string): boolean {
  const currentDays = days(current);
  const baselineDays = days(baseline);
  return currentDays !== null && currentDays === baselineDays &&
    baseline.to < current.from &&
    Date.parse(baseline.to + "T00:00:00.000Z") + DAY_MS === Date.parse(current.from + "T00:00:00.000Z") &&
    current.to === new Date(Date.parse(asOf)).toISOString().slice(0, 10);
}

function metricRead(id: string, index: Map<string, MetricSnapshot[]>):
  { read: MetricRead | null; reason: DemandForecastWithheld["reason"] | null } {
  const matches = index.get(id) ?? [];
  if (!matches.length) return { read: null, reason: "METRIC_MISSING" };
  if (matches.length !== 1) return { read: null, reason: "METRIC_AMBIGUOUS" };
  const metric = matches[0];
  if (metric.status !== "VERIFIED" || metric.completeness !== "COMPLETE" || metric.quality !== "ACCEPTABLE") {
    return { read: null, reason: "METRIC_NOT_VERIFIED" };
  }
  if (!metric.period || !validInstant(metric.asOf) ||
      !metric.lineage?.evidenceIds?.length || !metric.lineage.formulaId?.trim() ||
      !metric.lineage.formulaVersion?.trim() || !validInstant(metric.lineage.calculatedAt) ||
      Date.parse(metric.lineage.calculatedAt) > Date.parse(metric.asOf)) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  // Demand inputs must be measured quantities and sample counts; numeric-looking TEXT is not evidence.
  if (metric.unit !== "QUANTITY" && metric.unit !== "COUNT") {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  const minorUnits = decimalToMinorUnits(metric.value, 6);
  if (minorUnits === null || minorUnits < 0n) return { read: null, reason: "UNSUPPORTED_PRECISION" };
  return { read: { metric, minorUnits }, reason: null };
}

function sampleRead(id: string, reference: MetricRead, index: Map<string, MetricSnapshot[]>):
  { read: MetricRead | null; reason: DemandForecastWithheld["reason"] | null } {
  const result = metricRead(id, index);
  if (!result.read) return result;
  if (result.read.metric.unit !== "COUNT" ||
      !samePeriod(result.read.metric.period, reference.metric.period) ||
      result.read.minorUnits % SCALE !== 0n) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  return result;
}

function samePeriod(a: EvidencePeriod | null, b: EvidencePeriod | null): boolean {
  return a !== null && b !== null && a.from === b.from && a.to === b.to;
}

function unitIdentity(metric: MetricSnapshot): string | null {
  if (metric.unit !== "QUANTITY" || !metric.unitOfMeasure?.trim()) return null;
  return metric.unit + ":" + metric.unitOfMeasure.trim().toUpperCase();
}

function ceilForecast(quantityMinor: bigint, horizon: bigint, periodDays: bigint): bigint {
  const numerator = quantityMinor * horizon;
  return numerator === 0n ? 0n : (numerator + periodDays - 1n) / periodDays;
}

function safeQuantity(value: bigint): number | null {
  return minorUnitsToNumber(value, 6);
}

/**
 * Builds short-horizon demand scenarios from verified order-line quantities in two
 * adjacent equal-length periods. The scenario envelope is the observed rate range,
 * not a probability interval and not a claim of seasonality-adjusted demand.
 */
export function buildProductDemandForecast(input: {
  id: string;
  asOf: string;
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod;
  completePopulation: boolean;
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
}): DemandForecastResult {
  if (!input.id.trim() || input.id.length > 160 || !validInstant(input.asOf)) {
    throw new Error("demand_forecast_id_or_timestamp_invalid");
  }
  const periodDays = days(input.period);
  if (periodDays === null || !comparablePeriods(input.period, input.baselinePeriod, input.asOf)) {
    throw new Error("demand_forecast_periods_not_comparable");
  }
  if (typeof input.completePopulation !== "boolean" ||
      !Array.isArray(input.evidenceRecords) || !Array.isArray(input.metrics) || !Array.isArray(input.signals)) {
    throw new Error("demand_forecast_source_payload_invalid");
  }

  const passport = buildEvidencePassport({
    id: "demand-forecast:" + input.id,
    generatedAt: input.asOf,
    asOf: input.asOf,
    evidenceRecords: input.evidenceRecords,
    metrics: input.metrics,
  });
  const index = new Map<string, MetricSnapshot[]>();
  for (const metric of passport.metrics) {
    const rows = index.get(metric.id) ?? [];
    rows.push(metric);
    index.set(metric.id, rows);
  }

  const forecasts: ProductDemandForecast[] = [];
  const withheld: DemandForecastWithheld[] = [];
  const seenSignals = new Set<string>();
  const seenProducts = new Set<string>();

  for (const signal of input.signals) {
    if (!signal || signal.kind !== "PRODUCT_PERFORMANCE_CHANGE" ||
        typeof signal.id !== "string" || !signal.id.trim() ||
        typeof signal.subjectRef !== "string" || !signal.subjectRef.trim() ||
        typeof signal.subjectLabel !== "string" || !signal.subjectLabel.trim() ||
        !signal.observedMetricId || !signal.sampleMetricId ||
        !signal.baselineMetricId || !signal.baselineSampleMetricId) {
      withheld.push({ signalId: signal?.id ?? "unknown", productRef: signal?.subjectRef ?? "", reason: "INVALID_SIGNAL" });
      continue;
    }
    if (seenSignals.has(signal.id) || seenProducts.has(signal.subjectRef)) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "DUPLICATE_PRODUCT" });
      continue;
    }
    seenSignals.add(signal.id);
    seenProducts.add(signal.subjectRef);

    const currentResult = metricRead(signal.observedMetricId, index);
    const baselineResult = metricRead(signal.baselineMetricId, index);
    if (!currentResult.read || !baselineResult.read) {
      withheld.push({
        signalId: signal.id, productRef: signal.subjectRef,
        reason: currentResult.reason ?? baselineResult.reason ?? "METRIC_MISSING",
      });
      continue;
    }
    const current = currentResult.read;
    const baseline = baselineResult.read;
    const currentSampleResult = sampleRead(signal.sampleMetricId, current, index);
    const baselineSampleResult = sampleRead(signal.baselineSampleMetricId, baseline, index);
    if (!currentSampleResult.read || !baselineSampleResult.read) {
      withheld.push({
        signalId: signal.id, productRef: signal.subjectRef,
        reason: currentSampleResult.reason ?? baselineSampleResult.reason ?? "METRIC_MISSING",
      });
      continue;
    }
    const currentSample = currentSampleResult.read;
    const baselineSample = baselineSampleResult.read;
    const currentUnit = unitIdentity(current.metric);
    const baselineUnit = unitIdentity(baseline.metric);
    if (current.metric.unit !== "QUANTITY" || baseline.metric.unit !== "QUANTITY" ||
        !currentUnit || currentUnit !== baselineUnit ||
        current.metric.key !== baseline.metric.key ||
        current.metric.lineage.formulaId !== baseline.metric.lineage.formulaId ||
        current.metric.lineage.formulaVersion !== baseline.metric.lineage.formulaVersion ||
        current.metric.asOf !== input.asOf || baseline.metric.asOf !== input.asOf ||
        !samePeriod(current.metric.period, input.period) ||
        !samePeriod(baseline.metric.period, input.baselinePeriod) ||
        !samePeriod(currentSample.metric.period, input.period) ||
        !samePeriod(baselineSample.metric.period, input.baselinePeriod) ||
        currentSample.metric.key !== baselineSample.metric.key ||
        currentSample.metric.lineage.formulaId !== baselineSample.metric.lineage.formulaId ||
        currentSample.metric.lineage.formulaVersion !== baselineSample.metric.lineage.formulaVersion) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "INVALID_COMPARISON" });
      continue;
    }

    const currentOrders = currentSample.minorUnits / SCALE;
    const baselineOrders = baselineSample.minorUnits / SCALE;
    if ((current.minorUnits === 0n) !== (currentOrders === 0n) ||
        (baseline.minorUnits === 0n) !== (baselineOrders === 0n) ||
        (currentOrders > 0n && currentOrders < BigInt(MIN_SAMPLE)) ||
        (baselineOrders > 0n && baselineOrders < BigInt(MIN_SAMPLE))) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "SAMPLE_INSUFFICIENT" });
      continue;
    }

    const percent = baseline.minorUnits > 0n
      ? roundedPercentageHundredths(
          current.minorUnits >= baseline.minorUnits
            ? current.minorUnits - baseline.minorUnits
            : baseline.minorUnits - current.minorUnits,
          baseline.minorUnits,
        )
      : null;
    if (percent !== null && percent > BigInt(Number.MAX_SAFE_INTEGER)) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "UNSUPPORTED_PRECISION" });
      continue;
    }
    const signedPercent = percent === null ? null :
      Number(percent) * (current.minorUnits >= baseline.minorUnits ? 1 : -1);
    const trend: DemandTrend = current.minorUnits === 0n && baseline.minorUnits === 0n
      ? "NO_DEMAND"
      : baseline.minorUnits === 0n
        ? "NEW_ACTIVITY"
        : current.minorUnits === 0n
          ? "DECLINING"
          : (signedPercent as number) >= TREND_THRESHOLD_HUNDREDTHS
            ? "INCREASING"
            : (signedPercent as number) <= -TREND_THRESHOLD_HUNDREDTHS
              ? "DECLINING"
              : "STABLE";

    const daysBig = BigInt(periodDays);
    const lowRate = current.minorUnits < baseline.minorUnits ? current.minorUnits : baseline.minorUnits;
    const highRate = current.minorUnits > baseline.minorUnits ? current.minorUnits : baseline.minorUnits;
    const horizons = ([7, 30, 90] as const).map(daysAhead => {
      const expected = ceilForecast(current.minorUnits, BigInt(daysAhead), daysBig);
      const low = ceilForecast(lowRate, BigInt(daysAhead), daysBig);
      const high = ceilForecast(highRate, BigInt(daysAhead), daysBig);
      return {
        days: daysAhead,
        lowQuantity: safeQuantity(low) as number,
        expectedQuantity: safeQuantity(expected) as number,
        highQuantity: safeQuantity(high) as number,
      };
    });
    if (horizons.some(item =>
      !Number.isFinite(item.lowQuantity) || !Number.isFinite(item.expectedQuantity) || !Number.isFinite(item.highQuantity)
    )) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "UNSUPPORTED_PRECISION" });
      continue;
    }
    const currentDailyMinor = (current.minorUnits + daysBig - 1n) / daysBig;
    const baselineDailyMinor = (baseline.minorUnits + daysBig - 1n) / daysBig;
    const currentDaily = safeQuantity(currentDailyMinor);
    const baselineDaily = safeQuantity(baselineDailyMinor);
    if (currentDaily === null || baselineDaily === null) {
      withheld.push({ signalId: signal.id, productRef: signal.subjectRef, reason: "UNSUPPORTED_PRECISION" });
      continue;
    }

    const sourceMetrics = [current.metric, baseline.metric, currentSample.metric, baselineSample.metric];
    const evidenceIds = [...new Set(sourceMetrics.flatMap(metric => metric.lineage.evidenceIds))].sort();
    const formulaVersions = [...new Set(sourceMetrics.map(metric =>
      metric.lineage.formulaId + "@" + metric.lineage.formulaVersion
    ))].sort();
    forecasts.push({
      productRef: signal.subjectRef,
      productLabel: signal.subjectLabel.trim(),
      unitOfMeasure: current.metric.unitOfMeasure as string,
      trend,
      currentDailyDemand: currentDaily,
      baselineDailyDemand: baselineDaily,
      changePercentHundredths: signedPercent,
      currentOrders: Number(currentOrders),
      baselineOrders: Number(baselineOrders),
      horizons,
      period: input.period,
      baselinePeriod: input.baselinePeriod,
      asOf: input.asOf,
      evidenceIds,
      metricKeys: [...new Set(sourceMetrics.map(metric => metric.key))].sort(),
      formulaVersions,
      warnings: [
        "ORDER_LINE_QUANTITY_IS_NOT_VERIFIED_SHIPPED_OR_RECOGNIZED_SALES",
        "SCENARIO_ENVELOPE_IS_OBSERVED_RATE_RANGE_NOT_A_CONFIDENCE_INTERVAL",
        "NO_SEASONALITY_PROMOTION_OR_STOCKOUT_ADJUSTMENT",
      ],
    });
  }

  const warnings = [...passport.warnings];
  if (!input.completePopulation) warnings.push("DEMAND_SOURCE_POPULATION_INCOMPLETE");
  if (withheld.length) warnings.push("DEMAND_FORECAST_ROWS_WITHHELD");
  const status: EvidenceStatus = passport.status === "UNVERIFIED" || passport.status === "NEEDS_REVIEW"
    ? passport.status
    : !input.completePopulation || withheld.length || input.signals.length > 0 && passport.status === "UNAVAILABLE"
      ? "NEEDS_REVIEW"
      : "VERIFIED";

  return {
    id: "demand-forecast:" + input.id,
    asOf: input.asOf,
    status,
    completePopulation: input.completePopulation,
    period: input.period,
    baselinePeriod: input.baselinePeriod,
    forecasts: forecasts.sort((a, b) =>
      (a.trend === b.trend ? 0 : a.trend === "DECLINING" ? -1 : b.trend === "DECLINING" ? 1 :
        a.trend === "INCREASING" ? -1 : b.trend === "INCREASING" ? 1 : 0) ||
      a.productLabel.localeCompare(b.productLabel)
    ),
    withheld,
    warnings: [...new Set(warnings)],
  };
}


export interface DemandScenarioHorizonResult {
  days: DemandForecastHorizon["days"];
  baselineLowQuantity: number;
  baselineExpectedQuantity: number;
  baselineHighQuantity: number;
  scenarioLowQuantity: number;
  scenarioExpectedQuantity: number;
  scenarioHighQuantity: number;
  expectedDeltaQuantity: number;
}

export interface DemandScenarioResult {
  id: string;
  status: "SIMULATED" | "WITHHELD";
  reason: string | null;
  productRef: string | null;
  productLabel: string | null;
  unitOfMeasure: string | null;
  changePercent: number | null;
  asOf: string | null;
  period: EvidencePeriod | null;
  baselinePeriod: EvidencePeriod | null;
  horizons: DemandScenarioHorizonResult[];
  evidenceIds: string[];
  metricKeys: string[];
  formulaVersions: string[];
  formulaId: "product-demand.what-if";
  formulaVersion: "1.0.0";
  assumptionBoundary: "USER_SUPPLIED";
  accountingFact: false;
  limitations: string[];
}

function scaleDemandQuantity(value: number, changePercent: number): bigint | null {
  const units = decimalToMinorUnits(value, 6);
  if (units === null || units < 0n) return null;
  const factor = BigInt(100 + changePercent);
  // Round half up at the source's six-decimal quantity precision.
  return (units * factor + 50n) / 100n;
}

/**
 * Applies one explicit user-supplied percentage to a verified product demand
 * forecast. The output is a local simulation only: it never writes orders,
 * inventory, purchase orders, prices, sales or accounting entries.
 */
export function buildDemandScenario(input: {
  forecast: DemandForecastResult;
  productRef: string;
  changePercent: number;
}): DemandScenarioResult {
  const { forecast, productRef, changePercent } = input;
  const withheld = (reason: string, product: ProductDemandForecast | null = null): DemandScenarioResult => ({
    id: "demand-scenario:" + (forecast?.id ?? "unknown") + ":" + (productRef || "unknown"),
    status: "WITHHELD",
    reason,
    productRef: product?.productRef ?? null,
    productLabel: product?.productLabel ?? null,
    unitOfMeasure: product?.unitOfMeasure ?? null,
    changePercent: Number.isInteger(changePercent) && changePercent >= -100 && changePercent <= 300 ? changePercent : null,
    asOf: forecast?.asOf ?? null,
    period: forecast?.period ?? null,
    baselinePeriod: forecast?.baselinePeriod ?? null,
    horizons: [],
    evidenceIds: [],
    metricKeys: [],
    formulaVersions: [],
    formulaId: "product-demand.what-if",
    formulaVersion: "1.0.0",
    assumptionBoundary: "USER_SUPPLIED",
    accountingFact: false,
    limitations: [reason, "SIMULATION_ONLY_NO_BUSINESS_RECORD_MUTATION"],
  });

  if (!Number.isInteger(changePercent) || changePercent < -100 || changePercent > 300) {
    return withheld("ASSUMPTION_OUT_OF_BOUNDS");
  }
  if (!forecast || forecast.status !== "VERIFIED") {
    return withheld("DEMAND_SOURCE_NOT_VERIFIED");
  }
  if (!forecast.completePopulation) {
    return withheld("DEMAND_SOURCE_POPULATION_INCOMPLETE");
  }
  if (typeof productRef !== "string" || !productRef.trim() || !Array.isArray(forecast.forecasts)) {
    return withheld("PRODUCT_SELECTION_INVALID");
  }
  const matches = forecast.forecasts.filter((item) => item.productRef === productRef);
  if (matches.length !== 1) {
    return withheld("PRODUCT_NOT_UNIQUELY_AVAILABLE");
  }
  const product = matches[0];
  const uniqueStrings = (values: unknown): values is string[] =>
    Array.isArray(values) && values.length > 0 &&
    values.every((value) => typeof value === "string" && value.trim().length > 0);
  const samePeriodValue = (a: EvidencePeriod | null, b: EvidencePeriod | null) =>
    a !== null && b !== null && a.from === b.from && a.to === b.to;

  if (!product.unitOfMeasure?.trim() || product.asOf !== forecast.asOf ||
      !samePeriodValue(product.period, forecast.period) ||
      !samePeriodValue(product.baselinePeriod, forecast.baselinePeriod) ||
      !uniqueStrings(product.evidenceIds) || !uniqueStrings(product.metricKeys) ||
      !uniqueStrings(product.formulaVersions) || !Array.isArray(product.horizons) ||
      product.horizons.length !== 3) {
    return withheld("PRODUCT_EVIDENCE_INCOMPLETE", product);
  }

  const expectedDays = [7, 30, 90];
  const seenDays = new Set<number>();
  const horizons: DemandScenarioHorizonResult[] = [];
  for (const horizon of [...product.horizons].sort((a, b) => a.days - b.days)) {
    if (!expectedDays.includes(horizon.days) || seenDays.has(horizon.days)) {
      return withheld("HORIZON_SET_INVALID", product);
    }
    seenDays.add(horizon.days);
    const low = decimalToMinorUnits(horizon.lowQuantity, 6);
    const expected = decimalToMinorUnits(horizon.expectedQuantity, 6);
    const high = decimalToMinorUnits(horizon.highQuantity, 6);
    if (low === null || expected === null || high === null || low < 0n ||
        expected < low || high < expected) {
      return withheld("HORIZON_QUANTITY_INVALID", product);
    }
    const scenarioLow = scaleDemandQuantity(horizon.lowQuantity, changePercent);
    const scenarioExpected = scaleDemandQuantity(horizon.expectedQuantity, changePercent);
    const scenarioHigh = scaleDemandQuantity(horizon.highQuantity, changePercent);
    if (scenarioLow === null || scenarioExpected === null || scenarioHigh === null ||
        scenarioLow > scenarioExpected || scenarioExpected > scenarioHigh) {
      return withheld("SCENARIO_QUANTITY_UNSAFE", product);
    }
    const lowNumber = minorUnitsToNumber(low, 6);
    const expectedNumber = minorUnitsToNumber(expected, 6);
    const highNumber = minorUnitsToNumber(high, 6);
    const scenarioLowNumber = minorUnitsToNumber(scenarioLow, 6);
    const scenarioExpectedNumber = minorUnitsToNumber(scenarioExpected, 6);
    const scenarioHighNumber = minorUnitsToNumber(scenarioHigh, 6);
    const deltaNumber = minorUnitsToNumber(scenarioExpected - expected, 6);
    if ([lowNumber, expectedNumber, highNumber, scenarioLowNumber, scenarioExpectedNumber, scenarioHighNumber, deltaNumber]
      .some((value) => value === null)) {
      return withheld("SCENARIO_QUANTITY_UNSAFE", product);
    }
    horizons.push({
      days: horizon.days,
      baselineLowQuantity: lowNumber as number,
      baselineExpectedQuantity: expectedNumber as number,
      baselineHighQuantity: highNumber as number,
      scenarioLowQuantity: scenarioLowNumber as number,
      scenarioExpectedQuantity: scenarioExpectedNumber as number,
      scenarioHighQuantity: scenarioHighNumber as number,
      expectedDeltaQuantity: deltaNumber as number,
    });
  }
  if (seenDays.size !== expectedDays.length) return withheld("HORIZON_SET_INVALID", product);

  return {
    id: "demand-scenario:" + forecast.id + ":" + product.productRef + ":" + changePercent,
    status: "SIMULATED",
    reason: null,
    productRef: product.productRef,
    productLabel: product.productLabel,
    unitOfMeasure: product.unitOfMeasure,
    changePercent,
    asOf: forecast.asOf,
    period: forecast.period,
    baselinePeriod: forecast.baselinePeriod,
    horizons,
    evidenceIds: [...new Set(product.evidenceIds)],
    metricKeys: [...new Set(product.metricKeys)],
    formulaVersions: [...new Set(product.formulaVersions)],
    formulaId: "product-demand.what-if",
    formulaVersion: "1.0.0",
    assumptionBoundary: "USER_SUPPLIED",
    accountingFact: false,
    limitations: [
      "USER_SUPPLIED_DEMAND_CHANGE_ASSUMPTION",
      "ORDER_LINE_QUANTITY_IS_NOT_VERIFIED_SHIPPED_OR_RECOGNIZED_SALES",
      "OBSERVED_RATE_RANGE_IS_NOT_A_STATISTICAL_CONFIDENCE_INTERVAL",
      "NO_SEASONALITY_PROMOTION_OR_STOCKOUT_ADJUSTMENT",
      "SIMULATION_ONLY_NO_BUSINESS_RECORD_MUTATION",
    ],
  };
}
