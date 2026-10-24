export type BoundedTextBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" | "invalid_utf8" };

/**
 * Read UTF-8 text without buffering beyond maxBytes.
 * Content-Length is an early-rejection hint only; streamed bytes are always counted.
 */
export async function readBoundedTextBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  contentLength: string | null = null,
): Promise<BoundedTextBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a nonnegative safe integer");
  }

  if (contentLength !== null && /^\d+$/.test(contentLength.trim())) {
    const declaredBytes = Number(contentLength.trim());
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes) {
      try { await body?.cancel(); } catch { /* preserve the size rejection */ }
      return { ok: false, reason: "too_large" };
    }
  }

  if (!body) return { ok: true, text: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* preserve the size rejection */ }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* preserve the read failure */ }
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}
