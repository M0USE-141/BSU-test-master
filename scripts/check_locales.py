#!/usr/bin/env python3
"""
check_locales.py — Verify key parity across all locale files.

Exits 0 if all locales have identical key sets, 1 if there are drifts.
Also checks for duplicate keys within a single file.

Usage:
    python scripts/check_locales.py
    python scripts/check_locales.py --locales-dir static/locales
"""
import argparse
import json
import sys
from pathlib import Path


def load_and_check(path: Path) -> tuple[dict, list[str]]:
    """Load JSON file, detect duplicate keys, return (flat_dict, duplicate_keys)."""
    text = path.read_text(encoding="utf-8")
    duplicates: list[str] = []
    seen: dict[str, int] = {}

    # Use a custom object_pairs_hook to detect duplicates
    def pairs_hook(pairs: list) -> dict:
        result = {}
        for key, val in pairs:
            if key in seen:
                duplicates.append(key)
            seen[key] = seen.get(key, 0) + 1
            result[key] = val
        return result

    data = json.loads(text, object_pairs_hook=pairs_hook)
    return data, duplicates


def main() -> int:
    parser = argparse.ArgumentParser(description="Check locale file key parity.")
    parser.add_argument(
        "--locales-dir",
        default="static/locales",
        help="Directory containing locale JSON files (default: static/locales)",
    )
    parser.add_argument(
        "--reference",
        default="en.json",
        help="Reference locale file (default: en.json)",
    )
    args = parser.parse_args()

    locales_dir = Path(args.locales_dir)
    if not locales_dir.is_dir():
        print(f"ERROR: locales directory not found: {locales_dir}", file=sys.stderr)
        return 1

    locale_files = sorted(locales_dir.glob("*.json"))
    if not locale_files:
        print(f"ERROR: no .json files found in {locales_dir}", file=sys.stderr)
        return 1

    print(f"Checking {len(locale_files)} locale file(s): {[f.name for f in locale_files]}\n")

    all_data: dict[str, dict] = {}
    found_errors = False

    # ── Step 1: load each file + check for duplicates ───────────────────────
    for path in locale_files:
        data, dupes = load_and_check(path)
        all_data[path.name] = data
        if dupes:
            found_errors = True
            print(f"[DUPLICATE KEYS] {path.name}:")
            for key in dupes:
                print(f"  ⚠  '{key}' appears more than once")
            print()

    # ── Step 2: find reference key set ──────────────────────────────────────
    ref_name = args.reference
    if ref_name not in all_data:
        # Fall back to first file
        ref_name = locale_files[0].name

    ref_keys = set(all_data[ref_name].keys())
    print(f"Reference: {ref_name} ({len(ref_keys)} keys)\n")

    # ── Step 3: compare all other locales against reference ─────────────────
    for name, data in all_data.items():
        if name == ref_name:
            continue
        keys = set(data.keys())
        missing = ref_keys - keys
        extra = keys - ref_keys
        if missing or extra:
            found_errors = True
            print(f"[DRIFT] {name} vs {ref_name}:")
            for key in sorted(missing):
                print(f"  ✗  missing key: '{key}'")
            for key in sorted(extra):
                print(f"  +  extra key:   '{key}'")
            print()
        else:
            print(f"[OK] {name} — {len(keys)} keys, all match {ref_name}")

    print()
    if found_errors:
        print("FAIL: locale parity check failed (see issues above).")
        return 1
    else:
        print("PASS: all locale files have identical key sets.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
