# Materials Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **UPDATE (post-greenfield):** Task 7 (backfill) is DROPPED. The project is
> greenfield and data is reset rather than migrated, so `scripts/backfill_materials.py`
> was deleted. Its read-only DB/storage walker logic was repurposed into
> `scripts/audit_materials.py`, which verifies the "materials live in S3, payload
> is id-only" invariant against the live DB + storage (no mutation). Formulas are
> now ALWAYS id-only (inline `mathml`/`latex` fallback removed from
> `core/serialization.py`); LaTeX `.tex` uploads are accepted as materials.

**Goal:** Привести материалы импортированных из .docx тестов к тому же контракту, что и материалы, загруженные через UI: один формат ID (sha1[:7] от содержимого), формулы как отдельные файлы в `materials/`, без дублей формул из `mc:AlternateContent`.

**Architecture:** Все изменения локализованы в pipeline'е импорта — `core/word_extract.py` (извлечение + наименование) и `core/serialization.py` (как `formula_id` попадает в payload). Никаких изменений в API-роутах, frontend'е или схеме БД: формат payload (`{type:'image', src:'<filename>'}` и `{type:'formula', mathml:'<xml>'}` / `{type:'formula', id:'<hash>'}`) уже совместим с тем, что нужно. Дополнительно — одноразовый backfill-скрипт для уже импортированных тестов.

**Tech Stack:** Python 3.13, lxml, python-docx, SQLAlchemy 2.0, FastAPI, StorageBackend Protocol (LocalStorage / S3StorageBackend).

---

## File Structure

**Modify:**
- `core/word_extract.py` — rewrite `_extract_images` to use content-hash filenames; add `_omml_to_material` that hashes MathML and writes a `.mml` file; rewrite `_content_from_cell` to look inside `mc:AlternateContent` for `oMath` before treating its `v:imagedata` as an image.
- `core/serialization.py` — when `formula_id` is set, emit only `{type:'formula', id}` (no `mathml` inline). When only `formula_text` is set, keep current behavior.
- `core/models.py` — no change (existing `ContentItem.formula_id` field is already used by serializer).

**Create:**
- `scripts/test_word_extract_unification.py` — standalone verification script (project convention: `scripts/test_*.py`, NOT pytest).
- `scripts/backfill_materials.py` — one-shot script that walks all questions in the DB, rewrites `rId*` image refs and inline-MathML to short-id refs, mirrors content to storage.

**No changes:**
- API routes (`api/routes/assets.py`, `api/routes/tests.py`).
- Frontend (`static/js/components/materials-panel.js` already handles formulas via the `formula` filter chip — it just needs files to actually appear in storage).
- Storage key validation (`storage_keys._SAFE_FILENAME_RE` already accepts both `rId7.png` and `abc1234.mml`).
- DB schema.

---

## Conventions for this project

- **No pytest.** Project explicitly has no test suite (`CLAUDE.md`: «Тестов pytest нет»). Verification scripts live in `scripts/test_*.py` and are run manually with `python scripts/test_*.py`. Each script `assert`s and prints `OK` / `FAIL`.
- **Smoke validation** for end-to-end is described in the final task and follows the same structure as existing `scripts/attempts_smoke.md`.
- **Commits are small.** One logical change per commit.

---

### Task 1: Add content-hash helpers to `core/word_extract.py`

**Files:**
- Modify: `core/word_extract.py:1-23` (imports block)
- Modify: `core/word_extract.py` (add private helpers below `_load_omml_xslt`)

- [ ] **Step 1: Add `hashlib` import**

Open `core/word_extract.py`. After line 5 (`from pathlib import Path`) the imports block ends with `from lxml import etree` (line 9). Add `import hashlib` after `import shutil`:

```python
from __future__ import annotations

import hashlib
import logging
import os
import shutil
from pathlib import Path

from docx import Document
from lxml import etree
```

- [ ] **Step 2: Add `_short_id_for_bytes` helper**

At module scope (right above the `class WordTestExtractor:` line, around line 25), add:

```python
def _short_id_for_bytes(data: bytes) -> str:
    """First 7 hex chars of sha1 — same scheme as `api/routes/assets.py`.

    Two callers must agree on this: the upload route uses sha1[:7] for
    manually uploaded materials; we use the same here so docx-extracted
    assets dedupe against manual uploads.
    """
    return hashlib.sha1(data).hexdigest()[:7]
```

