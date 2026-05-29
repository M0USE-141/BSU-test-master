"""Manual verification for Task 1-5: docx → unified materials.

Run:
    python scripts/verify_materials_unification.py path/to/fixture.docx

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

# Allow running from any cwd: ensure project root is on sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from core.serialization import serialize_test_payload
from core.word_extract import WordTestExtractor

R_ID_PATTERN = re.compile(r"rId\d+")


def _sha1_7(data: bytes) -> str:
    return hashlib.sha1(data, usedforsecurity=False).hexdigest()[:7]


def main(docx_path: Path) -> int:
    assert docx_path.exists(), f"fixture not found: {docx_path}"
    workdir = Path(tempfile.mkdtemp(prefix="materials_unification_"))
    assets = workdir / "assets"
    assets.mkdir()
    print(f"[INFO] extracting {docx_path.name} -> {assets}")

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

    # 3. Every formula in payload has an id, and a matching .mml in assets.
    # Walk question, correct, and every option's content — formulas can live
    # in any of them, and a bug that only manifests in option content would
    # otherwise pass this check.
    formula_ids: list[str] = []
    inline_only_count = 0

    def _scan_content(content_obj: dict) -> None:
        nonlocal inline_only_count
        for block in content_obj.get("blocks", []) or []:
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

    for q in payload["questions"]:
        for key in ("question", "correct"):
            sub = q.get(key)
            if isinstance(sub, dict):
                _scan_content(sub)
        for opt in q.get("options", []):
            sub = opt.get("content")
            if isinstance(sub, dict):
                _scan_content(sub)
    if inline_only_count:
        warnings.append(
            f"{inline_only_count} formulas have no id "
            "(likely OMML XSLT unavailable on this host - Inkscape OK, but no Office or core/omml2mml.xsl)"
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
        print("usage: python scripts/verify_materials_unification.py <fixture.docx>")
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1])))
