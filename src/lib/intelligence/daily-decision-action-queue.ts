import type { DailyDecisionActionEnvelope } from "./daily-decisions";
import type { DecisionPriority } from "./types";

export type DailyDecisionActionPriority = "ALL" | DecisionPriority;
export type DailyDecisionActionDomain = "ALL" | "INVENTORY" | "CUSTOMER" | "CASHFLOW" | "OTHER";

export interface DailyDecisionActionQueueFilters {
  searchText: string;
  priority: DailyDecisionActionPriority;
  domain: DailyDecisionActionDomain;
  requestedPage: number;
  pageSize?: number;
}

export interface DailyDecisionActionQueuePage<T> {
  items: DailyDecisionActionEnvelope<T>[];
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  searchCount: number;
  firstItemNumber: number;
  lastItemNumber: number;
  countsByPriority: Record<DecisionPriority, number>;
}

const priorities: DecisionPriority[] = ["P0", "P1", "P2", "P3"];

/** Normalize Arabic text for merchant search without changing the source snapshot. */
export function normalizeDailyDecisionActionSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function actionDomain(ruleId: string, candidateId: string): Exclude<DailyDecisionActionDomain, "ALL"> {
  const identity = (ruleId + " " + candidateId).toLocaleLowerCase();
  if (/inventory|stock|replenish/.test(identity)) return "INVENTORY";
  if (/customer|retention|quote/.test(identity)) return "CUSTOMER";
  if (/cashflow|receivable|liquidity|collection/.test(identity)) return "CASHFLOW";
  return "OTHER";
}

function searchableActionText(decision: DailyDecisionActionEnvelope<unknown>["decision"]): string {
  return normalizeDailyDecisionActionSearch([
    decision.id,
    decision.ruleId,
    decision.priority,
    decision.what,
    decision.why,
    decision.soWhat,
    decision.whatNext,
    decision.owner,
    decision.expectedOutcome,
    decision.impact?.currency ?? "",
    decision.impact?.unit ?? "",
    ...decision.proof.metricKeys,
    ...decision.proof.formulaVersions,
    ...decision.proof.evidenceIds,
  ].join(" "));
}

/** Search and page the complete loaded action population; filters never erase source records. */
export function filterAndPaginateDailyDecisionActions<T>(
  actions: readonly DailyDecisionActionEnvelope<T>[],
  filters: DailyDecisionActionQueueFilters,
): DailyDecisionActionQueuePage<T> {
  const query = normalizeDailyDecisionActionSearch(filters.searchText ?? "");
  const domain = filters.domain ?? "ALL";
  const searchMatches = actions.filter(({ decision }) => {
    const domainMatches = domain === "ALL" || actionDomain(decision.ruleId, decision.id) === domain;
    const queryMatches = !query || searchableActionText(decision).includes(query);
    return domainMatches && queryMatches;
  });
  const countsByPriority: Record<DecisionPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const action of searchMatches) countsByPriority[action.decision.priority] += 1;

  const filtered = filters.priority === "ALL"
    ? searchMatches
    : searchMatches.filter(action => action.decision.priority === filters.priority);
  const requestedSize = Number.isInteger(filters.pageSize) ? Number(filters.pageSize) : 10;
  const pageSize = Math.max(1, Math.min(50, requestedSize));
  const pageCount = Math.ceil(filtered.length / pageSize);
  const requestedPage = Number.isInteger(filters.requestedPage) ? filters.requestedPage : 0;
  const page = pageCount === 0 ? 0 : Math.max(0, Math.min(requestedPage, pageCount - 1));
  const start = page * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    page,
    pageCount,
    pageSize,
    totalCount: filtered.length,
    searchCount: searchMatches.length,
    firstItemNumber: filtered.length === 0 ? 0 : start + 1,
    lastItemNumber: start + items.length,
    countsByPriority,
  };
}