- [ ] **Step 3: Write a quick check that the helper agrees with `assets.py`**

Open `api/routes/assets.py` and locate `_short_id_for`. Confirm it is `hashlib.sha1(data).hexdigest()[:7]`. If it differs, prefer the existing form and update step 2 accordingly.

- [ ] **Step 4: Commit**

```bash
git add core/word_extract.py
git commit -m "feat(import): add sha1[:7] helper for content-hash filenames"
```

---

### Task 2: Rewrite `_extract_images` to use content-hash filenames

**Files:**
- Modify: `core/word_extract.py:55-69`

- [ ] **Step 1: Replace the function body**

Find the existing `_extract_images` at lines 55-69 and replace with:

```python
    def _extract_images(self, doc: Document) -> dict[str, Path]:
        """Extract embedded images.

        Returns a map ``rel_id → on-disk Path`` where the filename is
        ``<sha1[:7]><ext>`` (lowercased ext). Two .docx relationships that
        point to the same bytes converge to the same Path → automatic
        dedup. The rel_id stays as the map key because the rest of the
        extractor still references images via Word's internal rel ids
        when walking runs.
        """
        image_map: dict[str, Path] = {}
        count = 0
        for rel_id, part in doc.part.related_parts.items():
            if "image" not in part.content_type:
                continue
            ext = Path(part.partname).suffix.lower()
            blob = part.blob
            stem = _short_id_for_bytes(blob)
            image_path = self.extract_dir / f"{stem}{ext}"
            if not image_path.exists():
                image_path.write_bytes(blob)
            converted_path = convert_metafile_to_png(image_path, self.extract_dir)
            if converted_path is not None and converted_path != image_path:
                # WMF/EMF → PNG yields a sibling file; re-name it under the
                # same sha1[:7] stem so the filename still encodes content.
                new_path = self.extract_dir / f"{stem}.png"
                if converted_path != new_path:
                    converted_path.replace(new_path)
                image_path = new_path
            else:
                image_path = converted_path or image_path
            image_map[rel_id] = image_path
            count += 1
        log.info("Extracted embedded images: %d", count)
        self.logs.append(f"Изображений извлечено: {count}")
        return image_map
```

- [ ] **Step 2: Sanity-check call sites are untouched**

Run:

```powershell
Select-String -Path 'core\word_extract.py','api\services\import_service.py' -Pattern '_extract_images|image_map'
```

Expected: `image_map` still threaded through `_content_from_cell` unchanged; `_extract_images` only called from `extract()`. No external code depends on filename format.

- [ ] **Step 3: Commit**

```bash
git add core/word_extract.py
git commit -m "feat(import): rename extracted images to <sha1[:7]>.<ext>"
```

---

### Task 3: Extract formulas to `materials/` files instead of inlining

**Files:**
- Modify: `core/word_extract.py` (`_omml_to_mathml`, `_content_from_cell`)

- [ ] **Step 1: Add `_register_formula` helper above `_omml_to_mathml`**

Locate `_load_omml_xslt` (lines 71-106). Right after it, add a new helper (it will be called from the new logic in `_content_from_cell`):

```python
    def _register_formula(self, mathml_text: str | None) -> tuple[str | None, str | None]:
        """Persist a MathML XML string to the assets dir, keyed by content hash.

        Returns ``(formula_id, mathml_text)``:
          - ``formula_id`` — 7-char sha1 stem; written to ``<id>.mml`` on disk.
          - ``mathml_text`` — original XML, returned for callers that still
            want to embed it as a fallback (legacy behavior; new payload
            will prefer the id).
        For invalid / empty mathml returns ``(None, None)``.
        """
        if not mathml_text:
            return None, None
        encoded = mathml_text.encode("utf-8")
        stem = _short_id_for_bytes(encoded)
        path = self.extract_dir / f"{stem}.mml"
        if not path.exists():
            path.write_bytes(encoded)
        return stem, mathml_text
```

- [ ] **Step 2: Update `push_formula` inside `_content_from_cell` to record an id**

Find `_content_from_cell` at line 121. Locate `push_formula` (lines 139-148):

```python
        def push_formula(formula_text: str | None):
            flush_text()
            items.append(
                ContentItem(
                    "formula",
                    formula_id=None,
                    path=None,
                    formula_text=formula_text,
                )
            )
```

Replace with:

