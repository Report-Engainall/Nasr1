#!/usr/bin/env bash
set -euo pipefail

GITLEAKS_BIN="${GITLEAKS_BIN:-gitleaks}"
temporary_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
temporary_directory="$(mktemp -d "$temporary_root/gitleaks-history-canary.XXXXXX")"
repository="$temporary_directory/repository"
report="$temporary_directory/report.json"
log="$temporary_directory/scan.log"
mkdir -p "$repository"
trap 'rm -rf "$temporary_directory"' EXIT

# Compose a synthetic AWS-shaped test value only at runtime. The complete value
# is never present in this script, command arguments, or workflow logs.
synthetic_key="$(printf '%s%s' 'AKIA' 'QWERTYUIOPASDFGH')"

git -C "$repository" init --quiet --initial-branch=main
git -C "$repository" config user.name "P1 Gitleaks Canary"
git -C "$repository" config user.email "p1-gitleaks-canary@example.test"

printf 'aws_access_key_id=%s\n' "$synthetic_key" > "$repository/legacy-fixture.txt"
git -C "$repository" add legacy-fixture.txt
git -C "$repository" commit --quiet -m "test: introduce synthetic legacy credential"
legacy_commit="$(git -C "$repository" rev-parse HEAD)"

rm "$repository/legacy-fixture.txt"
git -C "$repository" commit --quiet --allow-empty -m "test: remove synthetic legacy credential"

if git -C "$repository" cat-file -e "HEAD:legacy-fixture.txt" 2>/dev/null; then
  echo "Canary setup failed: synthetic credential remains in the latest tree."
  exit 1
fi
if [ "$(git -C "$repository" rev-list --all --count)" -ne 2 ]; then
  echo "Canary setup failed: expected exactly two synthetic history commits."
  exit 1
fi

set +e
NO_COLOR=1 "$GITLEAKS_BIN" git \
  --redact \
  --exit-code=7 \
  --report-format=json \
  --report-path="$report" \
  --log-level=info \
  --log-opts="--full-history --all --diff-filter=tuxdb" \
  "$repository" > "$log" 2>&1
scanner_status=$?
set -e

if [ "$scanner_status" -ne 7 ]; then
  echo "Canary failed: expected Gitleaks exit code 7 for a historical finding; received $scanner_status."
  exit 1
fi

if [ ! -s "$report" ]; then
  echo "Canary failed: Gitleaks did not produce a report."
  exit 1
fi

if grep -Fq "$synthetic_key" "$report" "$log"; then
  echo "Canary failed: a synthetic test value was not redacted from output."
  exit 1
fi

python3 - "$report" "$legacy_commit" <<'PY'
import json
import sys
from pathlib import Path

report_path = Path(sys.argv[1])
expected_commit = sys.argv[2]
data = json.loads(report_path.read_text(encoding="utf-8"))
if not isinstance(data, list):
    raise SystemExit("Canary failed: unexpected Gitleaks JSON report shape.")

historical_findings = [
    finding
    for finding in data
    if finding.get("RuleID") == "aws-access-token"
    and finding.get("Commit") == expected_commit
]
if not historical_findings:
    raise SystemExit("Canary failed: the deleted historical AWS-shaped value was not attributed to its old commit.")

print("Canary PASS: Gitleaks v8.30.1 detected the removed synthetic value in its original commit; report and logs are redacted.")
PY
