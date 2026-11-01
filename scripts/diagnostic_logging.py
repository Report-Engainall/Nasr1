#!/usr/bin/env python3
"""Redact secrets and private identifiers from diagnostic logs and CLI output."""
from __future__ import annotations

import argparse
import copy
import io
import logging
import re
import traceback

_SECRET_QUERY = re.compile(
    r"(?i)([?&#](?:access_token|refresh_token|token|client_secret|clientsecret|"
    r"api_key|apikey|service_role_key|anon_key|password|passwd|authorization|"
    r"code|signature|sig|x-amz-credential|x-amz-security-token)=)[^&#\s]*"
)
_URL_USERINFO = re.compile(r"(?i)(https?://)[^/\s:@]+:[^/\s@]+@")
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")
_INLINE_SECRET = re.compile(
    r"(?i)\b(access_token|refresh_token|client_secret|service_role_key|"
    r"anon_key|api_key|apikey|password|passwd|secret|token)\b(\s*[:=]\s*)"
    r"([^\s,;]+)"
)
_GITHUB_TOKEN = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)


def redact_diagnostic_text(value: object) -> str:
    """Return a safe string without URL credentials, secret query values, or tokens."""
    text = str(value)
    text = _URL_USERINFO.sub(r"\1[REDACTED]@", text)
    text = _SECRET_QUERY.sub(r"\1[REDACTED]", text)
    text = _BEARER.sub(lambda match: match.group(1) + " [REDACTED]", text)
    text = _INLINE_SECRET.sub(lambda match: match.group(1) + match.group(2) + "[REDACTED]", text)
    text = _GITHUB_TOKEN.sub("[REDACTED_TOKEN]", text)
    text = _JWT.sub("[REDACTED_JWT]", text)
    text = _EMAIL.sub("[REDACTED_EMAIL]", text)
    return text


class RedactingFormatter(logging.Formatter):
    """Preserve traceback frames while masking sensitive exception and message text."""

    def format(self, record: logging.LogRecord) -> str:
        safe_record = copy.copy(record)
        safe_record.msg = redact_diagnostic_text(record.getMessage())
        safe_record.args = ()
        if record.exc_info:
            safe_record.exc_text = redact_diagnostic_text(
                "".join(traceback.format_exception(*record.exc_info))
            )
            safe_record.exc_info = None
        return super().format(safe_record)


def configure_diagnostic_logging(level: int = logging.INFO) -> None:
    """Install a predictable console logger whose message and traceback are redacted."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(RedactingFormatter("%(levelname)s %(message)s"))
    root.addHandler(handler)
    root.setLevel(level)


def safe_print(*values: object, **kwargs: object) -> None:
    """Print existing machine-readable progress lines after redacting secret values."""
    print(*(redact_diagnostic_text(value) for value in values), **kwargs)


def self_test() -> None:
    stream = io.StringIO()
    logger = logging.getLogger("nasr1.diagnostic-logging-self-test")
    old_handlers = list(logger.handlers)
    old_level = logger.level
    old_propagate = logger.propagate
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.WARNING)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(RedactingFormatter("%(levelname)s %(message)s"))
    logger.addHandler(handler)
    try:
        try:
            raise RuntimeError(
                "download failed https://example.test/a?access_token=fixture-access"
                "&client_secret=fixture-client-secret#refresh_token=fixture-refresh"
            )
        except RuntimeError:
            logger.exception(
                "download error https://user:fixture-password@example.test/"
                "?api_key=fixture-api-key"
            )
        output = stream.getvalue()
        for secret in (
            "fixture-access",
            "fixture-client-secret",
            "fixture-refresh",
            "fixture-password",
            "fixture-api-key",
        ):
            assert secret not in output, "diagnostic logger leaked " + secret
        assert "[REDACTED]" in output
        assert "Traceback (most recent call last)" in output
        assert "RuntimeError" in output
        assert "[REDACTED]" in redact_diagnostic_text("Bearer fixture-bearer-secret")
        assert "[REDACTED_EMAIL]" in redact_diagnostic_text("person@example.test")
    finally:
        logger.handlers.clear()
        logger.handlers.extend(old_handlers)
        logger.setLevel(old_level)
        logger.propagate = old_propagate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.parse_args()
    self_test()
    print("DIAGNOSTIC_LOGGING_REDACTION_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
