"""Asset management endpoints."""
from typing import Annotated

# defusedxml shields the parser from XXE and billion-laughs attacks —
# critical when accepting MathML uploads from non-owner collaborators.
from defusedxml import ElementTree as ET

from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.models.db.user import User
from api.services import access_service
from api.utils import assets_dir, safe_asset_path, test_dir
from api.utils.file_utils import save_upload_with_id
from api.utils.validation import TEST_ID_PATTERN

router = APIRouter(prefix="/api/tests/{test_id}/assets", tags=["assets"])

# File-extension classification for the materials panel.
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
FORMULA_EXTS = {".mml", ".xml", ".mathml"}


def _classify(suffix: str) -> str:
    s = suffix.lower()
    if s in IMAGE_EXTS:   return "image"
    if s in FORMULA_EXTS: return "formula"
    return "other"


def _validate_mathml(data: bytes) -> str:
    """Reject malformed MathML uploads.

    Accept any well-formed XML whose root local-name is ``math``.
    Returns the decoded XML text on success.
    """
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="MathML file must be UTF-8")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid XML in MathML upload: {e}",
        )
    # Allow either bare <math> or namespaced root.
    local = root.tag.rsplit("}", 1)[-1] if "}" in root.tag else root.tag
    if local.lower() != "math":
        raise HTTPException(
            status_code=400,
            detail=f"MathML root must be <math>, got <{local}>",
        )
    return text


@router.post("")
def upload_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict[str, str]:
    """Upload an asset (image or MathML formula) to a test.

    Saves under a 7-char sha1-prefix filename. Same content twice → same
    ID (dedup). MathML uploads are validated server-side: must be UTF-8,
    well-formed XML, and the root element must be ``<math>``.
    """
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can upload assets"
        )

    if not test_dir(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")

    assets_directory = assets_dir(test_id)
    saved_path, short_id, data = save_upload_with_id(file, assets_directory)
    kind = _classify(saved_path.suffix)

    response = {
        "id": short_id,
        "src": saved_path.relative_to(assets_directory).as_posix(),
        "name": file.filename or saved_path.name,
        "kind": kind,
    }

    if kind == "formula":
        try:
            mathml = _validate_mathml(data)
        except HTTPException:
            # Roll back the saved file so an invalid formula doesn't
            # leak into the materials list.
            try:
                saved_path.unlink()
            except OSError:
                pass
            raise
        response["mathml"] = mathml

    return response


@router.get("/materials")
def list_materials(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, list[dict[str, str]]]:
    """List every uploaded image / formula for this test.

    Drives the editor's "📚 Материалы" panel — each item carries the
    7-char short ID the author references via ``[[img:abc1234]]`` /
    ``[[mathml:abc1234]]`` tokens.
    """
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    assets_directory = assets_dir(test_id)
    if not assets_directory.exists():
        return {"items": []}

    items: list[dict[str, str]] = []
    for path in sorted(assets_directory.iterdir()):
        if not path.is_file():
            continue
        kind = _classify(path.suffix)
        if kind == "other":
            continue
        rel = path.relative_to(assets_directory).as_posix()
        entry: dict[str, str] = {
            "id": path.stem,
            "src": rel,
            "name": path.name,
            "kind": kind,
        }
        if kind == "formula":
            try:
                entry["mathml"] = path.read_text(encoding="utf-8")
            except OSError:
                continue
        items.append(entry)

    return {"items": items}


@router.delete("/{asset_id}")
def delete_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Delete an asset by its short ID (file stem).

    Existing question blocks may still reference the deleted material —
    those references are intentionally **not** rewritten here. The
    frontend detects broken references via the materials manifest and
    surfaces them to the owner; broken images render as empty inlines.
    """
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can delete assets"
        )

    # Restrict ID to a content-hash short form: 1-32 hex chars, no path
    # separators. Anything outside that is rejected before touching disk.
    if not asset_id or not all(c in "0123456789abcdefABCDEF" for c in asset_id) or len(asset_id) > 32:
        raise HTTPException(status_code=400, detail="Invalid asset id")

    assets_directory = assets_dir(test_id)
    if not assets_directory.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    removed = []
    for path in assets_directory.iterdir():
        if path.is_file() and path.stem == asset_id:
            try:
                path.unlink()
                removed.append(path.name)
            except OSError:
                pass

    if not removed:
        raise HTTPException(status_code=404, detail="Asset not found")

    return {"status": "deleted", "id": asset_id, "removed": removed}


# Catch-all GET — registered LAST so literal routes like /materials win.
@router.get("/{asset_path:path}")
def get_asset(
    test_id: Annotated[str, Path(pattern=TEST_ID_PATTERN)],
    asset_path: str,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> FileResponse:
    """Get test asset file."""
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    assets_directory = assets_dir(test_id)
    file_path = safe_asset_path(assets_directory, asset_path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(file_path)
