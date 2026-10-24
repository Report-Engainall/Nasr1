import { describe, expect, it } from "vitest";
import {
  completeImportRequestKey,
  getOrCreateImportRequestKey,
  type ImportRequestIdentity,
  type ImportRequestKeyStorage,
} from "@/lib/import-request-key";

function memoryStorage(): ImportRequestKeyStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const identity: ImportRequestIdentity = {
  actorId: "11111111-1111-4111-8111-111111111111",
  fileName: "catalog.csv",
  fileHash: "a".repeat(64),
  fileSize: 128,
  jobType: "unified_import",
  profileId: null,
  periodKey: "2026-10",
  sourceSystem: "manual",
  intent: "new_version",
};

describe("import request key persistence", () => {
  it("reuses a key for the same payload after an ambiguous request failure", async () => {
    const storage = memoryStorage();
    let generated = 0;
    const createRequestKey = () => {
      generated += 1;
      return generated === 1
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    };

    const first = await getOrCreateImportRequestKey(identity, { storage, now: 1_000, createRequestKey });
    const retry = await getOrCreateImportRequestKey(identity, { storage, now: 2_000, createRequestKey });

    expect(first.requestKey).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(first.reused).toBe(false);
    expect(retry.requestKey).toBe(first.requestKey);
    expect(retry.storageKey).toBe(first.storageKey);
    expect(retry.reused).toBe(true);
    expect(generated).toBe(1);
  });

  it("uses different keys for changed file identity or a deliberate duplicate-action intent", async () => {
    const storage = memoryStorage();
    let generated = 0;
    const createRequestKey = () => {
      generated += 1;
      const keys = [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      ];
      return keys[generated - 1] ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    };

    const first = await getOrCreateImportRequestKey(identity, { storage, createRequestKey });
    const merge = await getOrCreateImportRequestKey({ ...identity, intent: "merge" }, { storage, createRequestKey });
    const changedFile = await getOrCreateImportRequestKey({ ...identity, fileHash: "b".repeat(64) }, { storage, createRequestKey });
    const anotherActor = await getOrCreateImportRequestKey({ ...identity, actorId: "22222222-2222-4222-8222-222222222222" }, { storage, createRequestKey });
    const changedExternalBatch = await getOrCreateImportRequestKey(
      { ...identity, sourceSystem: "onyx_pro", externalSourceReference: "ONYX-BATCH-2026-01-B" },
      { storage, createRequestKey },
    );

    expect(merge.requestKey).not.toBe(first.requestKey);
    expect(changedFile.requestKey).not.toBe(first.requestKey);
    expect(anotherActor.requestKey).not.toBe(first.requestKey);
    expect(changedExternalBatch.requestKey).not.toBe(first.requestKey);
    expect(new Set([first.requestKey, merge.requestKey, changedFile.requestKey, anotherActor.requestKey, changedExternalBatch.requestKey]).size).toBe(5);
  });

  it("expires a stale key instead of reusing an old import attempt", async () => {
    const storage = memoryStorage();
    let generated = 0;
    const createRequestKey = () => {
      generated += 1;
      return generated === 1
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    };
    const first = await getOrCreateImportRequestKey(identity, { storage, now: 1_000, createRequestKey });
    const expired = await getOrCreateImportRequestKey(identity, {
      storage,
      now: 1_000 + 60 * 60 * 1000,
      createRequestKey,
    });

    expect(expired.requestKey).not.toBe(first.requestKey);
    expect(expired.reused).toBe(false);
    expect(generated).toBe(2);
  });

  it("clears the attempt key only after the caller confirms that a job was returned", async () => {
    const storage = memoryStorage();
    let generated = 0;
    const createRequestKey = () => {
      generated += 1;
      return generated === 1
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    };
    const first = await getOrCreateImportRequestKey(identity, { storage, createRequestKey });
    completeImportRequestKey(first.storageKey, { storage });
    const nextIntentionalAttempt = await getOrCreateImportRequestKey(identity, { storage, createRequestKey });

    expect(nextIntentionalAttempt.requestKey).not.toBe(first.requestKey);
    expect(nextIntentionalAttempt.reused).toBe(false);
    expect(generated).toBe(2);
  });

  it("fails closed when session storage cannot preserve retry identity", async () => {
    await expect(getOrCreateImportRequestKey(identity, { storage: null }))
      .rejects.toThrow(/لم يبدأ إنشاء دفعة جديدة/);
  });
});
