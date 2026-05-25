"""Main FastAPI application with modularized routes."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.config import ALLOWED_ORIGINS, STATIC_DIR, validate_secret_key
from api.database import init_db
from api.routes import access, assets, attempts, auth, change_requests, questions, statistics, tests, users
from api.services.cleanup_service import schedule_events_cleanup
from core.logging_setup import setup_console_logging

setup_console_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    # --- Startup ---
    init_db()
    validate_secret_key()
    cleanup_thread, stop_event = schedule_events_cleanup()
    logger.info("Application started (SQLite storage, lifespan active)")

    yield

    # --- Shutdown ---
    stop_event.set()
    cleanup_thread.join(timeout=5)
    logger.info("Application shutdown complete")


app = FastAPI(title="Test Extractor API", lifespan=lifespan)

# CORS middleware — origins configured via ALLOWED_ORIGINS env variable
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# Root endpoint — serves the SPA
@app.get("/")
def index() -> FileResponse:
    """Serve frontend index.html."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(index_path)


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tests.router)
app.include_router(access.router)
app.include_router(change_requests.router)
app.include_router(assets.router)
app.include_router(questions.router)
app.include_router(attempts.router)
app.include_router(statistics.router)
