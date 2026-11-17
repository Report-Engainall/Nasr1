const CASE_CODE_PATTERN = /\bCASE-[0-9A-F]{10}\b/i;
const VALID_CASE_CODE = /^CASE-[0-9A-F]{10}$/i;

export function getCustomerServiceCaseCodeFromNotification(notification: {
  title: string;
  body?: string | null;
}): string | null {
  for (const value of [notification.title, notification.body ?? ""]) {
    const match = value.match(CASE_CODE_PATTERN);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

export function getCustomerServiceCaseCodeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const candidate = params.get("caseCode")?.trim() ?? "";
  return VALID_CASE_CODE.test(candidate) ? candidate.toUpperCase() : "";
}
