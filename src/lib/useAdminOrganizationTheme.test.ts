// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_THEME_UPDATE_EVENT } from "@/lib/admin-theme";
import { useAdminOrganizationTheme } from "./useAdminOrganizationTheme";

const mocks = vi.hoisted(() => ({ fetchSettings: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchSettings: mocks.fetchSettings }));

const THEME_VARIABLES = [
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-ring",
] as const;

const turquoiseSettings = [{
  key: "theme_palette",
  value: { id: "turquoise", primary: "#087f8d", accent: "#0eaa97" },
}];
const oceanSettings = [{
  key: "theme_palette",
  value: { id: "ocean", primary: "#1e4f78", accent: "#3a9fbf" },
}];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("organization theme bridge lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const name of THEME_VARIABLES) document.documentElement.style.removeProperty(name);
  });

  afterEach(() => {
    cleanup();
    for (const name of THEME_VARIABLES) document.documentElement.style.removeProperty(name);
    vi.restoreAllMocks();
  });

  it("applies tenant settings, reacts to the save event, and restores pre-existing CSS variables on unmount", async () => {
    document.documentElement.style.setProperty("--primary", "#123456");
    mocks.fetchSettings
      .mockResolvedValueOnce(turquoiseSettings)
      .mockResolvedValueOnce(oceanSettings);

    const { unmount } = renderHook(() => useAdminOrganizationTheme(true, "profile-a"));
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#087f8d"));
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#0eaa97");
    expect(document.documentElement.style.getPropertyValue("--primary-foreground")).not.toBe("");

    act(() => window.dispatchEvent(new Event(ADMIN_THEME_UPDATE_EVENT)));
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#1e4f78"));
    expect(mocks.fetchSettings).toHaveBeenCalledTimes(2);

    unmount();
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#123456");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  });

  it("does not read or mutate organization appearance when the bridge is disabled", () => {
    document.documentElement.style.setProperty("--primary", "#654321");
    const { unmount } = renderHook(() => useAdminOrganizationTheme(false, "customer-profile"));

    expect(mocks.fetchSettings).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#654321");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#654321");
  });

  it("ignores an older settings response that arrives after a newer appearance revision", async () => {
    const oldRequest = deferred<typeof oceanSettings>();
    const newRequest = deferred<typeof turquoiseSettings>();
    mocks.fetchSettings
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { unmount } = renderHook(() => useAdminOrganizationTheme(true, "profile-race"));
    await waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event(ADMIN_THEME_UPDATE_EVENT)));
    await waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledTimes(2));

    await act(async () => { newRequest.resolve(turquoiseSettings); await newRequest.promise; });
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#087f8d"));

    await act(async () => { oldRequest.resolve(oceanSettings); await oldRequest.promise; });
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#087f8d");
    unmount();
  });
});
