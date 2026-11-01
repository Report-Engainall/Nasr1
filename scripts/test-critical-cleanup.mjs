import assert from "node:assert/strict";
import { runCriticalCleanup } from "./critical-cleanup.mjs";

const resetRoleError = new Error("fixture RESET ROLE failure");
const executed = [];
const logged = [];

await assert.rejects(
  runCriticalCleanup(
    "self-test",
    [
      {
        name: "RESET ROLE",
        run: async () => {
          executed.push("RESET ROLE");
          throw resetRoleError;
        },
      },
      {
        name: "ROLLBACK",
        run: async () => {
          executed.push("ROLLBACK");
        },
      },
      {
        name: "clear JWT claims",
        run: async () => {
          executed.push("clear JWT claims");
        },
      },
    ],
    (message, error) => logged.push({ message, error }),
  ),
  (error) => error === resetRoleError,
);

assert.deepEqual(executed, ["RESET ROLE"], "no SQL cleanup may run after a failed RESET ROLE");
assert.equal(logged.length, 1, "the critical cleanup failure must be reported once");
assert.match(logged[0].message, /stopping cleanup and requiring connection close/);
assert.equal(logged[0].error, resetRoleError);

const successfulSteps = [];
await runCriticalCleanup(
  "self-test",
  [
    { name: "RESET ROLE", run: async () => successfulSteps.push("RESET ROLE") },
    { name: "ROLLBACK", run: async () => successfulSteps.push("ROLLBACK") },
  ],
  () => assert.fail("successful cleanup must not log an error"),
);
assert.deepEqual(successfulSteps, ["RESET ROLE", "ROLLBACK"]);

process.stdout.write("PASS critical database cleanup fails closed after RESET ROLE failure\n");