```python
        def push_formula(formula_text: str | None):
            flush_text()
            formula_id, _ = self._register_formula(formula_text)
            items.append(
                ContentItem(
                    "formula",
                    formula_id=formula_id,
                    path=None,
                    # Keep formula_text only when registration failed (no
                    # MathML — e.g. OMML XSLT missing). In the normal path
                    # the serializer will emit just `id` and the renderer
                    # will fetch the .mml via the materials endpoint.
                    formula_text=formula_text if formula_id is None else None,
                )
            )
```

- [ ] **Step 3: Commit**

```bash
git add core/word_extract.py
git commit -m "feat(import): mirror docx formulas to materials/<sha1[:7]>.mml"
```

---

### Task 4: Look inside `mc:AlternateContent` for `oMath` before treating fallbacks as images

**Files:**
- Modify: `core/word_extract.py:16-23` (NS dict), `core/word_extract.py:156-205` (run-iteration loop in `_content_from_cell`)

- [ ] **Step 1: Add the `mc` namespace**

In the `NS = { ... }` dict at lines 16-23 add the markup-compatibility namespace:

```python
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}
```

- [ ] **Step 2: Refactor the run branch in `_content_from_cell`**

Find the block that starts with `# runs/hyperlinks` (around line 170) and ends with the OLE object marker (around line 204). Replace with:

```python
                # runs/hyperlinks
                if tag.endswith("}r") or tag.endswith("}hyperlink"):
                    # If this run wraps an mc:AlternateContent with a Choice
                    # that contains an oMath, prefer the formula and skip the
                    # Fallback image — those are the rasterized previews Word
                    # ships for older readers. Without this guard each formula
                    # would appear twice (once as ContentItem("formula",...)
                    # and once as a 30x12px PNG via v:imagedata).
                    formula_from_choice = child.find(
                        ".//mc:AlternateContent/mc:Choice//m:oMath", namespaces=NS
                    )
                    if formula_from_choice is not None:
                        push_formula(self._omml_to_mathml(formula_from_choice))
                        continue

                    # text
                    for t in child.findall(".//w:t", namespaces=NS):
                        if t.text:
                            text_buf.append(t.text)

                    # line breaks
                    for br in child.findall(".//w:br", namespaces=NS):
                        flush_text()
                        items.append(ContentItem("line_break"))

                    for cr in child.findall(".//w:cr", namespaces=NS):
                        flush_text()
                        items.append(ContentItem("line_break"))

                    # DrawingML images
                    for blip in child.findall(".//a:blip", namespaces=NS):
                        rid = blip.get(f"{{{NS['r']}}}embed")
                        if rid and rid in image_map:
                            push_image(image_map[rid])

                    # VML images (old equation previews)
                    for imdata in child.findall(".//v:imagedata", namespaces=NS):
                        rid = imdata.get(f"{{{NS['r']}}}id") or imdata.get(f"{{{NS['r']}}}embed")
                        if rid and rid in image_map:
                            push_image(image_map[rid])
                        else:
                            flush_text()
                            items.append(ContentItem("text", formula_placeholder))

                    # explicit OLE object marker
                    if child.find(".//o:OLEObject", namespaces=NS) is not None:
                        flush_text()
                        items.append(ContentItem("text", formula_placeholder))
```

The only semantic change is the new `formula_from_choice` early-exit at the top. Everything below stays the same.

- [ ] **Step 3: Commit**

```bash
git add core/word_extract.py
git commit -m "fix(import): prefer mc:Choice oMath over Fallback bitmap"
```

---

### Task 5: Teach the serializer to prefer `formula_id` over inline MathML

**Files:**
- Modify: `core/serialization.py:67-78`

- [ ] **Step 1: Replace the formula branch in `content_items_to_blocks`**

Find:

```python
        if item.item_type == "formula":
            inline: dict[str, Any] = {
                "type": INLINE_FORMULA_TYPE,
                "id": item.formula_id,
            }
            if item.formula_text:
                if _is_mathml(item.formula_text):
                    inline["mathml"] = item.formula_text
                else:
                    inline["latex"] = item.formula_text
            inlines.append(inline)
            continue
```

Replace with:

