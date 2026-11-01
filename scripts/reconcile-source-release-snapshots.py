#!/usr/bin/env python3
"""Hash-check, CRC-check, and safely inspect published commerce source-release ZIP snapshots."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import logging
import os
import re
import stat
import tempfile
import time
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "source-release-snapshot-audit"
SOURCE = "Report-Engainall/report-insight-engine"
SNAPSHOTS = [
    {"id": "SOURCE-BASELINE-20261016-180443", "tag": "commerce-source-reconciliation-20261016-180443", "name": "AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip", "bytes": 55677109, "sha256": "06b575c4a6c5d54a7084162d5416a97a1a5a750c1c51431019c68830afda85ad", "tag_commit": "3fadc2b842a89b97bd1798c1cc7985ad256fb498"},
    {"id": "SOURCE-BASELINE-20261016-180756", "tag": "commerce-source-reconciliation-20261016-180756", "name": "AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip", "bytes": 56543928, "sha256": "87ad9f91dfea9aee617649888af6aa6e1d8e02b08e5c18824cbae9fd9bdaee21", "tag_commit": "5065b51a96abf154d23161e045c450a2583ad97f"},
    {"id": "SOURCE-BASELINE-20261016-181307", "tag": "commerce-source-reconciliation-20261016-181307", "name": "AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip", "bytes": 118952752, "sha256": "28704bf7d32b7f759802682b7873f4b370fc073c54c0fbcb4268f39e37c83499", "tag_commit": "dffe66e7e4c7bd1f1ecda9ace8acb83c97f2d8ec"},
    {"id": "NASR1-BOLT-BEFORE-FAILURE-20261017", "tag": "incoming-archives/nasr1-bolt-recovery-2026-10-17", "name": "Nasr1_Bolt_Before_Failure.zip", "bytes": 1003172, "sha256": "d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365", "tag_commit": "b1ca62ec277ff9f55c8e850e0470d61d81aaa138", "url": "https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/b1ca62ec277ff9f55c8e850e0470d61d81aaa138/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip"},
    {"id": "NASR1-BOLT-RESTORED-CURRENT-20261017", "tag": "incoming-archives/nasr1-bolt-recovery-2026-10-17", "name": "Nasr1_Bolt_Restored_Current.zip", "bytes": 997589, "sha256": "9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214", "tag_commit": "b1ca62ec277ff9f55c8e850e0470d61d81aaa138", "url": "https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/b1ca62ec277ff9f55c8e850e0470d61d81aaa138/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Restored_Current.zip"},
]
MAX_ENTRIES = 75000
MAX_MEMBER_BYTES = 250 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_RATIO = 1000
MAX_EXTRACTED_SOURCE_BYTES = 750 * 1024 * 1024
MAX_SINGLE_SOURCE_BYTES = 25 * 1024 * 1024
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sql", ".css", ".scss", ".json", ".md", ".mdx", ".html", ".htm", ".yml", ".yaml", ".toml", ".xml", ".txt", ".csv", ".sh", ".ps1", ".svg"}
SENSITIVE_PARTS = {".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"}
SENSITIVE_TOKENS = ("password", "passwd", "private-key", "private_key", "service-account", "service_account", "service-role", "service_role", "access-token", "access_token", "credential", "secret", ".env")
SKIP_DIRS = {".git", "node_modules", "dist", ".next", ".output", "coverage", ".turbo"}
SNAPSHOT_PASS = "SHA256_SIZE_ZIP_CRC_AND_BOUNDED_SOURCE_EXTRACTION_PASS"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sensitive_path(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        any(part.lower() in SENSITIVE_PARTS for part in path.parts)
        or any(token in path.name.lower() for token in SENSITIVE_TOKENS)
    )


def safe_name(name: str) -> PurePosixPath:
    if not name or "\x00" in name or "\\" in name:
        raise ValueError("empty, NUL-containing, or backslash member path")
    path = PurePosixPath(name)
    if path.is_absolute() or re.match(r"^[A-Za-z]:", name) or any(part in (".", "..") for part in path.parts) or not path.parts:
        raise ValueError("absolute, drive-qualified, or traversal member path: " + name)
    return path


def inspect_headers(archive: zipfile.ZipFile) -> tuple[list[zipfile.ZipInfo], int]:
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise ValueError("member count limit exceeded: " + str(len(infos)))
    names: set[str] = set()
    folded: set[str] = set()
    total = 0
    for info in infos:
        name = safe_name(info.filename).as_posix().rstrip("/")
        if name in names:
            raise ValueError("duplicate member path: " + name)
        if name.casefold() in folded:
            raise ValueError("case-fold path collision: " + name)
        names.add(name)
        folded.add(name.casefold())
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise ValueError("symbolic link blocked: " + name)
        if info.flag_bits & 1:
            raise ValueError("encrypted ZIP member blocked: " + name)
        if info.file_size > MAX_MEMBER_BYTES:
            raise ValueError("member size limit: " + name)
        total += info.file_size
        if total > MAX_TOTAL_BYTES:
            raise ValueError("archive uncompressed size limit exceeded")
        if info.file_size and info.compress_size == 0:
            raise ValueError("invalid compressed size: " + name)
        if info.compress_size and info.file_size / info.compress_size > MAX_RATIO:
            raise ValueError("compression ratio limit: " + name)
    return infos, total


def download(spec: dict[str, object]) -> tuple[bytes, str]:
    url = str(spec.get("url") or f"https://github.com/{SOURCE}/releases/download/{spec['tag']}/{spec['name']}")
    last_error = ""
    for attempt in range(1, 4):
        print(f"DOWNLOAD_ATTEMPT id={spec['id']} attempt={attempt} url={url}", flush=True)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Nasr1-Source-Release-Audit/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
                print(f"DOWNLOAD_RESPONSE id={spec['id']} status={response.status} bytes={len(data)} content_type={response.headers.get('Content-Type', '')}", flush=True)
            return data, url
        except Exception as error:
            logging.warning("Source snapshot download attempt failed for %s: %s", spec["id"], error, exc_info=True)
            last_error = f"{type(error).__name__}: {error}"
            print(f"DOWNLOAD_ERROR id={spec['id']} attempt={attempt} url={url} error={last_error}", flush=True)
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"download failed for {url}: {last_error}")


def stream_member(
    archive: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    destination: Path | None,
    extraction_root: Path,
) -> tuple[str, int]:
    digest = hashlib.sha256()
    count = 0
    handle = None
    if destination is not None:
        root = extraction_root.resolve()
        target = destination.resolve()
        if target != root and root not in target.parents:
            raise ValueError("resolved extraction target escapes temporary root: " + info.filename)
        destination.parent.mkdir(parents=True, exist_ok=True)
        handle = destination.open("xb")
    try:
        with archive.open(info, "r") as source:
            while chunk := source.read(1024 * 1024):
                count += len(chunk)
                digest.update(chunk)
                if handle is not None:
                    handle.write(chunk)
    finally:
        if handle is not None:
            handle.close()
    if count != info.file_size:
        raise ValueError(f"member size mismatch: {info.filename}:{count}!={info.file_size}")
    return digest.hexdigest(), count


def normalize_member_paths(paths: list[str]) -> dict[str, str]:
    result = {}
    rows = [PurePosixPath(path).parts for path in paths]
    tops = {row[0] for row in rows if row}
    wrapper = next(iter(tops)) if len(tops) == 1 and all(len(row) > 1 for row in rows) else None
    for raw in paths:
        parts = PurePosixPath(raw).parts
        candidates = [PurePosixPath(raw).as_posix()]
        for index, part in enumerate(parts):
            if part.lower() == "main" and any("nasr1" in previous.lower() for previous in parts[:index]):
                if index + 1 < len(parts):
                    candidates.append(PurePosixPath(*parts[index + 1:]).as_posix())
            if part in ("Nasr1", "Report-Engainall--Nasr1"):
                tail = parts[index + 1:]
                if tail and tail[0].lower() == "main":
                    tail = tail[1:]
                if tail:
                    candidates.append(PurePosixPath(*tail).as_posix())
        if wrapper and len(parts) > 1:
            candidates.append(PurePosixPath(*parts[1:]).as_posix())
        result[raw] = next((candidate for candidate in candidates if candidate), raw)
    return result


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)


def collect_active_hashes() -> dict[str, str]:
    active = {}
    for current, directories, files in os.walk(ROOT):
        directories[:] = [name for name in directories if name not in SKIP_DIRS and name != "artifacts"]
        for filename in files:
            path = Path(current) / filename
            try:
                active[path.relative_to(ROOT).as_posix()] = sha256(path.read_bytes())
            except OSError as error:
                logging.debug("Skipping unreadable active target file %s: %s", path, error)
    return active


def extraction_destination(
    member_name: str,
    member_size: int,
    snapshot_root: Path,
    selected_total: int,
) -> Path | None:
    extension = Path(member_name).suffix.lower()
    if sensitive_path(member_name):
        return None
    if extension not in SOURCE_EXTENSIONS or member_size > MAX_SINGLE_SOURCE_BYTES:
        return None
    if selected_total + member_size > MAX_EXTRACTED_SOURCE_BYTES:
        return None
    return snapshot_root.joinpath(*PurePosixPath(member_name).parts)


def append_member_result(
    archive: zipfile.ZipFile,
    spec: dict[str, object],
    info: zipfile.ZipInfo,
    destination: Path | None,
    snapshot_root: Path,
    selected_total: int,
    by_path: dict[str, dict[str, object]],
    members: list[dict[str, object]],
    errors: list[str],
) -> tuple[int, int]:
    raw = safe_name(info.filename).as_posix()
    digest, size = stream_member(archive, info, destination, snapshot_root)
    selected = 1 if destination is not None else 0
    status = (
        "SELECTED_SOURCE_EXTRACTED_TO_TEMP"
        if destination is not None
        else ("SENSITIVE_PATH_HASH_ONLY" if sensitive_path(raw) else "HASHED_NOT_EXTRACTED")
    )
    by_path[raw] = {"sha256": digest, "size": size, "status": status}
    members.append({
        "snapshot_id": spec["id"],
        "tag": spec["tag"],
        "member_path": raw,
        "size_bytes": size,
        "sha256": digest,
        "selected_source_extracted": "YES" if destination is not None else "NO",
        "member_status": status,
    })
    return selected, selected_total + (size if destination is not None else 0)


def record_snapshot_member_failure(
    spec: dict[str, object],
    raw: str,
    info: zipfile.ZipInfo,
    error: Exception,
    members: list[dict[str, object]],
    errors: list[str],
) -> None:
    logging.warning(
        "Snapshot member validation failed for %s/%s: %s",
        spec["id"],
        raw,
        error,
        exc_info=True,
    )
    detail = f"{type(error).__name__}: {error}"
    errors.append(f"{spec['id']} member {raw}: {detail}")
    members.append({
        "snapshot_id": spec["id"],
        "tag": spec["tag"],
        "member_path": raw,
        "size_bytes": info.file_size,
        "sha256": "",
        "selected_source_extracted": "NO",
        "member_status": "READ_OR_CRC_FAILED:" + detail,
    })


def inspect_snapshot_members(
    archive: zipfile.ZipFile,
    spec: dict[str, object],
    snapshot_root: Path,
    selected_total: int,
    by_path: dict[str, dict[str, object]],
    members: list[dict[str, object]],
    errors: list[str],
) -> tuple[int, int, int, str, str, int]:
    infos, total = inspect_headers(archive)
    selected_count = 0
    for info in infos:
        if info.is_dir() or info.filename.endswith("/"):
            continue
        raw = safe_name(info.filename).as_posix()
        destination = extraction_destination(raw, info.file_size, snapshot_root, selected_total)
        try:
            selected, selected_total = append_member_result(
                archive,
                spec,
                info,
                destination,
                snapshot_root,
                selected_total,
                by_path,
                members,
                errors,
            )
            selected_count += selected
        except Exception as error:
            record_snapshot_member_failure(spec, raw, info, error, members, errors)

    member_errors = any(error.startswith(str(spec["id"]) + " member ") for error in errors)
    integrity_status = (
        "MEMBER_DECOMPRESSION_OR_CRC_FAILED"
        if member_errors
        else "ALL_MEMBER_DECOMPRESSION_AND_CRC_PASS"
    )
    status = "MEMBER_INTEGRITY_FAILED" if member_errors else SNAPSHOT_PASS
    print(
        f"SNAPSHOT_ZIP_VALIDATION id={spec['id']} members={len(infos)} "
        f"uncompressed_bytes={total} extracted_source={selected_count} status={status}",
        flush=True,
    )
    return len(infos), total, selected_count, integrity_status, status, selected_total


def audit_snapshot(
    spec: dict[str, object],
    temp_root: Path,
    selected_total: int,
    members: list[dict[str, object]],
    errors: list[str],
) -> tuple[dict[str, object], dict[str, dict[str, object]], int]:
    url = str(spec.get("url") or f"https://github.com/{SOURCE}/releases/download/{spec['tag']}/{spec['name']}")
    row: dict[str, object] = {
        "snapshot_id": spec["id"],
        "tag": spec["tag"],
        "tag_commit": spec["tag_commit"],
        "asset_name": spec["name"],
        "expected_bytes": spec["bytes"],
        "actual_bytes": "",
        "expected_sha256": spec["sha256"],
        "actual_sha256": "",
        "source_url": url,
        "download_status": "NOT RUN",
        "integrity_status": "NOT RUN",
        "member_count": "",
        "uncompressed_bytes": "",
        "selected_source_extract_count": "",
        "status": "",
        "exact_error": "",
    }
    by_path: dict[str, dict[str, object]] = {}
    try:
        data, final_url = download(spec)
        row["source_url"] = final_url
        row["actual_bytes"] = len(data)
        row["actual_sha256"] = sha256(data)
        row["download_status"] = "DOWNLOADED"
        print(f"SNAPSHOT_BYTES id={spec['id']} actual_bytes={len(data)} sha256={row['actual_sha256']}", flush=True)
        if len(data) != spec["bytes"]:
            raise ValueError(f"asset size mismatch:{len(data)}!={spec['bytes']}")
        if row["actual_sha256"] != spec["sha256"]:
            raise ValueError("asset SHA-256 mismatch")

        snapshot_root = temp_root / str(spec["id"])
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            member_count, uncompressed_bytes, selected_count, integrity_status, status, selected_total = (
                inspect_snapshot_members(
                    archive, spec, snapshot_root, selected_total, by_path, members, errors
                )
            )
        row["member_count"] = member_count
        row["uncompressed_bytes"] = uncompressed_bytes
        row["integrity_status"] = integrity_status
        row["status"] = status
        row["selected_source_extract_count"] = selected_count
    except Exception as error:
        logging.warning("Snapshot archive validation failed for %s: %s", spec["id"], error, exc_info=True)
        detail = f"{type(error).__name__}: {error}"
        errors.append(f"{spec['id']}: {detail}")
        row["status"] = "DOWNLOAD_OR_INTEGRITY_FAILED"
        row["exact_error"] = detail
        print(f"SNAPSHOT_ERROR id={spec['id']} url={url} error={detail}", flush=True)
    row["selected_source_extract_count"] = row["selected_source_extract_count"] or 0
    return row, by_path, selected_total


def compare_snapshot_pair(left_id: str, right_id: str, all_hashes: dict[str, dict[str, dict[str, object]]]) -> list[dict[str, object]]:
    left = all_hashes[left_id]
    right = all_hashes[right_id]
    rows = []
    for path in sorted(set(left) | set(right)):
        left_row = left.get(path)
        right_row = right.get(path)
        comparison = (
            "LEFT_ONLY" if right_row is None
            else "RIGHT_ONLY" if left_row is None
            else "IDENTICAL_CONTENT" if left_row["sha256"] == right_row["sha256"]
            else "CHANGED_CONTENT"
        )
        rows.append({
            "left_snapshot": left_id,
            "right_snapshot": right_id,
            "member_path": path,
            "left_sha256": left_row["sha256"] if left_row else "",
            "left_size": left_row["size"] if left_row else "",
            "right_sha256": right_row["sha256"] if right_row else "",
            "right_size": right_row["size"] if right_row else "",
            "comparison": comparison,
        })
    return rows


def build_pair_diffs(all_hashes: dict[str, dict[str, dict[str, object]]]) -> list[dict[str, object]]:
    available = [str(spec["id"]) for spec in SNAPSHOTS if spec["id"] in all_hashes]
    result = []
    for index, left_id in enumerate(available):
        for right_id in available[index + 1:]:
            result.extend(compare_snapshot_pair(left_id, right_id, all_hashes))
    return result


def build_target_comparisons(
    all_hashes: dict[str, dict[str, dict[str, object]]],
    active: dict[str, str],
) -> list[dict[str, object]]:
    target_diff = []
    for spec in SNAPSHOTS:
        snapshot_id = str(spec["id"])
        rows = all_hashes.get(snapshot_id, {})
        variants = normalize_member_paths(list(rows))
        for raw, candidate in sorted(variants.items()):
            item = rows[raw]
            target_sha = active.get(candidate)
            decision = (
                "ACTIVE_PATH_IDENTICAL"
                if target_sha and target_sha == item["sha256"]
                else "ACTIVE_PATH_DIFFERENT_CONTENT" if target_sha
                else "NO_EXACT_ACTIVE_PATH_MATCH"
            )
            target_diff.append({
                "snapshot_id": snapshot_id,
                "tag": spec["tag"],
                "member_path": raw,
                "normalized_candidate_path": candidate,
                "snapshot_sha256": item["sha256"],
                "active_target_exists": "YES" if target_sha else "NO",
                "active_target_sha256": target_sha or "",
                "decision": decision,
                "member_status": item["status"],
                "note": "Exact path/hash result only; missing match does not prove a feature is absent under a different path or contract.",
            })
    return target_diff


def counts_table(data: Counter) -> str:
    return "\n".join(f"| {key} | {value} |" for key, value in sorted(data.items())) or "| None | 0 |"


def build_report(summary: dict[str, object], pair_diff: list[dict[str, object]], target_diff: list[dict[str, object]]) -> str:
    manifest = summary["snapshots"]
    report = "# Published commerce source-release snapshot ZIP audit\n\n"
    report += f"Target: Report-Engainall/Nasr1 / main at {summary['target_sha']}\n\nSource: {SOURCE}\n\n"
    report += "## Downloads and integrity\n\n| Snapshot | Bytes | SHA-256 | Members | Extracted source/text | Status | Error |\n|---|---:|---|---:|---:|---|---|\n"
    report += "\n".join(
        f"| {row['snapshot_id']} | {row['actual_bytes']} | {row['actual_sha256']} | "
        f"{row['member_count']} | {row['selected_source_extract_count']} | "
        f"{row['status']} | {row['exact_error']} |"
        for row in manifest
    )
    report += "\n\n## Snapshot pair comparison\n\n| Result | Count |\n|---|---:|\n"
    report += counts_table(Counter(row["comparison"] for row in pair_diff))
    report += "\n\n## Active-tree path/hash comparison\n\n| Result | Count |\n|---|---:|\n"
    report += counts_table(Counter(row["decision"] for row in target_diff))
    report += "\n\n## Errors\n\n"
    report += "\n".join("- " + error for error in summary["errors"]) if summary["errors"] else "- None"
    report += "\n\nNo archived scripts were executed; no migrations or seeded data were applied. "
    report += "Missing exact paths do not prove a feature is absent without semantic API/route/RLS review.\n"
    return report


def persist_audit_outputs(
    summary: dict[str, object],
    manifest: list[dict[str, object]],
    members: list[dict[str, object]],
    pair_diff: list[dict[str, object]],
    target_diff: list[dict[str, object]],
) -> None:
    write_csv(OUT / "SOURCE_RELEASE_SNAPSHOT_MANIFEST.csv", list(manifest[0].keys()), manifest)
    write_csv(OUT / "SOURCE_RELEASE_SNAPSHOT_MEMBERS.csv", ["snapshot_id", "tag", "member_path", "size_bytes", "sha256", "selected_source_extracted", "member_status"], members)
    write_csv(OUT / "SOURCE_RELEASE_SNAPSHOT_PAIR_DIFF.csv", ["left_snapshot", "right_snapshot", "member_path", "left_sha256", "left_size", "right_sha256", "right_size", "comparison"], pair_diff)
    write_csv(OUT / "SOURCE_RELEASE_SNAPSHOT_ACTIVE_TARGET_COMPARE.csv", ["snapshot_id", "tag", "member_path", "normalized_candidate_path", "snapshot_sha256", "active_target_exists", "active_target_sha256", "decision", "member_status", "note"], target_diff)
    (OUT / "SOURCE_RELEASE_SNAPSHOT_SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report = build_report(summary, pair_diff, target_diff)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
        handle.write(report + "\n")
    print("SOURCE_RELEASE_AUDIT_SUMMARY=" + json.dumps(summary, ensure_ascii=False, sort_keys=True), flush=True)
    print("SOURCE_RELEASE_AUDIT_DIRECTORY=" + str(OUT), flush=True)


def self_test() -> int:
    assert safe_name("project/src/main.ts").as_posix() == "project/src/main.ts"
    unsafe_names = ("../escape", "/etc/passwd", "C:/secret", "project/../../escape", "project\\\\file", "")
    for candidate in unsafe_names:
        try:
            safe_name(candidate)
        except ValueError:
            continue
        raise AssertionError("unsafe member accepted: " + repr(candidate))

    payload = b"export const ok = true;\\n"
    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project/src/ok.ts", payload)
    with tempfile.TemporaryDirectory(prefix="nasr1-source-self-test-") as directory:
        with zipfile.ZipFile(io.BytesIO(archive_buffer.getvalue())) as archive:
            infos, total = inspect_headers(archive)
            assert len(infos) == 1 and total == len(payload)
            digest, size = stream_member(archive, infos[0], None, Path(directory))
            assert digest == sha256(payload) and size == len(payload)
    print("SOURCE_RELEASE_SELF_TEST PASS: path safety, ZIP header limits, bounded member read and SHA-256", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    OUT.mkdir(parents=True, exist_ok=True)
    active = collect_active_hashes()
    manifest: list[dict[str, object]] = []
    members: list[dict[str, object]] = []
    errors: list[str] = []
    all_hashes: dict[str, dict[str, dict[str, object]]] = {}
    selected_total = 0

    with tempfile.TemporaryDirectory(
        prefix="nasr1-source-release-", dir=os.environ.get("RUNNER_TEMP")
    ) as temp_name:
        temp_root = Path(temp_name)
        for spec in SNAPSHOTS:
            row, by_path, selected_total = audit_snapshot(
                spec, temp_root, selected_total, members, errors
            )
            manifest.append(row)
            if row["download_status"] == "DOWNLOADED":
                all_hashes[str(spec["id"])] = by_path

    pair_diff = build_pair_diffs(all_hashes)
    target_diff = build_target_comparisons(all_hashes, active)
    summary: dict[str, object] = {
        "target_repository": "Report-Engainall/Nasr1",
        "target_branch": "main",
        "target_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "source_repository": SOURCE,
        "snapshots": manifest,
        "member_rows": len(members),
        "pair_diff_rows": len(pair_diff),
        "active_target_compare_rows": len(target_diff),
        "pair_diff_counts": dict(Counter(row["comparison"] for row in pair_diff)),
        "active_target_decisions": dict(Counter(row["decision"] for row in target_diff)),
        "member_status_counts": dict(Counter(row["member_status"] for row in members)),
        "selected_source_extract_count": sum(
            row["member_status"] == "SELECTED_SOURCE_EXTRACTED_TO_TEMP" for row in members
        ),
        "errors": errors,
        "evidence_boundary": (
            "Each downloaded asset is checked against published size/SHA-256 metadata. "
            "All non-directory members are streamed to EOF for decompression/CRC and path/"
            "size/ratio checks. Only bounded non-sensitive source/text files are extracted "
            "to temporary runner storage. No code or SQL is executed/applied."
        ),
    }
    persist_audit_outputs(summary, manifest, members, pair_diff, target_diff)
    return 1 if errors or any(row["status"] != SNAPSHOT_PASS for row in manifest) else 0


if __name__ == "__main__":
    raise SystemExit(main())
