const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hasExplicitPort(raw) {
  const match = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(raw);
  if (!match) return false;
  const authority = match[1];
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    return close >= 0 && /^:\d+$/.test(hostPort.slice(close + 1));
  }
  const colon = hostPort.lastIndexOf(":");
  return colon > 0 && !hostPort.slice(0, colon).includes(":") && /^\d+$/.test(hostPort.slice(colon + 1));
}

export function requireLocalEndpoint(raw, label, allowedProtocols) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(label + " must be a valid URL for a loopback-only local endpoint.");
  }

  const port = Number(url.port);
  if (
    !allowedProtocols.includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    !hasExplicitPort(raw) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(label + " must use an allowed protocol and explicit valid port on a loopback-only local endpoint.");
  }
  return url;
}

export function validateCashExpenseEndpoints(apiEndpoint, databaseEndpoint) {
  const apiUrl = requireLocalEndpoint(apiEndpoint, "E2E_SUPABASE_URL", ["http:"]);
  const databaseUrl = requireLocalEndpoint(databaseEndpoint, "TEST_DATABASE_URL", ["postgres:", "postgresql:"]);
  return { apiUrl, databaseUrl };
}
