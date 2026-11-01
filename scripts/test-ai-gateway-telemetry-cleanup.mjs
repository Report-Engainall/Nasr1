import assert from "node:assert/strict";
import { cleanupAiGatewayTelemetry } from "./ai-gateway-telemetry-cleanup.mjs";

const resetRoleError = new Error("fixture AI telemetry RESET ROLE failure");
const failedCalls = [];
const failuresLogged = [];
const failingDb = {
  async unsafe(sql) {
    failedCalls.push(sql);
    if (sql === "RESET ROLE") throw resetRoleError;
  },
};

await assert.rejects(
  cleanupAiGatewayTelemetry(failingDb, (message, error) => failuresLogged.push({ message, error })),
  (error) => error === resetRoleError,
);
assert.deepEqual(failedCalls, ["RESET ROLE"], "no rollback or JWT cleanup may run after RESET ROLE failure");
assert.equal(failuresLogged.length, 1);
assert.match(failuresLogged[0].message, /stopping cleanup and requiring connection close/);
assert.equal(failuresLogged[0].error, resetRoleError);

const successfulCalls = [];
await cleanupAiGatewayTelemetry({
  async unsafe(sql) { successfulCalls.push(sql); },
}, () => assert.fail("successful cleanup must not log an error"));
assert.deepEqual(successfulCalls, [
  "RESET ROLE",
  "ROLLBACK",
  "select set_config('request.jwt.claim.sub','','false')",
  "select set_config('request.jwt.claims','','false')",
]);
process.stdout.write("PASS AI gateway telemetry cleanup stops after failed RESET ROLE and retains all successful cleanup steps\n");
