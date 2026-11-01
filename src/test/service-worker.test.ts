import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void };
type FetchWorkerEvent = {
  request: Request;
  respondWith: (promise: Promise<Response>) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
};
type Listener = (event: WorkerEvent | FetchWorkerEvent) => void;

function sameOriginResponse(body: BodyInit | null, init?: ResponseInit): Response {
  const response = new Response(body, init);
  // Node's Response defaults to type "default"; browser fetch for same-origin returns "basic".
  Object.defineProperty(response, "type", { configurable: true, value: "basic" });
  return response;
}

const DIAGNOSTIC_SECRET_VALUES = [
  "sw-access-token-fixture",
  "sw-refresh-token-fixture",
  "sw-client-secret-fixture",
  "sw-oauth-code-fixture",
];

function createSensitiveDiagnosticFailure(label: string): Error {
  const query = new URLSearchParams({
    access_token: DIAGNOSTIC_SECRET_VALUES[0],
    refresh_token: DIAGNOSTIC_SECRET_VALUES[1],
    client_secret: DIAGNOSTIC_SECRET_VALUES[2],
    code: DIAGNOSTIC_SECRET_VALUES[3],
  });
  const url = "https://aghbari.example/assets/app.js?" + query.toString()
    + "#refresh_token=" + DIAGNOSTIC_SECRET_VALUES[1];
  const error = new Error(label + ": " + url);
  error.stack = error.name + ": " + label + "\\n    at fetch (" + url + ")";
  return error;
}

function expectNoDiagnosticSecrets(calls: unknown): void {
  const output = JSON.stringify(calls);
  for (const secret of DIAGNOSTIC_SECRET_VALUES) {
    expect(output).not.toContain(secret);
  }
}

async function loadServiceWorker(overrides: {
  cacheAdd?: (url: string) => Promise<void>;
  cacheNames?: string[];
  cacheMatch?: (request: Request | string) => Promise<Response | null>;
  fetcher?: (request: Request | string) => Promise<Response>;
  cachePut?: (request: Request | string, response: Response) => Promise<void>;
} = {}) {
  const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");
  const listeners = new Map<string, Listener>();
  const cacheAdd = vi.fn(async (url: string) => overrides.cacheAdd?.(url));
  const cachePut = vi.fn(async (request: Request | string, response: Response) => {
    await overrides.cachePut?.(request, response);
  });
  const cache = { add: cacheAdd, put: cachePut };
  const cacheDelete = vi.fn(async () => true);
  const cacheNames = overrides.cacheNames ?? [];
  const cachesMock = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => cacheNames),
    delete: cacheDelete,
    match: vi.fn(async (request: Request | string) => overrides.cacheMatch?.(request) ?? null),
  };
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const diagnosticMessages: unknown[] = [];
  const diagnosticClient = { postMessage: (message: unknown) => diagnosticMessages.push(message) };
  const matchAll = vi.fn(async () => [diagnosticClient]);
  const selfMock = {
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting,
    clients: { claim, matchAll },
    location: { origin: "https://aghbari.example" },
  };

  runInNewContext(source, {
    self: selfMock,
    caches: cachesMock,
    URL,
    Promise,
    Response,
    fetch: vi.fn((request: Request | string) => overrides.fetcher
      ? overrides.fetcher(request)
      : Promise.reject(new Error("unexpected network request"))),
  });

  return { listeners, cacheAdd, cachePut, cachesMock, cacheDelete, skipWaiting, claim, diagnosticMessages, matchAll };
}

