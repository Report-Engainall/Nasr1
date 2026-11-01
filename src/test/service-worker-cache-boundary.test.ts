import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

describe("PWA service-worker cache boundary", () => {
  it("handles only same-origin GET requests", () => {
    expect(workerSource).toContain("request.method === 'GET'");
    expect(workerSource).toContain("url.origin === self.location.origin");
    expect(workerSource).toContain("shouldHandleSameOriginGet(request, url)");
  });

  it("leaves authentication and operational API traffic network-authoritative", () => {
    expect(workerSource).toContain("rest|auth|api|rpc|storage|functions");
    expect(workerSource).toContain("test(url.pathname)");
    expect(workerSource).toContain("shouldHandleSameOriginGet");
  });

  it("caches only the public root document for navigation and falls back to that shell offline", () => {
    expect(workerSource).toContain("function cachePublicHomeResponse(event, response, pathname)");
    expect(workerSource).toContain("pathname !== '/' || !isHtmlResponse(response)");
    expect(workerSource).toContain("cache.put('/', homeResponse)");
    expect(workerSource).toContain("(await caches.match('/')) || Response.error()");
    expect(workerSource).not.toContain("cache.put(event.request, response.clone())");
  });

  it("limits persistent asset caching to the explicit static-file extension allowlist", () => {
    expect(workerSource).toContain("/\\.(js|css|svg|png|jpe?g|webp|woff2?|ico)$/i.test(url.pathname)");
    expect(workerSource).toContain("response.type === 'basic'");
    expect(workerSource).toContain("isCacheableStaticAsset(url, response)");
  });

  it("removes obsolete caches only within the product shell namespace", () => {
    expect(workerSource).toContain("key.startsWith('aghbari-shell-') && key !== CACHE_NAME");
  });
});
