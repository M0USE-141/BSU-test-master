"""One-shot backfill: rewrite legacy rId*/inline-MathML payloads in place.

Idempotent. Run repeatedly without harm — already-migrated tests are skipped.

Usage:
    python scripts/backfill_materials.py            # all tests
    python scripts/backfill_materials.py --dry-run  # report-only
    python scripts/backfill_materials.py --test-id <uuid>
"""
from __future__ import annotations

import argparse
import hashlib
import io
import logging
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

log = logging.getLogger("backfill")


def _sha1_7(data: bytes) -> str:
    return hashlib.sha1(data, usedforsecurity=False).hexdigest()[:7]


def _is_legacy_image_src(src: str) -> bool:
    """rId* or any name whose stem isn't already <7-hex>."""
    name = PurePosixPath(src).name
    stem = PurePosixPath(name).stem
    return not (len(stem) == 7 and all(c in "0123456789abcdef" for c in stem))


def _classify_ext(name: str) -> str:
    suffix = PurePosixPath(name).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return suffix
    return ".png"  # safe default for unrecognized image suffixes


def _migrate_image(storage, test_uuid: str, old_src: str) -> str | None:
    """Returns the new short-id filename, or None if the legacy file is gone."""
    old_key = storage_keys.material_key(test_uuid, PurePosixPath(old_src).name)
    try:
        data = storage.get_object_bytes(old_key)
    except Exception as exc:
        log.warning("test=%s missing legacy %s: %s", test_uuid, old_key, exc)
        return None
    stem = _sha1_7(data)
    ext = _classify_ext(old_src)
    new_name = f"{stem}{ext}"
    new_key = storage_keys.material_key(test_uuid, new_name)
    if not storage.object_exists(new_key):
        storage.put_object(new_key, io.BytesIO(data),
                           content_type="application/octet-stream",
                           length=len(data))
    return new_name


def _migrate_formula(storage, test_uuid: str, mathml_xml: str) -> str:
    encoded = mathml_xml.encode("utf-8")
    stem = _sha1_7(encoded)
    key = storage_keys.material_key(test_uuid, f"{stem}.mml")
    if not storage.object_exists(key):
        storage.put_object(key, io.BytesIO(encoded),
                           content_type="application/xml",
                           length=len(encoded))
    return stem


def _walk_inlines(content_obj: dict, storage, test_uuid: str, stats: dict) -> bool:
    """Mutates inlines inside a content object {blocks: [...]}. Returns True if any change was made."""
    changed = False
    blocks = content_obj.get("blocks")
    if not isinstance(blocks, list):
        return False
    for block in blocks:
        for inl in block.get("inlines", []):
            t = inl.get("type")
            if t == "image":
                src = inl.get("src") or ""
                if not src or not _is_legacy_image_src(src):
                    continue
                new_name = _migrate_image(storage, test_uuid, src)
                if new_name is None:
                    stats["image_missing"] += 1
                    continue
                inl["src"] = new_name
                stats["image_renamed"] += 1
                changed = True
            elif t == "formula":
                if inl.get("id"):
                    continue
                xml = inl.get("mathml")
                if not xml:
                    continue
                stem = _migrate_formula(storage, test_uuid, xml)
                inl["id"] = stem
                inl.pop("mathml", None)
                stats["formula_extracted"] += 1
                changed = True
    return changed


def _walk_question_payload(payload: dict, storage, test_uuid: str, stats: dict) -> bool:
    """Question payload has keys: question/correct (content objects) +
    options[].content. Walk all of them."""
    changed = False
    for key in ("question", "correct"):
        sub = payload.get(key)
        if isinstance(sub, dict):
            if _walk_inlines(sub, storage, test_uuid, stats):
                changed = True
    for opt in payload.get("options", []):
        sub = opt.get("content")
        if isinstance(sub, dict):
            if _walk_inlines(sub, storage, test_uuid, stats):
                changed = True
    return changed


def run(only_test_id: str | None, dry_run: bool) -> int:
    storage = get_storage_backend()
    grand = {"tests_scanned": 0, "tests_updated": 0,
             "image_renamed": 0, "image_missing": 0,
             "formula_extracted": 0}

    # Fetch the UUID test_id values (not the int PK id).
    # TestCollection.test_id is the UUID string used in storage keys.
    with SessionLocal() as db:
        stmt = select(TestCollection.test_id)
        if only_test_id:
            stmt = stmt.where(TestCollection.test_id == only_test_id)
        test_uuids = [row[0] for row in db.execute(stmt).all()]

    for test_uuid in test_uuids:
        grand["tests_scanned"] += 1
        per = {"image_renamed": 0, "image_missing": 0, "formula_extracted": 0}
        with SessionLocal() as db:
            # Questions are linked via test_collection_id (int FK), so join
            # through TestCollection to filter by the UUID test_id.
            qs = list(db.execute(
                select(Question)
                .join(TestCollection, Question.test_collection_id == TestCollection.id)
                .where(TestCollection.test_id == test_uuid)
            ).scalars().all())
            test_changed = False
            for q in qs:
                if not isinstance(q.payload, dict):
                    continue
                if _walk_question_payload(q.payload, storage, test_uuid, per):
                    # SQLAlchemy needs an explicit signal that a JSON column
                    # mutated in place — re-assign to itself.
                    q.payload = dict(q.payload)
                    test_changed = True
            if test_changed and not dry_run:
                db.commit()
                grand["tests_updated"] += 1
        for k in ("image_renamed", "image_missing", "formula_extracted"):
            grand[k] += per[k]
        log.info("test=%s renamed=%d formula=%d missing=%d",
                 test_uuid, per["image_renamed"], per["formula_extracted"], per["image_missing"])

    print("---- summary ----")
    for k, v in grand.items():
        print(f"  {k}: {v}")
    if dry_run:
        print("DRY RUN — no DB writes.")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--test-id", default=None)
    args = p.parse_args()
    sys.exit(run(args.test_id, args.dry_run))