describe("Aghbari PWA offline shell", () => {
  it("uses structured, redacted client diagnostics instead of console logging", async () => {
    const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(source).toContain("aghbari:service-worker-diagnostic");
    expect(source).not.toMatch(/\bconsole\.(?:log|warn|error)\s*\(/);
    expect(source).not.toMatch(/\bError\.(?:message|stack)/);
  });

  it("precaches MIME-valid shell assets while skipping an optional asset with the wrong MIME", async () => {
    const worker = await loadServiceWorker({
      fetcher: async (url) => {
        if (url === "/") return sameOriginResponse("<!doctype html>", {
          status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        if (url === "/manifest.webmanifest") return sameOriginResponse("<html>fallback</html>", {
          status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        if (url === "/favicon.ico") return sameOriginResponse("icon", {
          status: 200, headers: { "Content-Type": "image/x-icon" },
        });
        throw new Error("unexpected shell URL: " + url);
      },
    });
    const pending: Promise<unknown>[] = [];
    worker.listeners.get("install")?.({ waitUntil: (promise) => pending.push(promise) });

    await Promise.all(pending);

    expect(worker.cachesMock.open).toHaveBeenCalledWith("aghbari-shell-v3");
    expect(worker.cacheAdd).not.toHaveBeenCalled();
    expect(worker.cachePut.mock.calls.map(([url]) => url)).toEqual(["/", "/favicon.ico"]);
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it("does not cache account, invoice or admin navigation responses", async () => {
    const worker = await loadServiceWorker({
      fetcher: async () => new Response("private route shell", { status: 200 }),
    });
    const pending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://aghbari.example/invoices",
        mode: "navigate",
      } as Request,
      respondWith: (promise) => pending.push(promise),
    });
    await expect(Promise.all(pending)).resolves.toHaveLength(1);
    expect(worker.cachesMock.open).not.toHaveBeenCalled();
    expect(worker.cachePut).not.toHaveBeenCalled();
  });

  it("caches only the public home shell and uses it as the offline deep-route fallback", async () => {
    const shell = new Response("public Aghbari shell", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    const worker = await loadServiceWorker({
      cacheMatch: async (key) => key === "/" ? shell : null,
      fetcher: async (request) => {
        const requestUrl = typeof request === "string"
          ? new URL(request, "https://aghbari.example").href
          : request.url;
        if (requestUrl === "https://aghbari.example/") return shell.clone();
        throw new Error("offline");
      },
    });

    const onlinePending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: "https://aghbari.example/", mode: "navigate" } as Request,
      respondWith: (promise) => onlinePending.push(promise),
    });
    await Promise.all(onlinePending);
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.cachePut).toHaveBeenCalledTimes(1);
    expect(worker.cachePut).toHaveBeenCalledWith("/", expect.any(Response));

    const offlinePending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: "https://aghbari.example/invoices", mode: "navigate" } as Request,
      respondWith: (promise) => offlinePending.push(promise),
    });
    await expect(Promise.all(offlinePending)).resolves.toEqual([shell]);
    expect(worker.cachesMock.match).toHaveBeenCalledWith("/");
    expect(worker.cachePut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["customer invoice PDF", "https://aghbari.example/api/invoice-pdf/11111111-1111-4111-8111-111111111111"],
    ["customer pricing RPC", "https://aghbari.example/rest/v1/rpc/preview_customer_order_pricing"],
    ["asynchronous export download", "https://aghbari.example/functions/v1/async-export-download"],
  ])("does not intercept or cache %s requests", async (_label, requestUrl) => {
    const worker = await loadServiceWorker({
      fetcher: async () => new Response("private response", { status: 200 }),
    });
    const respondWith = vi.fn();
    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: requestUrl, mode: "cors" } as Request,
      respondWith,
    });

    // Returning without respondWith leaves authentication-bound data network-authoritative.
    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.cachesMock.match).not.toHaveBeenCalled();
    expect(worker.cachesMock.open).not.toHaveBeenCalled();
  });

  it.each([
    ["final order submission", "POST", "https://aghbari.example/api/orders"],
    ["financial payment", "POST", "https://aghbari.example/api/payments"],
    ["stock movement", "PATCH", "https://aghbari.example/rest/v1/inventory_movements"],
    ["cart mutation", "DELETE", "https://aghbari.example/rest/v1/customer_carts"],
  ])("never intercepts or queues offline %s writes", async (_label, method, requestUrl) => {
    const fetcher = vi.fn(async () => new Response("must remain network-authoritative", { status: 200 }));
    const worker = await loadServiceWorker({ fetcher });
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: { method, url: requestUrl, mode: "cors" } as Request,
      respondWith,
    });

    // A non-GET business mutation must fall through to the browser's network path;
    // the service worker cannot turn it into an offline-accepted operation.
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(worker.cachesMock.match).not.toHaveBeenCalled();
    expect(worker.cachesMock.open).not.toHaveBeenCalled();
    expect(worker.cachePut).not.toHaveBeenCalled();
  });

  it("serves a cached asset without an unhandled rejection when the background refresh is offline", async () => {
    const cachedResponse = new Response("cached asset", { status: 200 });
    const networkError = createSensitiveDiagnosticFailure("offline");
    const worker = await loadServiceWorker({
      cacheMatch: async () => cachedResponse,
      fetcher: async () => { throw networkError; },
    });
    const pending: Promise<Response>[] = [];
    const lifecycle: Promise<unknown>[] = [];
    worker.listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://aghbari.example/assets/app.js",
        mode: "cors",
      } as Request,
      respondWith: (promise: Promise<Response>) => pending.push(promise as Promise<Response>),
      waitUntil: (promise: Promise<unknown>) => lifecycle.push(promise),
    } as unknown as WorkerEvent & { request: Request; respondWith: (promise: Promise<Response>) => void });

    await expect(Promise.all(pending)).resolves.toEqual([cachedResponse]);
    await expect(Promise.all(lifecycle)).resolves.toBeDefined();
    expect(worker.diagnosticMessages).toContainEqual({
      type: "aghbari:service-worker-diagnostic",
      level: "warning",
      code: "background-asset-refresh-failed",
      pathname: "/assets/app.js",
      errorType: "Error",
    });
    expectNoDiagnosticSecrets(worker.diagnosticMessages);
  });


  it("omits URL query parameters from diagnostics when an asset cache write fails", async () => {
    const requestUrl = "https://aghbari.example/assets/app.js?access_token=do-not-log-this";
    const pending: Promise<Response>[] = [];
    const lifecycle: Promise<unknown>[] = [];
    const worker = await loadServiceWorker({
      fetcher: async () => sameOriginResponse("export const ok = true;", {
        status: 200,
        headers: { "Content-Type": "application/javascript" },
      }),
      cachePut: async () => {
        throw createSensitiveDiagnosticFailure("cache storage unavailable");
      },
    });

    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: requestUrl, mode: "cors" } as Request,
      respondWith: (promise) => pending.push(promise as Promise<Response>),
      waitUntil: (promise) => lifecycle.push(promise),
    });

    await expect(Promise.all(pending)).resolves.toHaveLength(1);
    await expect(Promise.all(lifecycle)).resolves.toBeDefined();
    expect(worker.diagnosticMessages).toContainEqual({
      type: "aghbari:service-worker-diagnostic",
      level: "warning",
      code: "static-asset-cache-write-failed",
      pathname: "/assets/app.js",
      errorType: "Error",
    });
    expectNoDiagnosticSecrets(worker.diagnosticMessages);
    expect(JSON.stringify(worker.diagnosticMessages)).not.toContain("do-not-log-this");
  });

  it("removes previous shell cache versions during activation", async () => {
    const worker = await loadServiceWorker({ cacheNames: ["aghbari-shell-v1", "aghbari-shell-v2", "aghbari-shell-v3", "unrelated-cache"] });
    const pending: Promise<unknown>[] = [];
    worker.listeners.get("activate")?.({ waitUntil: (promise) => pending.push(promise) });

    await Promise.all(pending);

    expect(worker.cacheDelete).toHaveBeenCalledTimes(2);
    expect(worker.cacheDelete).toHaveBeenCalledWith("aghbari-shell-v1");
    expect(worker.cacheDelete).toHaveBeenCalledWith("aghbari-shell-v2");
    expect(worker.claim).toHaveBeenCalledOnce();
  });
});