```python
        if item.item_type == "formula":
            inline: dict[str, Any] = {
                "type": INLINE_FORMULA_TYPE,
                "id": item.formula_id,
            }
            # Prefer referenced form. When `formula_id` is set, the extractor
            # already mirrored the MathML to `<id>.mml` in materials/, so
            # the frontend resolves it through the materials map. Only fall
            # back to inline `mathml`/`latex` when there's no id (e.g. OMML
            # XSLT missing → we got raw text we couldn't classify).
            if item.formula_id:
                pass
            elif item.formula_text:
                if _is_mathml(item.formula_text):
                    inline["mathml"] = item.formula_text
                else:
                    inline["latex"] = item.formula_text
            inlines.append(inline)
            continue
```

- [ ] **Step 2: Commit**

```bash
git add core/serialization.py
git commit -m "feat(serialize): emit formula id-only when material exists"
```

---

### Task 6: End-to-end verification script

**Files:**
- Create: `scripts/test_word_extract_unification.py`

- [ ] **Step 1: Write the verification script**

Create `scripts/test_word_extract_unification.py`:

```python
"""Manual verification for Task 1-5: docx → unified materials.

Run:
    python scripts/test_word_extract_unification.py path/to/fixture.docx

What it asserts:
  - Every image file in the assets dir is named <sha1[:7]>.<ext>.
  - Every formula in the payload has a non-null `id` and NO inline `mathml`
    (unless OMML XSLT is missing on this host — script will warn, not fail).
  - For every formula id, a matching `<id>.mml` exists in the assets dir.
  - All `<sha1[:7]>` stems actually equal sha1[:7] of the file bytes.
  - No `rId\\d+` substring appears anywhere in the payload JSON.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

from core.serialization import serialize_test_payload
from core.word_extract import WordTestExtractor

R_ID_PATTERN = re.compile(r"rId\d+")


def _sha1_7(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:7]


def main(docx_path: Path) -> int:
    assert docx_path.exists(), f"fixture not found: {docx_path}"
    workdir = Path(tempfile.mkdtemp(prefix="materials_unification_"))
    assets = workdir / "assets"
    assets.mkdir()
    print(f"[INFO] extracting {docx_path.name} → {assets}")

    extractor = WordTestExtractor(docx_path, symbol="*", log_small_tables=False,
                                  image_output_dir=assets)
    questions = extractor.extract()
    test_id = "11111111-1111-1111-1111-111111111111"
    payload = serialize_test_payload(test_id, docx_path.stem, questions, assets)

    payload_json = json.dumps(payload, ensure_ascii=False)
    errors: list[str] = []
    warnings: list[str] = []

    # 1. No rId\d+ in payload
    rid_hits = R_ID_PATTERN.findall(payload_json)
    if rid_hits:
        errors.append(f"payload still references {len(rid_hits)} rId* tokens: {set(rid_hits)}")

    # 2. Every asset filename is <sha1[:7]>.<ext>
    for f in sorted(assets.iterdir()):
        if not f.is_file():
            continue
        stem = f.stem
        if len(stem) != 7 or not all(c in "0123456789abcdef" for c in stem):
            errors.append(f"asset {f.name} has non-hash stem")
            continue
        expected = _sha1_7(f.read_bytes())
        if stem != expected:
            errors.append(f"asset {f.name} stem != sha1[:7] of bytes (got {expected})")

    # 3. Every formula in payload has an id, and a matching .mml in assets
    formula_ids: list[str] = []
    inline_only_count = 0
    for q in payload["questions"]:
        for block in q["question"]["blocks"]:
            for inl in block.get("inlines", []):
                if inl.get("type") != "formula":
                    continue
                fid = inl.get("id")
                if fid:
                    formula_ids.append(fid)
                    mml_path = assets / f"{fid}.mml"
                    if not mml_path.exists():
                        errors.append(f"formula id={fid} has no {mml_path.name}")
                else:
                    inline_only_count += 1
    if inline_only_count:
        warnings.append(
            f"{inline_only_count} formulas have no id "
            "(likely OMML XSLT unavailable on this host — Inkscape OK, but no Office or core/omml2mml.xsl)"
        )

    print(f"[INFO] questions: {len(questions)}")
    print(f"[INFO] image assets: {sum(1 for f in assets.iterdir() if f.suffix.lower() != '.mml')}")
    print(f"[INFO] formula assets: {sum(1 for f in assets.iterdir() if f.suffix.lower() == '.mml')}")
    print(f"[INFO] formula refs in payload: {len(formula_ids)}")
    for w in warnings:
        print(f"[WARN] {w}")
    for e in errors:
        print(f"[FAIL] {e}")

    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python scripts/test_word_extract_unification.py <fixture.docx>")
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1])))
```

