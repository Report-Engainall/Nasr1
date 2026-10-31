import { format } from "node:util";

const redact = (value) => value
  .replace(/\b(postgres(?:ql)?:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
  .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
  .replace(/\b(password|passwd|token|secret|api[_-]?key|service[_-]?role[_-]?key)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[REDACTED]");

function writeRecord(level, values) {
  const message = redact(format(...values));
  const errors = values.filter((value) => value instanceof Error).map((error) => ({
    name: redact(error.name || "Error"),
    message: redact(error.message || String(error)),
    ...(typeof error.stack === "string" ? { stack: redact(error.stack) } : {}),
  }));
  const record = { level, event: "cli_diagnostic", message, ...(errors.length ? { errors } : {}) };
  (level === "ERROR" ? process.stderr : process.stdout).write(JSON.stringify(record) + "\n");
}

/** Emit structured informational diagnostics without dropping the original message. */
export function logInfo(...values) {
  writeRecord("INFO", values);
}

/** Emit structured errors and preserve Error stack details. */
export function logError(...values) {
  writeRecord("ERROR", values);
}
