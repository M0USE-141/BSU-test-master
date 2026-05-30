"""Audit the "materials live in S3" invariant against the LIVE DB + storage.

Read-only. Scans every `questions.payload` row and the materials objects in
the configured storage backend, asserting that:

  1. No formula inline carries inline content (`mathml`/`latex` keys) — refs
     are id-only. A formula with `id is None` is a WARN (XSLT-missing residual;
     `--strict` promotes it to FAIL).
  2. No `rId\\d+` tokens anywhere in the payload JSON.
  3. No `data:...;base64,` blobs anywhere in the payload JSON.
  4. No inline string (text/mathml/latex) exceeds MAX_INLINE_BYTES — long
     inline XML must be externalized to S3, never embedded.
  5. Every formula id and image src resolves to an existing material object.
     Formulas are probed as `<id>.mml` then `<id>.tex` (payload is id-only).
  6. Every referenced object's filename stem equals sha1[:7] of its bytes.
  7. Orphan materials (objects under the test's materials/ prefix that no
     payload references) are reported as WARN — never deleted.

Exit code: 1 if any FAIL was collected, else 0.

Usage:
    python scripts/audit_materials.py                 # all tests
    python scripts/audit_materials.py --test-id <uuid>
    python scripts/audit_materials.py --strict        # id-null formula => FAIL
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

# Ensure project root is on sys.path so `api.*` imports resolve when this
# script is run directly (not via `python -m`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from api.database import SessionLocal
from api.dependencies.storage import get_storage_backend
from api.models.db.question import Question
from api.models.db.test_collection import TestCollection
from api.services import storage_keys
from api.services.storage_keys import StorageKeyError
from api.services.storage_service import ObjectNotFoundError

SHORT_ID_LEN = 7
# Any inline string longer than this is treated as embedded content that
# should have been externalized to S3. 512 B comfortably fits real text runs
# while catching raw OMML/SVG/MathML/LaTeX blobs.
MAX_INLINE_BYTES = 512

R_ID_PATTERN = re.compile(r"rId\d+")
DATA_URI_PATTERN = re.compile(r"data:[^;\"']*;base64,")
LATEX_EXT = ".tex"
MATHML_EXTS = (".mml", ".xml", ".mathml")


def _sha1_7(data: bytes) -> str:
    return hashlib.sha1(data, usedforsecurity=False).hexdigest()[:SHORT_ID_LEN]


def _is_hash_stem(stem: str) -> bool:
    return len(stem) == SHORT_ID_LEN and all(c in "0123456789abcdef" for c in stem)


class Report:
    """Collects per-test FAIL/WARN lines and an overall exit decision."""

    def __init__(self) -> None:
        self.fails: list[str] = []
        self.warns: list[str] = []
        self.stats = {
            "tests": 0,
            "questions": 0,
            "formula_refs": 0,
            "image_refs": 0,
            "orphans": 0,
        }

    def fail(self, msg: str) -> None:
        self.fails.append(msg)

    def warn(self, msg: str) -> None:
        self.warns.append(msg)


def _iter_content_objects(payload: dict):
    """Yield every content object ({blocks: [...]}) in a question payload."""
    for key in ("question", "correct"):
        sub = payload.get(key)
        if isinstance(sub, dict):
            yield sub
    for opt in payload.get("options", []) or []:
        if isinstance(opt, dict):
            sub = opt.get("content")
            if isinstance(sub, dict):
                yield sub


def _scan_inlines(content_obj: dict, ctx: str, report: Report,
                  formula_ids: list[str], image_srcs: list[str], *, strict: bool) -> None:
    blocks = content_obj.get("blocks")
    if not isinstance(blocks, list):
        return
    for block in blocks:
        for inl in (block.get("inlines", []) or []):
            t = inl.get("type")
            # 4. Inline-size guard on any embedded string.
            for field in ("text", "mathml", "latex"):
                val = inl.get(field)
                if isinstance(val, str) and len(val.encode("utf-8")) > MAX_INLINE_BYTES:
                    report.fail(
                        f"{ctx}: inline '{field}' is {len(val.encode('utf-8'))} B "
                        f"(> {MAX_INLINE_BYTES}); must be externalized to S3"
                    )
            if t == "formula":
                # 1. No inline formula content.
                if "mathml" in inl:
                    report.fail(f"{ctx}: formula carries inline 'mathml' (must be id-only)")
                if "latex" in inl:
                    report.fail(f"{ctx}: formula carries inline 'latex' (must be id-only)")
                fid = inl.get("id")
                if fid:
                    formula_ids.append(fid)
                    report.stats["formula_refs"] += 1
                else:
                    msg = f"{ctx}: formula has no id (no MathML externalized)"
                    if strict:
                        report.fail(msg)
                    else:
                        report.warn(msg)
            elif t == "image":
                src = inl.get("src")
                if src:
                    image_srcs.append(src)
                    report.stats["image_refs"] += 1


def _check_object(storage, test_uuid: str, filename: str, stem: str,
                  ctx: str, report: Report) -> bool:
    """Assert the object exists and its stem == sha1[:7] of bytes. Returns True if OK."""
    try:
        key = storage_keys.material_key(test_uuid, filename)
    except StorageKeyError as exc:
        report.fail(f"{ctx}: bad material filename {filename!r}: {exc}")
        return False
    try:
        data = storage.get_object_bytes(key)
    except ObjectNotFoundError:
        return False
    except Exception as exc:  # noqa: BLE001
        report.fail(f"{ctx}: error reading {key}: {exc}")
        return False
    actual = _sha1_7(data)
    if actual != stem:
        report.fail(f"{ctx}: {filename} stem != sha1[:7] of bytes (got {actual})")
    return True


def audit_test(db, storage, test_uuid: str, report: Report, *, strict: bool) -> None:
    report.stats["tests"] += 1
    formula_ids: list[str] = []
    image_srcs: list[str] = []

    qs = list(db.execute(
        select(Question)
        .join(TestCollection, Question.test_collection_id == TestCollection.id)
        .where(TestCollection.test_id == test_uuid)
    ).scalars().all())

    for q in qs:
        report.stats["questions"] += 1
        payload = q.payload
        if not isinstance(payload, dict):
            report.warn(f"test={test_uuid} q={q.id}: payload is not a dict; skipped")
            continue
        ctx = f"test={test_uuid} q={q.id}"
        # 2 + 3: whole-payload regex scans.
        payload_json = json.dumps(payload, ensure_ascii=False)
        for hit in set(R_ID_PATTERN.findall(payload_json)):
            report.fail(f"{ctx}: payload still references {hit}")
        if DATA_URI_PATTERN.search(payload_json):
            report.fail(f"{ctx}: payload contains a data:...;base64, blob")
        for content_obj in _iter_content_objects(payload):
            _scan_inlines(content_obj, ctx, report, formula_ids, image_srcs, strict=strict)

    referenced_names: set[str] = set()

    # 5 + 6: image refs resolve and hash-match.
    for src in image_srcs:
        name = PurePosixPath(src).name
        stem = PurePosixPath(name).stem
        ctx = f"test={test_uuid} image={src}"
        if not _is_hash_stem(stem):
            report.fail(f"{ctx}: src stem is not sha1[:7]")
            continue
        if not _check_object(storage, test_uuid, name, stem, ctx, report):
            report.fail(f"{ctx}: referenced image object missing in storage")
            continue
        referenced_names.add(name)

    # 5 + 6: formula refs resolve (probe .mml then .tex) and hash-match.
    for fid in formula_ids:
        ctx = f"test={test_uuid} formula={fid}"
        if not _is_hash_stem(fid):
            report.fail(f"{ctx}: formula id is not sha1[:7]")
            continue
        resolved_name = None
        for ext in (*MATHML_EXTS, LATEX_EXT):
            name = f"{fid}{ext}"
            try:
                key = storage_keys.material_key(test_uuid, name)
            except StorageKeyError:
                continue
            if storage.object_exists(key):
                resolved_name = name
                break
        if resolved_name is None:
            report.fail(f"{ctx}: no .mml/.tex material object found")
            continue
        _check_object(storage, test_uuid, resolved_name, fid, ctx, report)
        referenced_names.add(resolved_name)

    # 7: orphan detection (WARN only).
    try:
        prefix = storage_keys.materials_prefix(test_uuid)
    except StorageKeyError:
        return
    for key in storage.list_prefix(prefix):
        name = key.rsplit("/", 1)[-1]
        if not name:
            continue
        if name not in referenced_names:
            report.stats["orphans"] += 1
            report.warn(f"test={test_uuid}: orphan material {name} (no payload reference)")


def run(only_test_id: str | None, *, strict: bool) -> int:
    storage = get_storage_backend()
    report = Report()

    with SessionLocal() as db:
        stmt = select(TestCollection.test_id)
        if only_test_id:
            stmt = stmt.where(TestCollection.test_id == only_test_id)
        test_uuids = [row[0] for row in db.execute(stmt).all()]

    with SessionLocal() as db:
        for test_uuid in test_uuids:
            audit_test(db, storage, test_uuid, report, strict=strict)

    print("---- materials audit ----")
    for k, v in report.stats.items():
        print(f"  {k}: {v}")
    for w in report.warns:
        print(f"[WARN] {w}")
    for f in report.fails:
        print(f"[FAIL] {f}")

    if report.fails:
        print(f"FAILED — {len(report.fails)} violation(s)")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--test-id", default=None)
    p.add_argument("--strict", action="store_true",
                   help="treat id-null formulas as failures")
    args = p.parse_args()
    sys.exit(run(args.test_id, strict=args.strict))