- [ ] **Step 2: Run against a real .docx**

```powershell
python scripts/test_word_extract_unification.py path\to\real_test.docx
```

Expected: prints `OK`. If `[FAIL]` lines appear, fix whichever task they trace back to before continuing.

- [ ] **Step 3: Commit**

```bash
git add scripts/test_word_extract_unification.py
git commit -m "test(import): standalone verification for unified materials"
```

---

### Task 7: Backfill script for already-imported tests

**Files:**
- Create: `scripts/backfill_materials.py`

- [ ] **Step 1: Write the backfill**

This script walks `questions.payload` for every test, replaces `rId*` image refs with content-hash filenames (pulling bytes from R2/local storage), extracts inline MathML into `.mml` files, rewrites references in payload, commits per-test in its own transaction so a single bad test can't poison the rest.

Create `scripts/backfill_materials.py`:

```python
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
from pathlib import PurePosixPath

from sqlalchemy import select

from api.database import SessionLocal
from api.dependencies.storage import get_storage_backend
from api.models.db.question import Question
from api.models.db.test_collection import TestCollection
from api.services import storage_keys

log = logging.getLogger("backfill")


def _sha1_7(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:7]


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


def _migrate_image(storage, test_id: str, old_src: str) -> str | None:
    """Returns the new short-id filename, or None if the legacy file is gone."""
    old_key = storage_keys.material_key(test_id, PurePosixPath(old_src).name)
    try:
        data = storage.get_object_bytes(old_key)
    except Exception as exc:
        log.warning("test=%s missing legacy %s: %s", test_id, old_key, exc)
        return None
    stem = _sha1_7(data)
    ext = _classify_ext(old_src)
    new_name = f"{stem}{ext}"
    new_key = storage_keys.material_key(test_id, new_name)
    if not storage.object_exists(new_key):
        storage.put_object(new_key, io.BytesIO(data),
                           content_type="application/octet-stream",
                           length=len(data))
    return new_name


def _migrate_formula(storage, test_id: str, mathml_xml: str) -> str:
    encoded = mathml_xml.encode("utf-8")
    stem = _sha1_7(encoded)
    key = storage_keys.material_key(test_id, f"{stem}.mml")
    if not storage.object_exists(key):
        storage.put_object(key, io.BytesIO(encoded),
                           content_type="application/xml",
                           length=len(encoded))
    return stem


def _walk_inlines(payload: dict, storage, test_id: str, stats: dict) -> bool:
    """Mutates `payload` in place. Returns True if any change was made."""
    changed = False
    blocks_paths = []
    if isinstance(payload.get("blocks"), list):
        blocks_paths.append(payload["blocks"])
    for block_list in blocks_paths:
        for block in block_list:
            for inl in block.get("inlines", []):
                t = inl.get("type")
                if t == "image":
                    src = inl.get("src") or ""
                    if not src or not _is_legacy_image_src(src):
                        continue
                    new_name = _migrate_image(storage, test_id, src)
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
                    stem = _migrate_formula(storage, test_id, xml)
                    inl["id"] = stem
                    inl.pop("mathml", None)
                    stats["formula_extracted"] += 1
                    changed = True
    return changed


def _walk_question_payload(payload: dict, storage, test_id: str, stats: dict) -> bool:
    """Question payload has keys: question/correct (content objects) +
    options[].content. Walk all of them."""
    changed = False
    for key in ("question", "correct"):
        sub = payload.get(key)
        if isinstance(sub, dict):
            if _walk_inlines(sub, storage, test_id, stats):
                changed = True
    for opt in payload.get("options", []):
        sub = opt.get("content")
        if isinstance(sub, dict):
            if _walk_inlines(sub, storage, test_id, stats):
                changed = True
    return changed


def run(only_test_id: str | None, dry_run: bool) -> int:
    storage = get_storage_backend()
    grand = {"tests_scanned": 0, "tests_updated": 0,
             "image_renamed": 0, "image_missing": 0,
             "formula_extracted": 0}
    with SessionLocal() as db:
        stmt = select(TestCollection.id)
        if only_test_id:
            stmt = stmt.where(TestCollection.id == only_test_id)
        test_ids = [row[0] for row in db.execute(stmt).all()]

    for test_id in test_ids:
        grand["tests_scanned"] += 1
        per = {"image_renamed": 0, "image_missing": 0, "formula_extracted": 0}
        with SessionLocal() as db:
            qs = list(db.execute(
                select(Question).where(Question.test_id == test_id)
            ).scalars().all())
            test_changed = False
            for q in qs:
                if not isinstance(q.payload, dict):
                    continue
                if _walk_question_payload(q.payload, storage, test_id, per):
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
                 test_id, per["image_renamed"], per["formula_extracted"], per["image_missing"])

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
```

