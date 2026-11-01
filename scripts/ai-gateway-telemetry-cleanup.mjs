import { runCriticalCleanup } from "./critical-cleanup.mjs";

export async function cleanupAiGatewayTelemetry(db, reportError) {
  await runCriticalCleanup("AI gateway telemetry", [
    { name: "RESET ROLE", run: () => db.unsafe("RESET ROLE") },
    { name: "ROLLBACK", run: () => db.unsafe("ROLLBACK") },
    { name: "clear JWT subject", run: () => db.unsafe("select set_config('request.jwt.claim.sub','','false')") },
    { name: "clear JWT claims", run: () => db.unsafe("select set_config('request.jwt.claims','','false')") },
  ], reportError);
}
