export function isCheckoutAuthorizationDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null || Array.isArray(error)) return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === "42501" || candidate.status === 401 || candidate.status === 403;
}
