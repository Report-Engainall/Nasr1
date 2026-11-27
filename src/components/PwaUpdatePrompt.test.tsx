// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

const serviceWorkerEvents = new Map<string, EventListener>();
let originalServiceWorkerDescriptor: PropertyDescriptor | undefined;
let waitingWorker: ServiceWorker;
let registration: ServiceWorkerRegistration;

function dispatchServiceWorkerMessage(data: unknown) {
  const listener = serviceWorkerEvents.get("message");
  if (!listener) throw new Error("service-worker message listener was not registered");
  act(() => {
    listener(new MessageEvent("message", { data }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceWorkerEvents.clear();
  originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

  waitingWorker = {
    state: "installed",
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scriptURL: "/sw.js",
    onstatechange: null,
    onerror: null,
    onmessage: null,
    onmessageerror: null,
  } as unknown as ServiceWorker;

  registration = {
    waiting: waitingWorker,
    installing: null,
    active: null,
    scope: "/",
    updateViaCache: "none",
    navigationPreload: {} as NavigationPreloadManager,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(true),
  } as unknown as ServiceWorkerRegistration;

  const serviceWorkerContainer = {
    controller: {} as ServiceWorker,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      serviceWorkerEvents.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string) => {
      serviceWorkerEvents.delete(type);
    }),
  } as unknown as ServiceWorkerContainer;

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorkerContainer,
  });
});

afterEach(() => {
  cleanup();
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

describe("PwaUpdatePrompt", () => {
  it("restores the update action when the waiting worker rejects synchronous message delivery", async () => {
    vi.mocked(waitingWorker.postMessage).mockImplementation(() => {
      throw new Error("worker was terminated");
    });

    render(<PwaUpdatePrompt />);
    const updateButton = await screen.findByRole("button", { name: "تحديث التطبيق" });

    fireEvent.click(updateButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر تفعيل التحديث",
    );
    expect(updateButton).toBeEnabled();
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "AGHBARI_ACTIVATE_UPDATE",
    });
  });

  it("restores the update action when the service worker reports a skipWaiting failure", async () => {
    render(<PwaUpdatePrompt />);
    const updateButton = await screen.findByRole("button", { name: "تحديث التطبيق" });

    fireEvent.click(updateButton);
    expect(updateButton).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    dispatchServiceWorkerMessage({
      type: "aghbari:service-worker-diagnostic",
      level: "error",
      code: "service-worker-skip-waiting-failed",
      resource: "lifecycle",
      errorType: "Error",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر تفعيل التحديث",
    );
    expect(updateButton).toBeEnabled();
  });

  it("hides a deferred update without sending an activation command", async () => {
    render(<PwaUpdatePrompt />);
    expect(await screen.findByRole("button", { name: "تحديث التطبيق" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تأجيل تحديث التطبيق" }));

    expect(screen.queryByText(/تحديث جديد لمتجر الأغبري جاهز/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحديث التطبيق" })).not.toBeInTheDocument();
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
  });
});
