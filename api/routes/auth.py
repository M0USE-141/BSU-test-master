"""Authentication routes."""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DbSession

from api.config import ACCESS_TOKEN_EXPIRE_MINUTES
from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    MessageResponse,
    PasswordRulesResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from api.models.db.user import User
from api.services.auth_service import (
    create_access_token,
    create_session,
    create_user,
    get_active_session,
    get_user_by_email,
    get_user_by_username,
    hash_password,
    invalidate_session,
    verify_password,
    verify_token,
)
from api.services.password_reset_service import (
    consume_reset_token,
    issue_reset_token,
    password_rules,
    reset_user_password,
    validate_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


@router.get("/password-rules", response_model=PasswordRulesResponse)
def get_password_rules() -> PasswordRulesResponse:
    """Public password rules — frontend renders a live checklist from these."""
    return PasswordRulesResponse(**password_rules())


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    data: UserRegister,
    db: Annotated[DbSession, Depends(get_db)],
) -> User:
    """Register a new user."""
    # Validate password against shared rules. Detail uses an underscored key
    # the frontend can map to localized strings.
    pw_errors = validate_password(data.password)
    if pw_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "weak_password", "failed_rules": pw_errors},
        )

    # Check if username or email already exists — unified message to avoid enumeration
    if get_user_by_username(db, data.username) or get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed",
        )

    # Create user
    user = create_user(db, data.username, data.email, data.password)
    return user


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Issue a reset link for the email if it exists.

    Always returns 200 with a generic message — never reveals whether the
    address is registered. The link is emailed when SMTP is configured,
    otherwise logged to the server console (see password_reset_service).
    """
    user = get_user_by_email(db, data.email)
    if user is not None and user.is_active:
        base = str(request.base_url).rstrip("/")
        issue_reset_token(db, user, base_url=base)

    return MessageResponse(
        message="If that email is registered, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    data: ResetPasswordRequest,
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Consume a single-use reset token and set a new password."""
    pw_errors = validate_password(data.new_password)
    if pw_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "weak_password", "failed_rules": pw_errors},
        )

    user = consume_reset_token(db, data.token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    reset_user_password(db, user, data.new_password)
    return MessageResponse(message="Password updated. You can log in now.")


@router.post("/login", response_model=TokenResponse)
def login(
    data: UserLogin,
    db: Annotated[DbSession, Depends(get_db)],
) -> TokenResponse:
    """Login and get JWT token."""
    # Try to find user by username
    user = get_user_by_username(db, data.username)

    # If not found by username, try email
    if user is None:
        user = get_user_by_email(db, data.username)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
        )

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Create token and session
    token, jti = create_access_token(user.id)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    create_session(db, user.id, jti, expires_at)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Logout and invalidate current session."""
    if credentials is None:
        return MessageResponse(message="Already logged out")

    token = credentials.credentials
    payload = verify_token(token)

    if payload and payload.get("jti"):
        invalidate_session(db, payload["jti"])

    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Get current user info."""
    return current_user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Change the current user's password."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    return MessageResponse(message="Password changed successfully")


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> TokenResponse:
    """Refresh access token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    old_jti = payload.get("jti")

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        uid = int(user_id)
        if uid <= 0:
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Verify the old session is still active before issuing a new token
    if old_jti:
        session = get_active_session(db, old_jti)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalidated",
            )
        invalidate_session(db, old_jti)

    # Create new token and session
    new_token, new_jti = create_access_token(uid)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    create_session(db, uid, new_jti, expires_at)

    return TokenResponse(
        access_token=new_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
