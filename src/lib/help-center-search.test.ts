import { describe, expect, it } from "vitest";
import { filterHelpArticles, normalizeArabicHelpSearch, type HelpSearchDocument } from "./help-center-search";

const articles: HelpSearchDocument[] = [
  { category: "الطلبات", question: "كيف أرسل طلب شراء؟", answer: "تصفح المنتجات ثم أرسل الطلب من السلة.", keywords: "شراء سلة checkout كمية سعر" },
  { category: "الفواتير والحساب", question: "أين أجد كشف الحساب؟", answer: "افتح صفحة كشف الحساب لقراءة الحركات المتاحة.", keywords: "statement رصيد حساب" },
  { category: "الحساب والتوصيل", question: "كيف أدير عناوين التوصيل؟", answer: "اختر عنوان التوصيل المناسب عند إتمام الطلب.", keywords: "عنوان عناوين delivery" },
];

describe("Arabic help-center search", () => {
  it("normalizes alef variants, extended diacritics, tatweel and repeated whitespace", () => {
    expect(normalizeArabicHelpSearch("  إِرْسَا\u0640لُ   الطَّلَب  ")).toBe("ارسال الطلب");
    expect(normalizeArabicHelpSearch("آإأٱ")).toBe("اااا");
  });

  it("matches Arabic spelling variants after normalization", () => {
    expect(filterHelpArticles(articles, "ارسال   الطلب").map((item) => item.question))
      .toEqual(["كيف أرسل طلب شراء؟"]);
  });

  it("searches category, question, answer and keywords", () => {
    expect(filterHelpArticles(articles, "statement").map((item) => item.question))
      .toEqual(["أين أجد كشف الحساب؟"]);
    expect(filterHelpArticles(articles, "delivery").map((item) => item.question))
      .toEqual(["كيف أدير عناوين التوصيل؟"]);
  });

  it("returns a copy of the complete list for an empty or whitespace-only query", () => {
    expect(filterHelpArticles(articles, "")).toEqual(articles);
    expect(filterHelpArticles(articles, "   ")).toEqual(articles);
    expect(filterHelpArticles(articles, "")).not.toBe(articles);
  });

  it("returns an empty result for an unmatched query without altering source articles", () => {
    expect(filterHelpArticles(articles, "رقم تتبع جغرافي")).toEqual([]);
    expect(articles).toHaveLength(3);
  });
});
