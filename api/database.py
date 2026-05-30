"""Database utilities and setup."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from api.config import DATABASE_URL

# Pool tuning — Postgres only (SQLite uses StaticPool internally and ignores
# these kwargs). Defaults (size=5, overflow=10, timeout=30s) are too small
# for prod: any handler that holds a session past its `Depends(get_db)` scope
# (e.g. StreamingResponse, long S3 round-trips inside an import) blocks the
# pool, and the background `cleanup_service` thread compounds it.
#
# Sizing rationale:
#   * `pool_size=20` — covers normal RPS on a single uvicorn worker without
#     starving the bg thread. Multiply by uvicorn worker count to estimate
#     total Postgres connections held by the app process group.
#   * `max_overflow=10` — burst headroom for short spikes; over-allocation
#     beyond size+overflow is the signal we want (TimeoutError).
#   * `pool_timeout=10` — fail fast instead of hanging 30s. Slow failures
#     hide leaks; quick TimeoutErrors surface them in logs immediately.
#   * `pool_recycle=1800` — recycle every 30 min so NAT/idle connection
#     killers (Cloudflare/Railway proxies, pg_terminate_backend) don't
#     leave stale sockets in the pool.
#   * `pool_pre_ping=True` — cheap SELECT 1 before checkout; turns
#     "server closed the connection unexpectedly" into a transparent
#     reconnect instead of a 500 to the user. Costs one extra round-trip
#     per checkout, worth it.
_is_sqlite = DATABASE_URL.startswith("sqlite")
_pg_pool_kwargs: dict = {} if _is_sqlite else {
    "pool_size": 20,
    "max_overflow": 10,
    "pool_timeout": 10,
    "pool_recycle": 1800,
    "pool_pre_ping": True,
}

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    **_pg_pool_kwargs,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Base class for models
class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database (create all tables)."""
    Base.metadata.create_all(bind=engine)
