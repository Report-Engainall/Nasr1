#!/usr/bin/env python3
"""Audit the published Bolt recovery ZIPs in an isolated GitHub Actions runner."""
from __future__ import annotations
import argparse, csv, difflib, hashlib, io, json, logging, os, re, stat, tempfile, time, urllib.request
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "bolt-recovery-reconciliation"
SOURCE_REPO = "Report-Engainall/report-insight-engine"
SOURCE_COMMIT = "b1ca62ec277ff9f55c8e850e0470d61d81aaa138"
ARCHIVES = [
    ("NASR1-BOLT-RECOVERY-01", "Nasr1_Bolt_Before_Failure.zip", 1003172, "7c35f3ecde19dc5596fd22053be61924ef3d5318"),
    ("NASR1-BOLT-RECOVERY-02", "Nasr1_Bolt_Restored_Current.zip", 997589, "f01684a56e093a33a173b0965d1d7239c48f0936"),
]
MAX_MEMBERS = 50000
MAX_MEMBER_BYTES = 250 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MAX_RATIO = 1000
SECRET_NAMES = {".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"}

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def git_blob_sha1(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def sensitive(name):
    p = PurePosixPath(name)
    low = {part.lower() for part in p.parts}
    return (bool(low & SECRET_NAMES) or p.name.lower().startswith(".env.") or
            p.suffix.lower() in {".pem", ".p12", ".pfx", ".key"} or
            any(x in p.name.lower() for x in ("service-account", "private-key", "access-token", "password", "set_admin", "grant_admin_role")))

def safe_name(name):
    if not name or "\x00" in name or "\\" in name:
        raise ValueError("empty, NUL, or backslash member path: " + repr(name))
    p = PurePosixPath(name)
    if p.is_absolute() or re.match(r"^[A-Za-z]:", name) or any(x in (".", "..") for x in p.parts) or not p.parts:
        raise ValueError("absolute or traversal member path: " + name)
    return p

def validate_zip(zf):
    infos = zf.infolist()
    if len(infos) > MAX_MEMBERS:
        raise ValueError("member count limit exceeded: " + str(len(infos)))
    names, folded, total = set(), set(), 0
    for info in infos:
        path = safe_name(info.filename).as_posix().rstrip("/")
        if path in names:
            raise ValueError("duplicate ZIP member: " + path)
        if path.casefold() in folded:
            raise ValueError("case-fold path collision: " + path)
        names.add(path); folded.add(path.casefold())
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise ValueError("symbolic link blocked: " + path)
        if info.flag_bits & 1:
            raise ValueError("encrypted entry blocked: " + path)
        if info.file_size > MAX_MEMBER_BYTES:
            raise ValueError("member exceeds size limit: " + path)
        total += info.file_size
        if total > MAX_TOTAL_BYTES:
            raise ValueError("uncompressed archive exceeds size limit")
        if info.file_size and not info.compress_size:
            raise ValueError("invalid compressed size: " + path)
        if info.compress_size and info.file_size / info.compress_size > MAX_RATIO:
            raise ValueError("compression ratio limit exceeded: " + path)
    bad = zf.testzip()
    if bad:
        raise ValueError("zipfile.testzip CRC/decompression error at: " + bad)
    return infos

def safe_extract(zf, infos, destination):
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    for info in infos:
        relative = safe_name(info.filename)
        target = destination.joinpath(*relative.parts)
        resolved = target.resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError("resolved path escapes temp extraction root: " + info.filename)
        if info.is_dir() or info.filename.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as source, target.open("xb") as output:
            count = 0
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk: break
                count += len(chunk)
                output.write(chunk)
        if count != info.file_size:
            raise ValueError("extracted size mismatch: " + info.filename)

def read_bounded_response(response, expected_size):
    """Read at most expected_size + 1 bytes and require the pinned ZIP size."""
    if not isinstance(expected_size, int) or expected_size <= 0:
        raise ValueError("invalid pinned archive size")
    header = response.headers.get("Content-Length")
    if header:
        try:
            advertised = int(header)
        except (TypeError, ValueError):
            raise ValueError("invalid Content-Length header: " + repr(header))
        if advertised != expected_size:
            raise ValueError("Content-Length mismatch: {} != pinned {}".format(advertised, expected_size))
    parts = []
    total = 0
    while total <= expected_size:
        chunk = response.read(min(64 * 1024, expected_size + 1 - total))
        if not chunk:
            break
        if not isinstance(chunk, bytes):
            raise ValueError("archive response returned non-byte content")
        parts.append(chunk)
        total += len(chunk)
        if total > expected_size:
            raise ValueError("download exceeded pinned archive size: >{}".format(expected_size))
    if total != expected_size:
        raise ValueError("download size mismatch: {} != pinned {}".format(total, expected_size))
    return b"".join(parts)


def download(spec):
    archive_id, name, size, expected_blob = spec
    url = "https://raw.githubusercontent.com/{}/{}/{}/{}".format(
        SOURCE_REPO, SOURCE_COMMIT,
        "incoming-archives/nasr1-bolt-recovery-2026-10-17", name
    )
    last = ""
    for attempt in range(1, 4):
        print("DOWNLOAD_ATTEMPT archive={} attempt={} url={}".format(name, attempt, url), flush=True)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nasr1-Bolt-Reconciliation/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                data = read_bounded_response(response, size)
                print("DOWNLOAD_RESPONSE archive={} status={} bytes={} content_type={}".format(
                    name, response.status, len(data), response.headers.get("Content-Type", "")), flush=True)
            return data, url, ""
        except Exception as exc:
            logging.warning("Archive download attempt failed for %s: %s", name, exc, exc_info=True)
            last = "{}: {}".format(type(exc).__name__, exc)
            print("DOWNLOAD_ERROR archive={} attempt={} url={} error={}".format(name, attempt, url, last), flush=True)
            if attempt < 3: time.sleep(attempt)
    return None, url, last

def write_csv(path, fields, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

def summary_md(obj, pair_rows, ready_rows, member_rows):
    lines = [
        "# Nasr1 Bolt recovery reconciliation",
        "",
        "Target: Report-Engainall/Nasr1 / main",
        "Target SHA: " + os.environ.get("GITHUB_SHA", "unknown"),
        "Pinned source: " + SOURCE_REPO + "@" + SOURCE_COMMIT,
        "READY_TO_REUSE rows audited by content hash: " + str(len(ready_rows)),
        "Archive member rows: " + str(len(member_rows)),
        "",
        "## Archive downloads and integrity",
    ]
    for a in obj["archives"]:
        lines.append("- {}: {}".format(a["observed_name"], a["status"]))
        for key in ("actual_bytes", "sha256", "git_blob_sha1", "members", "exact_error"):
            if a.get(key): lines.append("  - {}: {}".format(key, a[key]))
    lines.extend(["", "## Archive pair comparison"])
    counts = Counter(r["comparison"] for r in pair_rows)
    for k, v in sorted(counts.items()): lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## Member decisions"])
    for k, v in sorted(Counter(r["target_decision"] for r in member_rows).items()):
        lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## READY_TO_REUSE path/hash audit"])
    for k, v in sorted(Counter(r["decision"] for r in ready_rows).items()):
        lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## Non-identical archive paths"])
    for r in pair_rows:
        if r["comparison"] != "IDENTICAL_CONTENT":
            lines.append("- {}: {}".format(r["comparison"], r["normalized_path"]))
    lines.extend(["", "## Missing or different staged/active source paths"])
    for r in ready_rows:
        if r["decision"] != "ALREADY_PRESENT_EXACT":
            lines.append("- {} | source={}:{} | staged={}".format(
                r["decision"], r["source_repository"], r["source_path"], r["staged_path"]))
    lines.extend(["", "## Errors"])
    lines.extend(["- " + e for e in obj["errors"]] or ["- None"])
    lines.append("")
    return "\n".join(lines)

class FakeResponse:
    def __init__(self, payload, headers=None):
        self.payload = payload
        self.offset = 0
        self.headers = headers or {}
        self.read_sizes = []

    def read(self, size=-1):
        assert size >= 0, "bounded reader must never request an unbounded read"
        self.read_sizes.append(size)
        chunk = self.payload[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


def assert_unsafe_archive_paths_rejected():
    candidates = ("../escape", "/etc/passwd", "C:/secret", "project/../../escape", "project\\file", "")
    for candidate in candidates:
        try:
            safe_name(candidate)
        except ValueError:
            continue
        raise AssertionError("unsafe member accepted: " + repr(candidate))


def assert_bounded_reader_contract():
    exact = FakeResponse(b"abcdef", {"Content-Length": "6"})
    assert read_bounded_response(exact, 6) == b"abcdef"
    assert all(size > 0 for size in exact.read_sizes)

    invalid_responses = (
        (FakeResponse(b"abcdefg", {"Content-Length": "7"}), 6),
        (FakeResponse(b"abc", {}), 6),
        (FakeResponse(b"abcdef", {"Content-Length": "not-a-number"}), 6),
    )
    for response, expected in invalid_responses:
        try:
            read_bounded_response(response, expected)
        except ValueError:
            continue
        raise AssertionError("bounded archive reader accepted size/header mismatch")


def assert_zip_integrity_contract():
    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project/src/ok.ts", "export const ok = true;\n")

    with zipfile.ZipFile(io.BytesIO(archive_buffer.getvalue())) as archive:
        assert len(validate_zip(archive)) == 1
        assert archive.read("project/src/ok.ts") == b"export const ok = true;\n"


def assert_archive_failure_is_recorded():
    row = build_archive_row(ARCHIVES[0], "https://example.invalid/archive.zip")
    failed_rows, errors = [], []
    record_archive_download_failure(
        ARCHIVES[0][1],
        "https://example.invalid/archive.zip",
        "offline",
        row,
        failed_rows,
        errors,
    )
    assert failed_rows == [row]
    assert row["status"] == "DOWNLOAD_FAILED"
    assert "offline" in errors[0]


def assert_review_path_contract():
    archive_id = ARCHIVES[0][0]
    identical_text = "export const value = 1;\n"
    assert review_path(
        "src/example.ts",
        {archive_id: {"src/example.ts": identical_text}},
        {"src/example.ts": identical_text.encode("utf-8")},
    ) == []

    secret_text = "SUPABASE_SERVICE_ROLE_KEY=review-only-secret\n"
    snippets = review_path(
        "src/secret.ts",
        {archive_id: {"src/secret.ts": secret_text}},
        {},
    )
    assert snippets
    assert "review-only-secret" not in repr(snippets)


def self_test():
    assert sha256(b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert git_blob_sha1(b"") == "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
    assert safe_name("project/src/main.ts").as_posix() == "project/src/main.ts"
    assert_unsafe_archive_paths_rejected()
    assert_bounded_reader_contract()
    assert_zip_integrity_contract()
    assert_archive_failure_is_recorded()
    assert_review_path_contract()
    print("SELF_TEST PASS: hashes, safe paths, bounded downloads, ZIP integrity, failure rows and redacted review diffs", flush=True)

def collect_archive_members(infos, archive_id, archive_name, target_dir, member_rows, review_text):
    file_map = {}
    member_count = 0
    for info in infos:
        member = inspect_archive_member(
            archive_id, archive_name, info, target_dir, member_rows, review_text
        )
        if member is None:
            continue
        raw, payload, digest, kind = member
        file_map[raw] = {"sha256": digest, "size": len(payload), "kind": kind}
        member_count += 1
    return file_map, member_count


def build_archive_row(spec, url):
    archive_id, name, expected_size, expected_blob = spec
    return {
        "archive_id": archive_id,
        "observed_name": name,
        "reported_bytes": expected_size,
        "reported_source": url,
        "git_blob_sha1": expected_blob,
        "sha256": "",
        "status": "",
        "extraction_directory": "",
        "notes": "",
    }


def record_archive_download_failure(name, url, download_error, row, archive_rows, errors):
    row["status"] = "DOWNLOAD_FAILED"
    row["notes"] = "URL={}; exact_error={}; retries=3".format(url, download_error)
    row["exact_error"] = download_error
    archive_rows.append(row)
    errors.append(name + " download failed: " + download_error)


def record_archive_download_metadata(spec, data, row, errors):
    _, name, expected_size, expected_blob = spec
    actual_size = len(data)
    actual_hash = sha256(data)
    actual_blob = git_blob_sha1(data)
    row["reported_bytes"] = actual_size
    row["sha256"] = actual_hash
    print(
        "ARCHIVE_BYTES name={} actual_bytes={} sha256={} git_blob_sha1={}".format(
            name, actual_size, actual_hash, actual_blob
        ),
        flush=True,
    )
    if actual_size != expected_size:
        errors.append("{} size mismatch: {} != {}".format(name, actual_size, expected_size))
    if actual_blob != expected_blob:
        errors.append("{} Git blob SHA-1 mismatch: {} != {}".format(name, actual_blob, expected_blob))
    return actual_size, actual_hash, actual_blob


def record_archive_validation_success(row, name, infos, actual_size, actual_hash, actual_blob, member_count):
    row["status"] = "DOWNLOADED_SHA256_CRC_AND_SAFE_EXTRACTION_PASS"
    row["extraction_directory"] = "Temporary runner directory outside app; deleted at job end"
    row["notes"] = (
        "actual_bytes={}; sha256={}; actual_git_blob_sha1={}; members={}; "
        "CRC/decompression PASS"
    ).format(actual_size, actual_hash, actual_blob, member_count)
    row["actual_bytes"] = actual_size
    row["actual_blob_sha1"] = actual_blob
    row["members"] = member_count
    print(
        "ZIP_VALIDATION_PASS name={} members={} total_uncompressed_bytes={}".format(
            name, member_count, sum(info.file_size for info in infos)
        ),
        flush=True,
    )


def record_archive_validation_failure(name, error, row, errors):
    logging.warning(
        "Archive validation or safe extraction failed for %s: %s",
        name,
        error,
        exc_info=True,
    )
    row["status"] = "INTEGRITY_OR_SAFE_EXTRACTION_FAILED"
    row["exact_error"] = "{}: {}".format(type(error).__name__, error)
    row["notes"] = row["exact_error"]
    errors.append(name + " validation failed: " + row["exact_error"])
    print(
        "ZIP_VALIDATION_ERROR name={} error={}".format(name, row["exact_error"]),
        flush=True,
    )


def validate_and_extract_archive(
    spec, data, temp, row, member_rows, errors,
    content_by_archive, review_text_by_archive,
    actual_size, actual_hash, actual_blob,
):
    archive_id, name, _, _ = spec
    target_dir = temp / archive_id
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            infos = validate_zip(archive)
            safe_extract(archive, infos, target_dir)
            review_text_by_archive[archive_id] = {}
            file_map, member_count = collect_archive_members(
                infos,
                archive_id,
                name,
                target_dir,
                member_rows,
                review_text_by_archive[archive_id],
            )
            content_by_archive[archive_id] = file_map
            record_archive_validation_success(
                row, name, infos, actual_size, actual_hash, actual_blob, member_count
            )
    except Exception as error:
        record_archive_validation_failure(name, error, row, errors)


def process_archive(
    spec, temp, archive_rows, member_rows, errors,
    content_by_archive, review_text_by_archive,
):
    _, name, _, _ = spec
    data, url, download_error = download(spec)
    row = build_archive_row(spec, url)
    if data is None:
        record_archive_download_failure(name, url, download_error, row, archive_rows, errors)
        return
    actual_size, actual_hash, actual_blob = record_archive_download_metadata(spec, data, row, errors)
    validate_and_extract_archive(
        spec, data, temp, row, member_rows, errors,
        content_by_archive, review_text_by_archive,
        actual_size, actual_hash, actual_blob,
    )
    archive_rows.append(row)


def inspect_archive_member(archive_id, archive_name, info, target_dir, member_rows, review_text):
    raw = safe_name(info.filename).as_posix()
    if info.is_dir() or raw.endswith("/"):
        return None
    target = target_dir.joinpath(*PurePosixPath(raw).parts)
    payload = target.read_bytes()
    digest = sha256(payload)
    source_extensions = {
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md",
        ".mdx", ".css", ".html", ".sql", ".yml", ".yaml", ".toml", ".txt",
        ".csv", ".svg", ".sh", ".ps1", ".py",
    }
    kind = (
        "EXCLUDED_SECURITY"
        if sensitive(raw)
        else "SOURCE_OR_TEXT"
        if target.suffix.lower() in source_extensions
        else "BINARY_OR_ASSET"
    )
    member_rows.append({
        "archive_id": archive_id,
        "member_path": raw,
        "size_bytes": len(payload),
        "sha256": digest,
        "kind": kind,
        "extraction_status": "EXTRACTED_TO_TEMP_OUTSIDE_APP",
        "target_decision": "PENDING",
        "notes": "Member not executed; payload not committed.",
    })
    if kind == "SOURCE_OR_TEXT" and len(payload) <= 300000:
        review_text[raw] = payload.decode("utf-8", errors="replace")
    return raw, payload, digest, kind


def collect_archives(temp):
    archive_rows, member_rows, errors = [], [], []
    content_by_archive, review_text_by_archive = {}, {}
    for spec in ARCHIVES:
        process_archive(
            spec,
            temp,
            archive_rows,
            member_rows,
            errors,
            content_by_archive,
            review_text_by_archive,
        )
    return archive_rows, member_rows, errors, content_by_archive, review_text_by_archive


def compare_archive_pair(before, restored):
    pair_rows = []
    for path in sorted(set(before) | set(restored)):
        before_row = before.get(path)
        restored_row = restored.get(path)
        decision = (
            "BEFORE_ONLY" if restored_row is None
            else "RESTORED_ONLY" if before_row is None
            else "IDENTICAL_CONTENT" if before_row["sha256"] == restored_row["sha256"]
            else "CHANGED_CONTENT"
        )
        pair_rows.append({
            "normalized_path": path,
            "before_sha256": before_row["sha256"] if before_row else "",
            "before_size_bytes": before_row["size"] if before_row else "",
            "restored_sha256": restored_row["sha256"] if restored_row else "",
            "restored_size_bytes": restored_row["size"] if restored_row else "",
            "comparison": decision,
            "security_review_required": "YES" if sensitive(path) else "NO",
        })
    return pair_rows


def compare_archives(content_by_archive):
    if len(content_by_archive) != len(ARCHIVES):
        return "", []
    prefixes = []
    for archive_id, _, _, _ in ARCHIVES:
        paths = list(content_by_archive[archive_id])
        parts = [PurePosixPath(path).parts for path in paths]
        prefix = parts[0][0] if parts and parts[0] else ""
        prefixes.append(prefix if prefix and all(len(row) > 1 and row[0] == prefix for row in parts) else "")
    common_root = prefixes[0] if prefixes[0] == prefixes[1] else ""
    normalized = []
    for index, (archive_id, _, _, _) in enumerate(ARCHIVES):
        prefix = prefixes[index]
        current = {}
        for path, value in content_by_archive[archive_id].items():
            parts = PurePosixPath(path).parts
            key = (
                PurePosixPath(*parts[1:]).as_posix()
                if prefix and parts[0] == prefix and len(parts) > 1
                else PurePosixPath(path).as_posix()
            )
            current[key] = value
        normalized.append(current)
    before, restored = normalized
    return common_root, compare_archive_pair(before, restored)


def collect_current_map():
    current_map = {}
    excluded = {".git", "node_modules", "dist", ".output", ".next", "coverage", ".tanstack"}
    for current, directories, files in os.walk(ROOT):
        directories[:] = [name for name in directories if name not in excluded]
        for filename in files:
            path = Path(current) / filename
            try:
                current_map[path.relative_to(ROOT).as_posix()] = path.read_bytes()
            except OSError as error:
                logging.debug("Skipping unreadable target file %s: %s", path, error)
    return current_map


def build_ready_rows(current_map, errors):
    manifest_path = ROOT / "docs/bolt-source-reconciliation/READY_TO_REUSE/PROVENANCE_MANIFEST.csv"
    if not manifest_path.is_file():
        errors.append("READY_TO_REUSE provenance manifest missing at " + str(manifest_path))
        return []

    ready_rows = []
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for record in csv.DictReader(handle):
            staged_path = record["staged_path"]
            staged_bytes = current_map.get(staged_path)
            target_bytes = current_map.get(record["source_path"])
            staged_hash = git_blob_sha1(staged_bytes) if staged_bytes is not None else ""
            target_hash = git_blob_sha1(target_bytes) if target_bytes is not None else ""
            decision = determine_ready_decision(record, staged_bytes, staged_hash, target_bytes, target_hash)
            ready_rows.append({
                "source_repository": record["source_repo"],
                "source_branch": record["source_branch"],
                "source_commit_sha": record["source_commit_sha"],
                "source_path": record["source_path"],
                "staged_path": staged_path,
                "source_git_blob_sha": record["source_git_blob_sha"],
                "staged_git_blob_sha_expected": record["staged_git_blob_sha"],
                "staged_file_exists": "YES" if staged_bytes is not None else "NO",
                "staged_git_blob_sha_actual": staged_hash,
                "target_file_exists": "YES" if target_bytes is not None else "NO",
                "target_git_blob_sha_actual": target_hash,
                "decision": decision,
                "test_command": (
                    "GitHub Actions path and byte hash audit; semantic integration test "
                    "still required for non-exact items"
                ),
                "test_result": "HASH_CHECKED_NOT_FULL_SEMANTIC_REVIEW",
            })
    return ready_rows


def determine_ready_decision(record, staged_bytes, staged_hash, target_bytes, target_hash):
    if staged_bytes is None:
        return "STAGED_FILE_MISSING"
    if staged_hash != record["staged_git_blob_sha"]:
        return "STAGED_BLOB_HASH_MISMATCH"
    if record["source_git_blob_sha"] != record["staged_git_blob_sha"]:
        return "PROVENANCE_BLOB_MISMATCH"
    if target_bytes is None:
        return "TARGET_PATH_MISSING_REVIEW_CONTENT"
    if target_hash == staged_hash:
        return "ALREADY_PRESENT_EXACT"
    return "TARGET_PATH_DIFFERS_REVIEW_CONTENT"


def assign_member_target_decisions(member_rows, current_map, common_archive_root):
    for row in member_rows:
        path = row["member_path"]
        if row["kind"] == "EXCLUDED_SECURITY":
            row["target_decision"] = "EXCLUDED_SECURITY"
            row["notes"] = "Hash only; do not commit secrets or credentials."
            continue
        parts = PurePosixPath(path).parts
        target_path = (
            PurePosixPath(*parts[1:]).as_posix()
            if common_archive_root and parts and parts[0] == common_archive_root and len(parts) > 1
            else path
        )
        data = current_map.get(target_path)
        if data is None:
            row["target_decision"] = "MISSING_TARGET_CANDIDATE"
            row["notes"] = "normalized_target_path=" + target_path + "; review imports/contracts before integration"
        elif sha256(data) == row["sha256"]:
            row["target_decision"] = "ALREADY_PRESENT_EXACT"
            row["notes"] = "byte-identical target at " + target_path
        else:
            row["target_decision"] = "TARGET_PRESENT_DIFFERENT_CONTENT_REVIEW"
            row["notes"] = "target path exists with different bytes at " + target_path


SECRET_PATTERN = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|"
    r"sb_secret_[A-Za-z0-9_=-]{20,}|sk-[A-Za-z0-9_-]{25,})\b|"
    r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b"
)
REDACT_PATTERN = re.compile(
    r"(?im)^(\s*(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|"
    r"DATABASE_URL|PRIVATE_KEY|ACCESS_TOKEN|API_SECRET|ADMIN_PASSWORD)"
    r"\s*[:=]\s*)\S.*$"
)


def review_safe(value):
    if SECRET_PATTERN.search(value):
        return None
    return REDACT_PATTERN.sub(r"\1[REDACTED]", value)


def normalize_review_text(review_text_by_archive, common_archive_root):
    normalized = {}
    for archive_id, texts in review_text_by_archive.items():
        normalized[archive_id] = {}
        for raw_path, source_text in texts.items():
            parts = PurePosixPath(raw_path).parts
            normalized_path = (
                PurePosixPath(*parts[1:]).as_posix()
                if common_archive_root and parts and parts[0] == common_archive_root and len(parts) > 1
                else PurePosixPath(raw_path).as_posix()
            )
            normalized[archive_id][normalized_path] = source_text
    return normalized


def review_archive_against_target(path, archive_id, archive_text, current_map):
    archive_safe = review_safe(archive_text)
    if archive_safe is None:
        return [(archive_id + " content", None)]

    target_bytes = current_map.get(path)
    target_text = target_bytes.decode("utf-8", errors="replace") if target_bytes is not None else None
    target_safe = review_safe(target_text) if target_text is not None else None
    if target_text is not None and target_safe is None:
        return [(archive_id + " vs target", None)]

    if target_safe is None:
        before_lines = []
        from_file = "Nasr1/main: absent"
    elif target_safe != archive_safe:
        before_lines = target_safe.splitlines()
        from_file = "Nasr1/main: " + path
    else:
        return []

    diff_lines = list(difflib.unified_diff(
        before_lines,
        archive_safe.splitlines(),
        fromfile=from_file,
        tofile=archive_id + ": " + path,
        lineterm="",
    ))
    if not diff_lines:
        return []
    return [(archive_id + " vs Nasr1/main", diff_lines)]


def review_archive_pair(path, normalized_review):
    before = normalized_review.get(ARCHIVES[0][0], {}).get(path)
    restored = normalized_review.get(ARCHIVES[1][0], {}).get(path)
    if before is None or restored is None:
        return []

    before_safe = review_safe(before)
    restored_safe = review_safe(restored)
    if before_safe is None or restored_safe is None:
        return [("Before vs Restored", None)]
    if before_safe == restored_safe:
        return []

    diff_lines = list(difflib.unified_diff(
        before_safe.splitlines(),
        restored_safe.splitlines(),
        fromfile="Before Failure: " + path,
        tofile="Restored Current: " + path,
        lineterm="",
    ))
    if not diff_lines:
        return []
    return [("Before vs Restored", diff_lines)]


def review_path(path, normalized_review, current_map):
    snippets = []
    for archive_id, _, _, _ in ARCHIVES:
        archive_text = normalized_review.get(archive_id, {}).get(path)
        if archive_text is None:
            continue
        snippets.extend(
            review_archive_against_target(path, archive_id, archive_text, current_map)
        )
    snippets.extend(review_archive_pair(path, normalized_review))
    return snippets

def build_review_report(review_text_by_archive, current_map, common_archive_root):
    normalized_review = normalize_review_text(review_text_by_archive, common_archive_root)
    source_paths = sorted(
        set().union(*(set(paths) for paths in normalized_review.values())),
        key=lambda path: (0 if path.startswith(("src/", "supabase/migrations/")) else 1, path),
    ) if normalized_review else []
    review_lines = [
        "# Bolt archive source review (redacted, review only)",
        "",
        "Target: Report-Engainall/Nasr1/main at " + os.environ.get("GITHUB_SHA", "unknown"),
        "Source: " + SOURCE_REPO + "@" + SOURCE_COMMIT,
        "The archived source below is inspection evidence only; it has not been copied into runtime code.",
        "Credential-bearing files are omitted. Archived SQL is not executed or treated as a production migration.",
        "",
    ]
    max_review_lines = 25000
    for path in source_paths:
        if sensitive(path) or path.endswith((".lock", ".tsbuildinfo")) or path == "package-lock.json":
            continue
        snippets = review_path(path, normalized_review, current_map)
        if not snippets:
            continue
        review_lines.extend(["## " + path, ""])
        append_review_snippets(review_lines, snippets)
        if len(review_lines) >= max_review_lines:
            review_lines.append("[REPORT TRUNCATED at " + str(max_review_lines) + " lines.]")
            break
    return review_lines


def append_review_snippets(review_lines, snippets):
    for label, lines in snippets:
        review_lines.append("### " + label)
        if lines is None:
            review_lines.append("[OMITTED: credential-like content detected; not emitted.]")
        else:
            review_lines.extend(lines[:220])
            if len(lines) > 220:
                review_lines.append("[TRUNCATED: additional lines omitted.]")
        review_lines.append("")


def write_reconciliation_outputs(
    archive_rows,
    member_rows,
    pair_rows,
    ready_rows,
    errors,
):
    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(
        OUT / "ARCHIVE_MANIFEST.csv",
        ["archive_id", "observed_name", "reported_bytes", "reported_source", "git_blob_sha1", "sha256", "status", "extraction_directory", "notes", "actual_bytes", "actual_blob_sha1", "members", "exact_error"],
        archive_rows,
    )
    write_csv(
        OUT / "ARCHIVE_MEMBERS.csv",
        ["archive_id", "member_path", "size_bytes", "sha256", "kind", "extraction_status", "target_decision", "notes"],
        member_rows,
    )
    write_csv(
        OUT / "ARCHIVE_PAIR_DIFF.csv",
        ["normalized_path", "before_sha256", "before_size_bytes", "restored_sha256", "restored_size_bytes", "comparison", "security_review_required"],
        pair_rows,
    )
    write_csv(
        OUT / "READY_TO_REUSE_FILE_AUDIT.csv",
        ["source_repository", "source_branch", "source_commit_sha", "source_path", "staged_path", "source_git_blob_sha", "staged_git_blob_sha_expected", "staged_file_exists", "staged_git_blob_sha_actual", "target_file_exists", "target_git_blob_sha_actual", "decision", "test_command", "test_result"],
        ready_rows,
    )
    result = {
        "target_repository": "Report-Engainall/Nasr1",
        "target_branch": "main",
        "target_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "source_repository": SOURCE_REPO,
        "source_commit": SOURCE_COMMIT,
        "archives": archive_rows,
        "archive_member_count": len(member_rows),
        "archive_pair_counts": dict(Counter(row["comparison"] for row in pair_rows)),
        "member_target_decisions": dict(Counter(row["target_decision"] for row in member_rows)),
        "ready_to_reuse_row_count": len(ready_rows),
        "ready_to_reuse_decisions": dict(Counter(row["decision"] for row in ready_rows)),
        "errors": errors,
        "evidence_boundary": (
            "Archive bytes were CRC tested and extracted to temp when status says PASS; "
            "archive content was not executed and no SQL applied. Hash/path audit is not "
            "semantic integration proof."
        ),
    }
    summary_path = OUT / "reconciliation-summary.json"
    summary_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = summary_md(result, pair_rows, ready_rows, member_rows)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
        handle.write(report + "\n")
    print("RECONCILIATION_SUMMARY=" + json.dumps(result, ensure_ascii=False, sort_keys=True), flush=True)
    print("REPORT_DIRECTORY=" + str(OUT), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="nasr1-bolt-recovery-",
        dir=os.environ.get("RUNNER_TEMP"),
    ) as temporary_directory:
        temp = Path(temporary_directory)
        archive_rows, member_rows, errors, content_by_archive, review_text = collect_archives(temp)
        common_root, pair_rows = compare_archives(content_by_archive)
        current_map = collect_current_map()
        ready_rows = build_ready_rows(current_map, errors)
        assign_member_target_decisions(member_rows, current_map, common_root)
        review_lines = build_review_report(review_text, current_map, common_root)
        (OUT / "ARCHIVE_SOURCE_REVIEW.md").write_text(
            "\n".join(review_lines) + "\n",
            encoding="utf-8",
        )
        print(
            "SOURCE_REVIEW_SECTIONS=" + str(sum(line.startswith("## ") for line in review_lines)),
            flush=True,
        )
        result = write_reconciliation_outputs(
            archive_rows,
            member_rows,
            pair_rows,
            ready_rows,
            errors,
        )
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
