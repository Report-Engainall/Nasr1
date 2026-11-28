// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  CustomerServiceCaseDescription,
  parseCustomerDocumentReviewReference,
} from "./CustomerServiceCaseDescription";

const reviewOnlyNote =
  "مراجعة فقط؛ لا يغيّر هذا الطلب الرصيد ولا ينشئ دفعة أو يرحّل قيدًا محاسبيًا.";

function documentReviewDescription(source = "Onyx Pro", entryType = "فاتورة") {
  return [
    "أرجو مطابقة المستند مع كشف الحساب المعتمد وإفادتي بأي اختلاف.",
    "",
    "المستند المحدد: INV-2026-014",
    "مرجع الحركة: ERP-INV-014",
    "العملة: YER",
    "المصدر الظاهر في الكشف: " + source,
    "توقيت لقطة الكشف الظاهرة: 2026-11-28T05:30:00.000Z",
    "نوع الحركة: " + entryType + ".",
    reviewOnlyNote,
  ].join("\n");
}

afterEach(() => cleanup());

describe("CustomerServiceCaseDescription", () => {
  it("extracts and renders the exact customer-provided ERP document reference block", () => {
    const description = documentReviewDescription();
    const parsed = parseCustomerDocumentReviewReference(description);

    expect(parsed).toMatchObject({
      customerMessage: "أرجو مطابقة المستند مع كشف الحساب المعتمد وإفادتي بأي اختلاف.",
      documentNumber: "INV-2026-014",
      entryReference: "ERP-INV-014",
      currencyCode: "YER",
      sourceMode: "ONYX",
      sourceLabel: "Onyx Pro",
      sourceAsOf: "2026-11-28T05:30:00.000Z",
      entryType: "invoice",
      entryTypeLabel: "فاتورة",
    });

    render(<CustomerServiceCaseDescription description={description} />);
    expect(screen.getByRole("region", { name: "مرجع مراجعة مستند ERP" })).toBeInTheDocument();
    expect(screen.getByText("INV-2026-014")).toBeInTheDocument();
    expect(screen.getByText("ERP-INV-014")).toBeInTheDocument();
    expect(screen.getByText("Onyx Pro")).toBeInTheDocument();
    expect(screen.getByText("فاتورة")).toBeInTheDocument();
    expect(screen.getByText(/هذه بيانات مرجعية ضمن وصف العميل/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("أرجو مطابقة المستند مع كشف الحساب المعتمد وإفادتي بأي اختلاف.")).toBeInTheDocument();
    expect(screen.queryByText(/المستند المحدد: INV-2026-014/)).not.toBeInTheDocument();
  });

  it("supports the MUTAKAMEL provider and payment entry type", () => {
    const parsed = parseCustomerDocumentReviewReference(
      documentReviewDescription("المتكامل", "دفعة"),
    );
    expect(parsed?.sourceMode).toBe("MUTAKAMEL");
    expect(parsed?.entryType).toBe("payment");
    expect(parsed?.entryTypeLabel).toBe("دفعة");
  });

  it("leaves incomplete, duplicated, unsupported or unsafe reference blocks as plain text", () => {
    const valid = documentReviewDescription();
    const invalidDescriptions = [
      valid.replace("العملة: YER", "العملة: YERY"),
      valid.replace("المصدر الظاهر في الكشف: Onyx Pro", "المصدر الظاهر في الكشف: مصدر غير معروف"),
      valid.replace("توقيت لقطة الكشف الظاهرة: 2026-11-28T05:30:00.000Z", "توقيت لقطة الكشف الظاهرة: 2026-02-30T05:30:00Z"),
      valid.replace("INV-2026-014", "INV-\u0001-014"),
      valid.replace(reviewOnlyNote, "مراجعة فقط."),
      valid.replace("\n\nالمستند المحدد:", "\n\nالمستند المحدد: نسخة مكررة\n\nالمستند المحدد:"),
    ];

    for (const description of invalidDescriptions) {
      expect(parseCustomerDocumentReviewReference(description)).toBeNull();
      const { unmount } = render(<CustomerServiceCaseDescription description={description} />);
      expect(screen.queryByRole("region", { name: "مرجع مراجعة مستند ERP" })).not.toBeInTheDocument();
      expect(screen.getByText(/المستند المحدد:/)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders ordinary service descriptions without reclassifying them", () => {
    const description = "أحتاج إلى تحديث حالة طلب الشراء وتحديد موعد التسليم.";
    render(<CustomerServiceCaseDescription description={description} />);
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "مرجع مراجعة مستند ERP" })).not.toBeInTheDocument();
  });

  it("renders customer-controlled reference text as text, never executable markup", () => {
    const description = documentReviewDescription().replace(
      "INV-2026-014",
      "<img src=x onerror=alert(1)>",
    );
    render(<CustomerServiceCaseDescription description={description} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
