"""Authentication service for user management and JWT handling."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DbSession

from api.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    SESSION_EXTEND_MINUTES,
)
from api.models.db.user import Session, User


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def create_access_token(user_id: int, jti: str | None = None) -> tuple[str, str]:
    """Create a JWT access token.

    Returns:
        Tuple of (token, jti)
    """
    if jti is None:
        jti = str(uuid.uuid4())

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "jti": jti,
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, jti


def verify_token(token: str) -> dict | None:
    """Verify and decode a JWT token.

    Returns:
        Decoded token payload or None if invalid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_user_by_username(db: DbSession, username: str) -> User | None:
    """Get user by username."""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: DbSession, email: str) -> User | None:
    """Get user by email."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: DbSession, user_id: int) -> User | None:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: DbSession, username: str, email: str, password: str) -> User:
    """Create a new user."""
    hashed = hash_password(password)
    user = User(
        username=username,
        email=email,
        hashed_password=hashed,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(
    db: DbSession, user_id: int, token_jti: str, expires_at: datetime
) -> Session:
    """Create a new session for user."""
    session = Session(
        user_id=user_id,
        token_jti=token_jti,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_active_session(db: DbSession, token_jti: str) -> Session | None:
    """Get an active session by token JTI."""
    now = datetime.now(timezone.utc)
    return (
        db.query(Session)
        .filter(
            Session.token_jti == token_jti,
            Session.is_active == True,  # noqa: E712
            Session.expires_at > now,
        )
        .first()
    )


_SESSION_EXTEND_GAP_SECONDS = 60  # minimum gap between DB writes


def extend_session(db: DbSession, session: Session) -> Session:
    """Extend session expiration and update last activity.

    Skips the DB write if last_activity was updated within the last 60 seconds
    to avoid a commit on every authenticated request.
    """
    now = datetime.now(timezone.utc)
    last_activity = session.last_activity
    # SQLite returns naive datetimes even for timezone=True columns; treat as UTC.
    if last_activity.tzinfo is None:
        last_activity = last_activity.replace(tzinfo=timezone.utc)
    elapsed = (now - last_activity).total_seconds()
    if elapsed < _SESSION_EXTEND_GAP_SECONDS:
        return session  # already fresh — skip the DB round-trip
    session.last_activity = now
    session.expires_at = now + timedelta(minutes=SESSION_EXTEND_MINUTES)
    db.commit()
    db.refresh(session)
    return session


def invalidate_session(db: DbSession, token_jti: str) -> None:
    """Invalidate a session by token JTI."""
    session = db.query(Session).filter(Session.token_jti == token_jti).first()
    if session:
        session.is_active = False
        db.commit()


# ── Refresh tokens ──────────────────────────────────────────────


def create_refresh_token(user_id: int, jti: str | None = None) -> tuple[str, str, datetime]:
    """Create a JWT refresh token.

    Refresh tokens carry `type:"refresh"` to distinguish them from access
    tokens — the access-token verification rejects them and vice versa.

    Returns:
        Tuple of (token, jti, expires_at).
    """
    if jti is None:
        jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        "jti": jti,
        "type": "refresh",
    }
    encoded = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded, jti, expires_at


def verify_refresh_token(token: str) -> dict | None:
    """Verify a refresh JWT and confirm `type=refresh`.

    Returns the decoded payload or None on invalid signature, expiry,
    or wrong token type.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "refresh":
        return None
    return payload


def login_session(db: DbSession, user_id: int) -> tuple[str, str, int, datetime]:
    """Issue a fresh access+refresh pair and persist a new Session row.

    Returns:
        (access_token, refresh_token, access_expires_in_seconds, refresh_expires_at)
    """
    access_token, access_jti = create_access_token(user_id)
    refresh_token, refresh_jti, refresh_expires_at = create_refresh_token(user_id)
    access_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    session = Session(
        user_id=user_id,
        token_jti=access_jti,
        expires_at=access_expires_at,
        refresh_jti=refresh_jti,
        refresh_expires_at=refresh_expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return (
        access_token,
        refresh_token,
        ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_at,
    )


def rotate_refresh(
    db: DbSession, refresh_token: str
) -> tuple[str, str, int, datetime] | None:
    """Validate a refresh token and rotate the session.

    On success: marks the old session inactive, creates a NEW session row
    with fresh access+refresh JTIs, and returns the new token pair.

    On failure (signature/expiry/missing session/already-rotated): returns
    None — caller should respond 401.
    """
    payload = verify_refresh_token(refresh_token)
    if not payload:
        return None
    refresh_jti = payload.get("jti")
    user_id_str = payload.get("sub")
    if not refresh_jti or not user_id_str:
        return None
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        return None

    now = datetime.now(timezone.utc)
    session = (
        db.query(Session)
        .filter(
            Session.refresh_jti == refresh_jti,
            Session.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not session:
        return None
    refresh_expires_at = session.refresh_expires_at
    if refresh_expires_at is not None:
        if refresh_expires_at.tzinfo is None:
            refresh_expires_at = refresh_expires_at.replace(tzinfo=timezone.utc)
        if refresh_expires_at <= now:
            session.is_active = False
            db.commit()
            return None

    # Mark the old session inactive (rotation) and mint a fresh pair.
    session.is_active = False
    db.commit()
    return login_session(db, user_id)


def invalidate_session_by_refresh(db: DbSession, refresh_token: str) -> None:
    """Look up the session by refresh JTI and deactivate it.

    Used by /logout when only the refresh cookie is available.
    """
    payload = verify_refresh_token(refresh_token)
    if not payload:
        return
    refresh_jti = payload.get("jti")
    if not refresh_jti:
        return
    session = (
        db.query(Session).filter(Session.refresh_jti == refresh_jti).first()
    )
    if session:
        session.is_active = False
        db.commit()


