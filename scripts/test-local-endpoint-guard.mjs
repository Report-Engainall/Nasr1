import assert from "node:assert/strict";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

const cases = [
  {
    name: "accepts dynamic loopback API and PostgreSQL ports",
    api: "http://127.0.0.1:58255",
    database: "postgresql://tester:secret@127.0.0.1:58256/test_db",
    accept: true,
  },
  {
    name: "accepts localhost API and IPv6 loopback PostgreSQL",
    api: "http://localhost:41731",
    database: "postgres://tester:secret@[::1]:41732/test_db",
    accept: true,
  },
  {
    name: "rejects external API hostname",
    api: "http://api.example.com:58255",
    database: "postgresql://tester:secret@127.0.0.1:58256/test_db",
    accept: false,
  },
  {
    name: "rejects external database hostname",
    api: "http://127.0.0.1:58255",
    database: "postgresql://tester:secret@db.example.com:58256/test_db",
    accept: false,
  },
  {
    name: "rejects HTTPS API protocol",
    api: "https://127.0.0.1:58255",
    database: "postgresql://tester:secret@127.0.0.1:58256/test_db",
    accept: false,
  },
  {
    name: "rejects non-PostgreSQL database protocol",
    api: "http://127.0.0.1:58255",
    database: "https://127.0.0.1:58256/test_db",
    accept: false,
  },
  {
    name: "rejects API without an explicit port",
    api: "http://127.0.0.1",
    database: "postgresql://tester:secret@127.0.0.1:58256/test_db",
    accept: false,
  },
  {
    name: "rejects database without an explicit port",
    api: "http://127.0.0.1:58255",
    database: "postgresql://tester:secret@127.0.0.1/test_db",
    accept: false,
  },
  {
    name: "rejects an out-of-range API port",
    api: "http://127.0.0.1:70000",
    database: "postgresql://tester:secret@127.0.0.1:58256/test_db",
    accept: false,
  },
];

for (const testCase of cases) {
  if (testCase.accept) {
    assert.doesNotThrow(
      () => validateCashExpenseEndpoints(testCase.api, testCase.database),
      testCase.name,
    );
  } else {
    assert.throws(
      () => validateCashExpenseEndpoints(testCase.api, testCase.database),
      /loopback-only local endpoint|valid URL/i,
      testCase.name,
    );
  }
}

process.stdout.write("PASS local endpoint guard: dynamic loopback ports accepted; external hosts, disallowed protocols, missing ports and invalid ports rejected\n");
