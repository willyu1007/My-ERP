#!/usr/bin/env python3
"""DB connection preflight check.

This script is intentionally dependency-light:
- SQLite uses Python stdlib (sqlite3).
- PostgreSQL / MySQL attempt common drivers if installed.
- If a DB driver is not available, the script falls back to a TCP port reachability check.

Exit codes:
- 0: PASS (full DB check) or PARTIAL PASS (network reachability only)
- 1: FAIL
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sqlite3
import sys
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional
from urllib.parse import unquote, urlparse


def _now_utc_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _redact_db_url(url: str) -> str:
    """Redact password in a DATABASE_URL-like string."""
    parsed = urlparse(url)

    # SQLite URLs have no userinfo.
    if parsed.scheme.startswith("sqlite"):
        return url

    username = parsed.username or ""
    hostname = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path or ""

    # Preserve query/fragment without exposing creds.
    query = f"?{parsed.query}" if parsed.query else ""
    fragment = f"#{parsed.fragment}" if parsed.fragment else ""

    if parsed.password is not None:
        userinfo = f"{username}:***" if username else "***"
    else:
        userinfo = username

    if userinfo:
        return f"{parsed.scheme}://{userinfo}@{hostname}{port}{path}{query}{fragment}"

    return f"{parsed.scheme}://{hostname}{port}{path}{query}{fragment}"


def _default_port_for_scheme(scheme: str) -> Optional[int]:
    if scheme in {"postgres", "postgresql"}:
        return 5432
    if scheme in {"mysql", "mariadb"}:
        return 3306
    return None


@dataclass
class CheckResult:
    timestamp_utc: str
    scheme: str
    host: Optional[str]
    port: Optional[int]
    database: Optional[str]
    username: Optional[str]
    redacted_url: str
    status: str  # PASS | PARTIAL_PASS | FAIL
    check_type: str  # sqlite_full | driver_full | tcp_only
    details: Dict[str, Any]


def _tcp_reachability(host: str, port: int, timeout_s: float) -> Dict[str, Any]:
    start = time.time()
    try:
        sock = socket.create_connection((host, port), timeout=timeout_s)
        sock.close()
        return {
            "reachable": True,
            "latency_ms": int((time.time() - start) * 1000),
        }
    except Exception as e:  # noqa: BLE001
        return {
            "reachable": False,
            "error": str(e),
        }


def _sqlite_check(path: str, timeout_s: float) -> Dict[str, Any]:
    start = time.time()
    # sqlite3 timeout is for lock wait; still useful.
    conn = sqlite3.connect(path, timeout=timeout_s)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        return {
            "ok": True,
            "latency_ms": int((time.time() - start) * 1000),
            "sqlite_version": sqlite3.sqlite_version,
        }
    finally:
        conn.close()


def _postgres_driver_check(parsed, timeout_s: float) -> Dict[str, Any]:
    host = parsed.hostname
    port = parsed.port or 5432
    dbname = (parsed.path or "").lstrip("/") or None
    user = parsed.username
    password = unquote(parsed.password) if parsed.password else None

    start = time.time()

    # Try psycopg (v3) first, then psycopg2.
    try:
        import psycopg  # type: ignore

        conn = psycopg.connect(
            host=host,
            port=port,
            dbname=dbname,
            user=user,
            password=password,
            connect_timeout=int(timeout_s),
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            return {
                "ok": True,
                "driver": "psycopg",
                "latency_ms": int((time.time() - start) * 1000),
            }
        finally:
            conn.close()
    except Exception:
        pass

    try:
        import psycopg2  # type: ignore

        conn = psycopg2.connect(
            host=host,
            port=port,
            dbname=dbname,
            user=user,
            password=password,
            connect_timeout=int(timeout_s),
        )
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            return {
                "ok": True,
                "driver": "psycopg2",
                "latency_ms": int((time.time() - start) * 1000),
            }
        finally:
            conn.close()
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "hint": "Install psycopg/psycopg2 for a full DB-level check, or rely on Prisma to validate connectivity.",
        }


def _mysql_driver_check(parsed, timeout_s: float) -> Dict[str, Any]:
    host = parsed.hostname
    port = parsed.port or 3306
    dbname = (parsed.path or "").lstrip("/") or None
    user = parsed.username
    password = unquote(parsed.password) if parsed.password else None

    start = time.time()

    try:
        import mysql.connector  # type: ignore

        conn = mysql.connector.connect(
            host=host,
            port=port,
            database=dbname,
            user=user,
            password=password,
            connection_timeout=int(timeout_s),
        )
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            return {
                "ok": True,
                "driver": "mysql.connector",
                "latency_ms": int((time.time() - start) * 1000),
            }
        finally:
            conn.close()
    except Exception:
        pass

    try:
        import pymysql  # type: ignore

        conn = pymysql.connect(
            host=host,
            port=port,
            db=dbname,
            user=user,
            password=password,
            connect_timeout=int(timeout_s),
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            return {
                "ok": True,
                "driver": "pymysql",
                "latency_ms": int((time.time() - start) * 1000),
            }
        finally:
            conn.close()
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "hint": "Install mysql-connector-python or PyMySQL for a full DB-level check, or rely on Prisma to validate connectivity.",
        }


def _render_markdown(result: CheckResult) -> str:
    lines = []
    lines.append("# DB Connection Check")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{result.timestamp_utc}`")
    lines.append(f"- Status: **{result.status}**")
    lines.append(f"- Check type: `{result.check_type}`")
    lines.append("")
    lines.append("## Connection summary (redacted)")
    lines.append(f"- URL: `{result.redacted_url}`")
    if result.host:
        lines.append(f"- Host: `{result.host}`")
    if result.port:
        lines.append(f"- Port: `{result.port}`")
    if result.database is not None:
        lines.append(f"- Database: `{result.database}`")
    if result.username is not None:
        lines.append(f"- User: `{result.username}`")
    lines.append("")
    lines.append("## Details")
    lines.append("```json")
    lines.append(json.dumps(result.details, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Notes")
    if result.status == "PARTIAL_PASS":
        lines.append("- Only network reachability was verified. To run a full DB-level check, install an appropriate driver or rely on the project's primary tooling (e.g., Prisma).")
    lines.append("- Do not store credentials in this file.")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="DB connection preflight check (dependency-light).")
    parser.add_argument("--url", default=os.getenv("DATABASE_URL"), help="Database URL (or set DATABASE_URL).")
    parser.add_argument("--out", default=None, help="Write output to a file (.md or .json).")
    parser.add_argument("--timeout", type=float, default=5.0, help="Timeout in seconds (default: 5).")
    args = parser.parse_args()

    if not args.url:
        print("ERROR: Missing --url and DATABASE_URL is not set.", file=sys.stderr)
        return 1

    url = args.url
    parsed = urlparse(url)
    scheme = parsed.scheme.split("+")[0].lower()

    timestamp = _now_utc_iso()
    redacted_url = _redact_db_url(url)

    host = parsed.hostname
    port = parsed.port or _default_port_for_scheme(scheme)
    dbname = (parsed.path or "").lstrip("/") or None
    username = parsed.username

    details: Dict[str, Any] = {}
    status = "FAIL"
    check_type = "tcp_only"

    try:
        if scheme.startswith("sqlite"):
            # urlparse for sqlite: path contains the file path; strip leading '/' carefully.
            # urlparse examples:
            # - sqlite:////tmp/test.db -> parsed.path == '//tmp/test.db' (absolute path)
            # - sqlite:///relative.db  -> parsed.path == '/relative.db'  (relative path)
            # - sqlite:///:memory:     -> parsed.path == '/:memory:'
            sqlite_path = parsed.path
            if sqlite_path.startswith("//"):
                # Absolute path: keep a single leading slash.
                sqlite_path = sqlite_path[1:]
            elif sqlite_path.startswith("/"):
                # Relative path or :memory:.
                sqlite_path = sqlite_path[1:]
            if not sqlite_path:
                raise ValueError("SQLite URL missing path")
            details = _sqlite_check(sqlite_path, args.timeout)
            status = "PASS" if details.get("ok") else "FAIL"
            check_type = "sqlite_full"
            host = None
            port = None
            dbname = sqlite_path
        elif scheme in {"postgres", "postgresql"}:
            driver_details = _postgres_driver_check(parsed, args.timeout)
            if driver_details.get("ok"):
                details = driver_details
                status = "PASS"
                check_type = "driver_full"
            else:
                # Fall back to TCP check.
                if not host or not port:
                    raise ValueError("PostgreSQL URL missing host/port")
                tcp = _tcp_reachability(host, int(port), args.timeout)
                details = {
                    "driver_check": driver_details,
                    "tcp_check": tcp,
                }
                if tcp.get("reachable"):
                    status = "PARTIAL_PASS"
                    check_type = "tcp_only"
                else:
                    status = "FAIL"
                    check_type = "tcp_only"
        elif scheme in {"mysql", "mariadb"}:
            driver_details = _mysql_driver_check(parsed, args.timeout)
            if driver_details.get("ok"):
                details = driver_details
                status = "PASS"
                check_type = "driver_full"
            else:
                if not host or not port:
                    raise ValueError("MySQL URL missing host/port")
                tcp = _tcp_reachability(host, int(port), args.timeout)
                details = {
                    "driver_check": driver_details,
                    "tcp_check": tcp,
                }
                if tcp.get("reachable"):
                    status = "PARTIAL_PASS"
                    check_type = "tcp_only"
                else:
                    status = "FAIL"
                    check_type = "tcp_only"
        else:
            details = {
                "ok": False,
                "error": f"Unsupported scheme: {scheme}",
                "supported": ["postgresql", "mysql", "sqlite"],
            }
            status = "FAIL"
            check_type = "unsupported"
    except Exception as e:  # noqa: BLE001
        details = {"ok": False, "error": str(e)}
        status = "FAIL"

    result = CheckResult(
        timestamp_utc=timestamp,
        scheme=scheme,
        host=host,
        port=int(port) if port else None,
        database=dbname,
        username=username,
        redacted_url=redacted_url,
        status=status,
        check_type=check_type,
        details=details,
    )

    output_bytes: str
    if args.out and args.out.lower().endswith(".json"):
        output_bytes = json.dumps(asdict(result), indent=2, sort_keys=True) + "\n"
    else:
        output_bytes = _render_markdown(result)

    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output_bytes)
    else:
        print(output_bytes)

    return 0 if status in {"PASS", "PARTIAL_PASS"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
