"""Main FastAPI application with modularized routes."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.config import ALLOWED_ORIGINS, APP_VERSION, STATIC_DIR, validate_secret_key
from api.database import init_db
from api.routes import access, assets, attempts, auth, change_requests, notifications, questions, search, statistics, tests, users
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


# Root endpoint — serves the SPA with the build version injected so the
# browser's ES module cache is busted on each deploy (or server restart in dev).
@app.get("/")
def index() -> HTMLResponse:
    """Serve frontend index.html with APP_VERSION injected as window.__APP_VERSION__."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frontend not found")
    html = index_path.read_text(encoding="utf-8")
    version_script = f'<script>window.__APP_VERSION__ = "{APP_VERSION}";</script>'
    html = html.replace("</head>", f"  {version_script}\n</head>", 1)

    # Cache-bust local stylesheets the same way main.js gets ?v=Date.now() —
    # otherwise browsers (especially Electron preview) hold stale CSS across
    # restarts and gap/typography changes don't take effect until a manual
    # cache clear. We only stamp our own /static/css/* hrefs; external
    # stylesheets (Google Fonts, etc.) are left alone.
    import re
    def _stamp(match: "re.Match[str]") -> str:
        href = match.group(1)
        sep = "&" if "?" in href else "?"
        return f'href="{href}{sep}v={APP_VERSION}"'

    html = re.sub(
        r'href="(/static/css/[^"]+)"',
        _stamp,
        html,
    )
    return HTMLResponse(content=html)


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# Cache-Control on /static — force the browser to revalidate every fetch
# via ETag instead of serving stale bytes from its HTTP cache. Without
# this, a freshly-edited module sits in the browser cache across server
# restarts and ES-module imports (which don't carry our APP_VERSION
# query stamp on transitive imports) load the old file. The cost is one
# conditional GET per asset per load — fine for a small SPA, especially
# given StaticFiles already emits strong ETags so most requests respond
# 304 Not Modified.
@app.middleware("http")
async def _static_no_cache(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/"):
        # `no-cache` does NOT mean "don't cache" — it means "must
        # revalidate before reuse". `must-revalidate` keeps proxies
        # honest. Together they let the cache hold the bytes but force
        # an If-None-Match round-trip every time.
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

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
app.include_router(notifications.router)
app.include_router(search.router)
