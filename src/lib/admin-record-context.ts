export type AdminRecordContextData = {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  query: string;
  savedAt: number;
  returnToView?: string | null;
  returnToOrderDetailId?: string | null;
};

export interface AdminRecordContextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LEGACY_ADMIN_RECORD_CONTEXT_KEY = "aghbari.admin.record-context.v1";
const ADMIN_RECORD_CONTEXT_PREFIX = "aghbari.admin.record-context.v2";
const ADMIN_RECORD_CONTEXT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function adminRecordContextStorageKey(userId: string, profileId: string): string {
  return [
    ADMIN_RECORD_CONTEXT_PREFIX,
    encodeURIComponent(userId.trim()),
    encodeURIComponent(profileId.trim()),
  ].join(":");
}

export function getAdminRecordContextStorage(): AdminRecordContextStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function removeSafely(storage: AdminRecordContextStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be disabled by browser policy; the active workspace remains usable.
  }
}

export function readAdminRecordContext(
  storage: AdminRecordContextStorage | null,
  key: string,
  validViews: readonly string[],
  now = Date.now(),
): AdminRecordContextData | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<AdminRecordContextData> | null;
    const validShape = Boolean(
      value &&
      typeof value.kind === "string" &&
      typeof value.id === "string" &&
      typeof value.title === "string" &&
      typeof value.subtitle === "string" &&
      typeof value.route === "string" &&
      typeof value.query === "string" &&
      typeof value.savedAt === "number" &&
      Number.isFinite(value.savedAt) &&
      value.savedAt <= now &&
      now - value.savedAt <= ADMIN_RECORD_CONTEXT_MAX_AGE_MS
    );
    if (!validShape || !value) {
      removeSafely(storage, key);
      return null;
    }

    return {
      kind: value.kind,
      id: value.id,
      title: value.title,
      subtitle: value.subtitle,
      route: value.route,
      query: value.query,
      savedAt: value.savedAt,
      returnToView: typeof value.returnToView === "string" && validViews.includes(value.returnToView)
        ? value.returnToView
        : null,
      returnToOrderDetailId: typeof value.returnToOrderDetailId === "string"
        ? value.returnToOrderDetailId
        : null,
    };
  } catch {
    removeSafely(storage, key);
    return null;
  }
}

export function writeAdminRecordContext(
  storage: AdminRecordContextStorage | null,
  key: string,
  context: AdminRecordContextData | null,
): void {
  if (!storage) return;
  try {
    if (context) storage.setItem(key, JSON.stringify(context));
    else storage.removeItem(key);
  } catch {
    // Context restoration is optional; it never blocks authorized navigation.
  }
}
