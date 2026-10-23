const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const ALLOWED_LOCAL_DATABASE_PORTS = new Set(["54322", "55432"]);

/**
 * Validate local-only endpoints before creating any synthetic device-session fixtures.
 * The P2 isolated Supabase workflow uses 55432 to avoid a host-port collision;
 * ordinary local Supabase installations may still use the default 54322.
 *
 * @param {string} apiUrl
 * @param {string} connectionString
 * @returns {URL} validated local Supabase API URL
 */
export function validateP1DeviceSessionEndpoints(apiUrl, connectionString) {
  let api;
  let database;
  try {
    api = new URL(apiUrl);
    database = new URL(connectionString);
  } catch {
    throw new Error("P1 device-session fixtures require valid local Supabase API and PostgreSQL URLs.");
  }

  const validApi =
    api.protocol === "http:" &&
    LOOPBACK_HOSTS.has(api.hostname) &&
    api.port === "54321" &&
    !api.username &&
    !api.password &&
    api.pathname === "/" &&
    !api.search &&
    !api.hash;
  const validDatabase =
    ["postgres:", "postgresql:"].includes(database.protocol) &&
    LOOPBACK_HOSTS.has(database.hostname) &&
    ALLOWED_LOCAL_DATABASE_PORTS.has(database.port) &&
    database.pathname === "/postgres" &&
    !database.search &&
    !database.hash;

  if (!validApi || !validDatabase) {
    throw new Error(
      "P1 device-session fixtures are local-only: Supabase API must use HTTP loopback port 54321 and PostgreSQL must use loopback port 54322 or 55432.",
    );
  }

  return api;
}
