export type HelpSearchDocument = {
  category: string;
  question: string;
  answer: string;
  keywords: string;
};

/** Deterministic Arabic/Latin search normalization; stored article text is unchanged. */
export function normalizeArabicHelpSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase("ar")
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

export function filterHelpArticles<T extends HelpSearchDocument>(articles: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeArabicHelpSearch(query);
  if (!normalizedQuery) return [...articles];
  return articles.filter((article) => normalizeArabicHelpSearch(
    [article.category, article.question, article.answer, article.keywords].join(" "),
  ).includes(normalizedQuery));
}
