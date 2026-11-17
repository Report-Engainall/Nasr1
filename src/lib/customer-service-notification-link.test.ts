import { describe, expect, it } from "vitest";
import {
  getCustomerServiceCaseCodeFromNotification,
  getCustomerServiceCaseCodeFromSearch,
} from "@/lib/customer-service-notification-link";

describe("customer service notification deep links", () => {
  const code = "CASE-A1B2C3D4E5";

  it.each([
    "تحديث حالة الخدمة: " + code,
    "تحديث موعد خدمة العملاء: " + code,
    "رد فريق الأغبري على الحالة: " + code,
    "رد عميل على الحالة: " + code,
  ])("extracts the case code from a system notification title", (title) => {
    expect(getCustomerServiceCaseCodeFromNotification({ title })).toBe(code);
  });

  it("falls back to the notification body when the title has no case reference", () => {
    expect(getCustomerServiceCaseCodeFromNotification({
      title: "تحديث خدمة العملاء",
      body: "افتح الحالة case-a1b2c3d4e5 لمتابعة الرد.",
    })).toBe(code);
  });

  it("rejects malformed or missing case references", () => {
    expect(getCustomerServiceCaseCodeFromNotification({
      title: "تحديث الحالة CASE-123",
      body: null,
    })).toBeNull();
  });

  it("reads only a valid caseCode query parameter and normalizes its case", () => {
    expect(getCustomerServiceCaseCodeFromSearch("?caseCode=case-a1b2c3d4e5")).toBe(code);
    expect(getCustomerServiceCaseCodeFromSearch("?caseCode=CASE-123")).toBe("");
    expect(getCustomerServiceCaseCodeFromSearch("?other=CASE-A1B2C3D4E5")).toBe("");
  });
});