- [ ] **Step 2: Run dry-run against staging/dev**

```powershell
$env:DATABASE_URL='...staging url...'
$env:STORAGE_BACKEND='s3'
$env:S3_ENDPOINT='...'
# ...rest of staging .env
python scripts/backfill_materials.py --dry-run
```

Expected output: a summary block listing how many images/formulas would be migrated. **DO NOT** run without `--dry-run` until the report matches expectations on at least one test.

- [ ] **Step 3: Run for real on one test, then all**

```powershell
python scripts/backfill_materials.py --test-id <one-test-uuid>
# verify via UI that materials panel shows the migrated content correctly
python scripts/backfill_materials.py
```

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill_materials.py
git commit -m "chore(import): one-shot backfill for legacy materials"
```

---

### Task 8: Manual smoke verification

**Files:** none (UI check).

- [ ] **Step 1: Re-import a real .docx with images + formulas**

In the running app (dev or Railway):
1. Sign in.
2. Open Import wizard → upload a docx that contains both inline-equation `oMath` cells and a couple of embedded images.
3. Wait for the import job to reach `done`.
4. Open the created test → edit a question.

- [ ] **Step 2: Verify Materials Panel**

Open Materials Panel from the question editor (📚 button).

Expected:
- The «формулы» chip count > 0 (was 0 before).
- The «картинки» chip count matches the number of unique images in the docx (was rId-based name).
- Each card's ID is a 7-char hex string (e.g. `a3f1c92`), NOT `rId7`.
- Clicking «Вставить» on a formula puts `[[mathml:a3f1c92]]` into the editor, and the preview typesets it.
- Clicking «Вставить» on an image puts `[[img:a3f1c92]]` into the editor, and the preview shows the bitmap.

- [ ] **Step 3: Verify no double-formula bitmaps**

In the docx, find a formula that previously appeared as both a typeset formula and a tiny PNG. After re-import, the question should contain ONLY the formula, not a duplicate image. (Check by opening the question edit screen and reading the textarea content.)

- [ ] **Step 4: Verify backfill on an old test**

Open a test that existed BEFORE the migration. Run the backfill against its `--test-id`. Reopen Materials Panel. The same expectations as Step 2 should hold.

- [ ] **Step 5: If everything passes, tag the migration**

```bash
git tag -a materials-unified -m "materials: docx imports use sha1[:7] ids; formulas as files"
git push origin materials-unified
```

---

## Self-Review

**Spec coverage:**

| Recommendation from chat | Task |
|---|---|
| 1. Конец `rId*` ID → sha1[:7] для импорта картинок | Task 2 |
| 2.A. Перевести формулы импорта на ссылочную форму (`materials/<hash>.mml`) | Task 3 |
| 3. Дедуп `<v:imagedata>` ↔ `<m:oMath>` через `mc:AlternateContent/Choice` | Task 4 |
| Сериализатор должен предпочитать id вместо инлайнового mathml | Task 5 |
| Backfill для уже импортированных тестов | Task 7 |
| Верификация что переписан и storage, и payload одновременно | Task 6 + Task 8 |

No requirements left unmapped.

**Placeholder scan:** zero `TODO`/`later`/`similar to`. All code is full.

**Type consistency:**
- `_short_id_for_bytes` returns `str`; used uniformly.
- `_register_formula` returns `tuple[str | None, str | None]`; only Task 3's `push_formula` consumes it.
- `image_map[rel_id]` is still `Path`; nothing downstream changes.
- `ContentItem.formula_id` (existing `str | None` in `core/models.py`) is the SAME field set by Task 3 and read by Task 5.
- Backfill mutates `Question.payload` dict in place, then reassigns to trigger SQLAlchemy change tracking — consistent with how Question.payload mutation works elsewhere (`questions_service.apply_cr_patch`).

Plan internally consistent.
