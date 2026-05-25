"""Asset management endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.models.db.user import User
from api.services import access_service
from api.utils import assets_dir, safe_asset_path, save_upload_file, test_dir

router = APIRouter(prefix="/api/tests/{test_id}/assets", tags=["assets"])


@router.get("/{asset_path:path}")
def get_asset(
    test_id: str,
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


@router.post("")
def upload_asset(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict[str, str]:
    """Upload asset to test."""
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(
            status_code=403, detail="Only the test owner can upload assets"
        )

    if not test_dir(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")

    assets_directory = assets_dir(test_id)
    saved_path = save_upload_file(file, assets_directory)

    return {
        "src": saved_path.relative_to(assets_directory).as_posix(),
        "name": saved_path.name,
        "id": saved_path.stem,
    }
