import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

type ResponseStub = {
  ok: boolean;
  type: string;
  headers: { get: (name: string) => string | null };
  clone: () => unknown;
};

function responseStub(contentType: string, ok = true): ResponseStub {
  return {
    ok,
    type: "basic",
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    clone: () => ({ cachedCopy: true }),
  };
}

function runFetchScenario(url: string, mode: string, response: ResponseStub) {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = {
    add: vi.fn(async () => undefined),
    match: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
  };
  const caches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => null),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const workerSelf = {
    location: { origin: "https://aghbari.test" },
    addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetchMock = vi.fn(async () => response);
  runInNewContext(workerSource, {
    self: workerSelf,
    caches,
    fetch: fetchMock,
    URL,
    Response: { error: () => ({ ok: false, type: "error" }) },
  });

  const request = { method: "GET", url, mode };
  const handler = handlers.get("fetch");
  if (!handler) throw new Error("Service worker did not register a fetch handler");
  let responsePromise: Promise<unknown> | undefined;
  const lifecyclePromises: Promise<unknown>[] = [];
  handler({
    request,
    respondWith: (value: Promise<unknown>) => { responsePromise = Promise.resolve(value); },
    waitUntil: (value: Promise<unknown>) => { lifecyclePromises.push(Promise.resolve(value)); },
  });
  if (!responsePromise) throw new Error("Service worker did not claim the same-origin GET request");
  return { responsePromise, lifecyclePromises, request, cache, caches, fetchMock, response };
}

async function flushCacheWrite(lifecyclePromises: Promise<unknown>[]): Promise<void> {
  await Promise.all(lifecyclePromises);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function runInstallScenario(responses: Map<string, ResponseStub>) {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = {
    add: vi.fn(async () => undefined),
    match: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
  };
  const caches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => null),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const workerSelf = {
    location: { origin: "https://aghbari.test" },
    addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetchMock = vi.fn(async (url: string) => {
    const response = responses.get(url);
    if (!response) throw new Error("No fixture response configured for " + url);
    return response;
  });
  runInNewContext(workerSource, {
    self: workerSelf,
    caches,
    fetch: fetchMock,
    URL,
    Response: { error: () => ({ ok: false, type: "error" }) },
  });

  const handler = handlers.get("install");
  if (!handler) throw new Error("Service worker did not register an install handler");
  let lifecyclePromise: Promise<unknown> | undefined;
  handler({ waitUntil: (value: Promise<unknown>) => { lifecyclePromise = Promise.resolve(value); } });
  if (!lifecyclePromise) throw new Error("Service worker did not wait for its install work");
  return { lifecyclePromise, cache, caches, fetchMock };
}

describe("PWA service-worker MIME cache acceptance", () => {
  it("does not cache an HTML SPA fallback returned as HTTP 200 for a missing JavaScript asset", async () => {
    const response = responseStub("text/html; charset=utf-8");
    const scenario = runFetchScenario("https://aghbari.test/assets/missing.js", "cors", response);

    expect(await scenario.responsePromise).toBe(response);
    await flushCacheWrite(scenario.lifecyclePromises);

    expect(scenario.cache.put).not.toHaveBeenCalled();
  });

  it("caches same-origin JavaScript only when the response MIME matches the asset extension", async () => {
    const response = responseStub("text/javascript; charset=utf-8");
    const scenario = runFetchScenario("https://aghbari.test/assets/app.js", "cors", response);

    expect(await scenario.responsePromise).toBe(response);
    await flushCacheWrite(scenario.lifecyclePromises);

    expect(scenario.cache.put).toHaveBeenCalledTimes(1);
    expect(scenario.cache.put).toHaveBeenCalledWith(scenario.request, { cachedCopy: true });
  });

  it("does not cache customer-looking paths just because the extension and MIME resemble a public asset", async () => {
    const response = responseStub("image/svg+xml");
    const scenario = runFetchScenario("https://aghbari.test/customers/private-mark.svg", "cors", response);

    expect(await scenario.responsePromise).toBe(response);
    await flushCacheWrite(scenario.lifecyclePromises);

    expect(scenario.cache.put).not.toHaveBeenCalled();
  });

  it("does not persist a non-HTML root response as the offline application shell", async () => {
    const response = responseStub("application/json");
    const scenario = runFetchScenario("https://aghbari.test/", "navigate", response);

    expect(await scenario.responsePromise).toBe(response);
    await flushCacheWrite(scenario.lifecyclePromises);

    expect(scenario.cache.put).not.toHaveBeenCalled();
  });

  it("persists a valid root HTML document while keeping deep navigations out of the cache", async () => {
    const response = responseStub("text/html; charset=utf-8");
    const scenario = runFetchScenario("https://aghbari.test/", "navigate", response);

    expect(await scenario.responsePromise).toBe(response);
    await flushCacheWrite(scenario.lifecyclePromises);

    expect(scenario.cache.put).toHaveBeenCalledTimes(1);
    expect(scenario.cache.put).toHaveBeenCalledWith("/", { cachedCopy: true });
  });

  it("rejects MIME-mismatched shell files independently during installation", async () => {
    const root = responseStub("application/json");
    const manifest = responseStub("text/html; charset=utf-8");
    const favicon = responseStub("image/x-icon");
    const scenario = runInstallScenario(new Map([
      ["/", root],
      ["/manifest.webmanifest", manifest],
      ["/favicon.ico", favicon],
    ]));

    await scenario.lifecyclePromise;

    expect(scenario.fetchMock).toHaveBeenCalledTimes(3);
    expect(scenario.cache.put).toHaveBeenCalledTimes(1);
    expect(scenario.cache.put).toHaveBeenCalledWith("/favicon.ico", favicon);
  });

  it("precaches a valid HTML shell, manifest JSON and favicon by their expected MIME types", async () => {
    const root = responseStub("text/html; charset=utf-8");
    const manifest = responseStub("application/manifest+json; charset=utf-8");
    const favicon = responseStub("image/vnd.microsoft.icon");
    const scenario = runInstallScenario(new Map([
      ["/", root],
      ["/manifest.webmanifest", manifest],
      ["/favicon.ico", favicon],
    ]));

    await scenario.lifecyclePromise;

    expect(scenario.cache.put).toHaveBeenCalledTimes(3);
    expect(scenario.cache.put).toHaveBeenCalledWith("/", root);
    expect(scenario.cache.put).toHaveBeenCalledWith("/manifest.webmanifest", manifest);
    expect(scenario.cache.put).toHaveBeenCalledWith("/favicon.ico", favicon);
  });
});
