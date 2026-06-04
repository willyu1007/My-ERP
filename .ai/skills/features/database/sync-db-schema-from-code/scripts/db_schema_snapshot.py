#!/usr/bin/env python3
"""Schema snapshot utility.

This script is designed to be safe (read-only) and dependency-light.

- SQLite: fully supported via Python stdlib (sqlite3) and PRAGMA introspection.
- PostgreSQL/MySQL: not implemented in the stdlib. If you need a snapshot for those engines,
  prefer Prisma/Alembic tooling or extend this script with a driver in your environment.

Output:
- JSON by default (machine-readable)
- If --out ends with .md, writes a concise markdown summary and embeds the JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse


def _now_utc_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sqlite_path_from_url(url: str) -> str:
    parsed = urlparse(url)
    sqlite_path = parsed.path
    if sqlite_path.startswith("//"):
        # Absolute path: keep a single leading slash.
        sqlite_path = sqlite_path[1:]
    elif sqlite_path.startswith("/"):
        # Relative path or :memory:.
        sqlite_path = sqlite_path[1:]
    if not sqlite_path:
        raise ValueError("SQLite URL missing path")
    return sqlite_path


def _sqlite_list_tables(conn: sqlite3.Connection) -> List[Tuple[str, str]]:
    cur = conn.cursor()
    cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return [(row[0], row[1] or "") for row in cur.fetchall()]


def _sqlite_table_info(conn: sqlite3.Connection, table: str) -> Dict[str, Any]:
    cur = conn.cursor()

    # Columns
    cur.execute(f"PRAGMA table_info('{table}')")
    columns = []
    for cid, name, col_type, notnull, dflt_value, pk in cur.fetchall():
        columns.append(
            {
                "name": name,
                "type": col_type,
                "not_null": bool(notnull),
                "default": dflt_value,
                "primary_key": bool(pk),
            }
        )

    # Indexes
    cur.execute(f"PRAGMA index_list('{table}')")
    indexes = []
    for seq, idx_name, unique, origin, partial in cur.fetchall():
        cur.execute(f"PRAGMA index_info('{idx_name}')")
        idx_cols = [r[2] for r in cur.fetchall()]
        indexes.append(
            {
                "name": idx_name,
                "unique": bool(unique),
                "origin": origin,
                "partial": bool(partial),
                "columns": idx_cols,
            }
        )

    # Foreign keys
    cur.execute(f"PRAGMA foreign_key_list('{table}')")
    foreign_keys = []
    for (
        _id,
        seq,
        ref_table,
        from_col,
        to_col,
        on_update,
        on_delete,
        match,
    ) in cur.fetchall():
        foreign_keys.append(
            {
                "seq": seq,
                "ref_table": ref_table,
                "from": from_col,
                "to": to_col,
                "on_update": on_update,
                "on_delete": on_delete,
                "match": match,
            }
        )

    return {
        "columns": columns,
        "indexes": indexes,
        "foreign_keys": foreign_keys,
    }


def _render_markdown(snapshot: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Schema Snapshot")
    lines.append("")
    lines.append(f"- Timestamp (UTC): `{snapshot.get('timestamp_utc')}`")
    lines.append(f"- DB type: `{snapshot.get('db_type')}`")
    lines.append(f"- Database: `{snapshot.get('database')}`")
    lines.append("")

    tables: Dict[str, Any] = snapshot.get("tables", {})
    lines.append("## Tables")
    if not tables:
        lines.append("- (no tables found)")
    else:
        for tname, tinfo in tables.items():
            lines.append(f"### `{tname}`")
            cols = tinfo.get("columns", [])
            if cols:
                lines.append("| Column | Type | Not null | PK | Default |")
                lines.append("|---|---|---:|---:|---|")
                for c in cols:
                    lines.append(
                        f"| `{c.get('name')}` | `{c.get('type')}` | {str(bool(c.get('not_null'))).lower()} | {str(bool(c.get('primary_key'))).lower()} | `{c.get('default')}` |"
                    )
            else:
                lines.append("- (no columns)")
            lines.append("")

    lines.append("## Raw JSON")
    lines.append("```json")
    lines.append(json.dumps(snapshot, indent=2, sort_keys=True))
    lines.append("```")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only schema snapshot (SQLite fully supported).")
    parser.add_argument("--url", default=os.getenv("DATABASE_URL"), help="Database URL (or set DATABASE_URL).")
    parser.add_argument("--out", default=None, help="Write output to a file (.json or .md).")
    parser.add_argument(
        "--include-sql",
        action="store_true",
        help="Include CREATE TABLE SQL in the JSON snapshot (SQLite only).",
    )
    args = parser.parse_args()

    if not args.url:
        print("ERROR: Missing --url and DATABASE_URL is not set.", file=sys.stderr)
        return 1

    url = args.url
    parsed = urlparse(url)
    scheme = parsed.scheme.split("+")[0].lower()

    if not scheme.startswith("sqlite"):
        msg = {
            "timestamp_utc": _now_utc_iso(),
            "db_type": scheme,
            "status": "FAIL",
            "error": "Only SQLite snapshots are supported by this dependency-light script.",
            "hint": "Use Prisma migrate diff / migrate status (Prisma) or Alembic tooling, or extend this script with a DB driver in your environment.",
        }
        output = json.dumps(msg, indent=2, sort_keys=True) + "\n"
        if args.out:
            os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(output)
        else:
            print(output)
        return 1

    try:
        sqlite_path = _sqlite_path_from_url(url)
        conn = sqlite3.connect(sqlite_path)
        try:
            tables_list = _sqlite_list_tables(conn)
            tables: Dict[str, Any] = {}
            for tname, create_sql in tables_list:
                info = _sqlite_table_info(conn, tname)
                if args.include_sql:
                    info["create_sql"] = create_sql
                tables[tname] = info

            snapshot: Dict[str, Any] = {
                "timestamp_utc": _now_utc_iso(),
                "db_type": "sqlite",
                "database": sqlite_path,
                "tables": tables,
            }
        finally:
            conn.close()

        if args.out and args.out.lower().endswith(".md"):
            output = _render_markdown(snapshot)
        else:
            output = json.dumps(snapshot, indent=2, sort_keys=True) + "\n"

        if args.out:
            os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(output)
        else:
            print(output)

        return 0
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
