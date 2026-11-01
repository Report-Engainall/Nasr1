import { format } from "node:util";

const redact = (value) => value
  .replace(/\b(postgres(?:ql)?:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
  .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
  .replace(/\b(access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|token|secret|api[_-]?key|service[_-]?role[_-]?key|code)(\s*[:=]\s*)(["']?)([^\s,;'"&?#]+)/gi, "$1$2$3[REDACTED]")
  // Redact every URL query/fragment value, including unknown provider-specific credential keys.
  .replace(/([?&#])([^=?&#\s"'<>]+)=([^&#\s"'<>]*)/g, "$1$2=[REDACTED]")
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|sb_secret_[A-Za-z0-9_=-]{20,}|sk-[A-Za-z0-9_-]{25,})\b/g, "[REDACTED_TOKEN]")
  .replace(/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");

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
