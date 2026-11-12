const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function explicitPort(raw) {
  const match = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(raw);
  if (!match) return null;
  const authority = match[1];
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  let portText;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close < 0) return null;
    const suffix = hostPort.slice(close + 1);
    const portMatch = /^:(\d+)$/.exec(suffix);
    portText = portMatch?.[1];
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon <= 0 || hostPort.slice(0, colon).includes(":")) return null;
    const portMatch = /^(\d+)$/.exec(hostPort.slice(colon + 1));
    portText = portMatch?.[1];
  }
  return portText === undefined ? null : Number(portText);
}

export function requireLocalEndpoint(raw, label, allowedProtocols) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(label + " must be a valid URL for a loopback-only local endpoint.");
  }

  const port = explicitPort(raw);
  if (
    !allowedProtocols.includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
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
