"""Authentication routes."""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DbSession

from api.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_DOMAIN,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    PUBLIC_BASE_URL,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from api.database import SessionLocal, get_db
from api.dependencies.auth import get_current_user
from api.dependencies.mail import get_mail_service
from api.services.mail import MailService
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
    invalidate_session_by_refresh,
    login_session,
    rotate_refresh,
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


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Attach the refresh-token HttpOnly cookie to the response.

    Settings come from `api.config`:
      - HttpOnly always — JS can never read it (XSS-proof).
      - Secure only when ENV=prod (HTTPS); dev runs HTTP at LAN IP.
      - SameSite=Lax — protects against most CSRF without breaking
        normal navigation/links.
      - Path scoped to /api/auth so the cookie is only sent on auth
        endpoints; other API calls use the Authorization header.
    """
    max_age = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
        domain=COOKIE_DOMAIN,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh cookie (logout / rotation failure)."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        domain=COOKIE_DOMAIN,
    )


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
    background_tasks: BackgroundTasks,
    request: Request,
    db: Annotated[DbSession, Depends(get_db)],
    mail: Annotated[MailService, Depends(get_mail_service)],
) -> MessageResponse:
    """Issue a reset link.

    Always returns 200 with a generic message — anti-enumeration. When
    the email exists and belongs to an active user we issue a token and
    queue the delivery via `BackgroundTasks`. The mail service writes
    an `outgoing_emails` audit row regardless of delivery success.
    """
    user = get_user_by_email(db, data.email)
    if user is not None and user.is_active:
        token = issue_reset_token(db, user)
        base = PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
        reset_url = f"{base.rstrip('/')}/#/auth/reset?token={token}"
        # Run delivery on its own DB session — BackgroundTasks may
        # outlive the current request scope and `db` (from Depends) is
        # closed when this handler returns.
        background_tasks.add_task(
            _send_password_reset_mail,
            mail,
            to=user.email,
            user_id=user.id,
            locale=user.language,
            display_name=user.display_name or user.username,
            username=user.username,
            reset_url=reset_url,
        )

    return MessageResponse(
        message="If that email is registered, a reset link has been sent."
    )


def _send_password_reset_mail(
    mail: MailService,
    *,
    to: str,
    user_id: int,
    locale: str | None,
    display_name: str,
    username: str,
    reset_url: str,
) -> None:
    """BackgroundTasks worker — owns its own DB session."""
    from api.services.password_reset_service import RESET_TOKEN_TTL_MINUTES
    with SessionLocal() as session:
        user_ctx = {"display_name": display_name, "username": username}
        # subject is rendered with the same context, so use a default
        # localized message — picked up via mail templates' shared
        # subject key.
        subjects = {
            "ru": "Сброс пароля — TestMasterBSU",
            "en": "Password reset — TestMasterBSU",
            "uz": "Parolni tiklash — TestMasterBSU",
        }
        loc = (locale or "ru").lower()
        try:
            mail.send_template(
                session,
                to=to,
                locale=loc,
                template="password_reset",
                event="password_reset",
                user_id=user_id,
                context={
                    "subject": subjects.get(loc, subjects["ru"]),
                    "user": user_ctx,
                    "action_url": reset_url,
                    "ttl_minutes": RESET_TOKEN_TTL_MINUTES,
                },
            )
        except Exception:  # noqa: BLE001 — never re-raise from background
            import logging
            logging.getLogger(__name__).exception("password reset mail send failed")


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
    response: Response,
    db: Annotated[DbSession, Depends(get_db)],
) -> TokenResponse:
    """Login and get an access token.

    Response body carries the short-lived access token (Bearer-style).
    The long-lived refresh token is set as an HttpOnly cookie so it
    can never be read by JavaScript — silent rotation via /refresh.
    """
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

    access_token, refresh_token_str, expires_in, _ = login_session(db, user.id)
    _set_refresh_cookie(response, refresh_token_str)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    db: Annotated[DbSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> MessageResponse:
    """Logout — invalidate session(s) and clear the refresh cookie.

    Uses whichever token is available: prefer access JTI (current bearer),
    fall back to refresh cookie. Always clears the cookie so the client
    can't keep re-logging-in silently.
    """
    if credentials is not None:
        payload = verify_token(credentials.credentials)
        if payload and payload.get("jti"):
            invalidate_session(db, payload["jti"])

    if refresh_token:
        invalidate_session_by_refresh(db, refresh_token)

    _clear_refresh_cookie(response)
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
    response: Response,
    db: Annotated[DbSession, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> TokenResponse:
    """Rotate the access+refresh pair using the HttpOnly refresh cookie.

    - Reads `refresh_token` from cookie (no Authorization header needed).
    - Validates JWT signature, expiry, and the matching Session row.
    - Issues a fresh access+refresh pair, marks the old session inactive,
      and sets the new refresh cookie.
    - On any failure: clears the cookie and returns 401 so the SPA can
      drop the user to /auth/login cleanly.
    """
    if not refresh_token:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    result = rotate_refresh(db, refresh_token)
    if result is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    new_access, new_refresh, expires_in, _ = result
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(
        access_token=new_access,
        token_type="bearer",
        expires_in=expires_in,
    )
