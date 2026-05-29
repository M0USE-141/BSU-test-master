# Multi-stage Dockerfile for testmaster_app.
#
# Stage layout:
#   base    — minimal runtime layer with libpq (psycopg2) + inkscape
#             (WMF/EMF conversion in core/image_convert.py) + fonts.
#   deps    — adds compilers + dev headers, builds the venv via uv,
#             then is thrown away.
#   runtime — base + venv + source. Runs as non-root.
#
# Resulting image: ~500 MB (most of which is Inkscape + librsvg).

# ---------- base ----------
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        libpq5 \
        inkscape \
        fonts-dejavu \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# ---------- deps ----------
FROM base AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv — significantly faster than pip for our dep graph.
RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
# `--no-dev` skips dev-only dependencies (httpx is a runtime dep so it
# ships regardless).
RUN uv sync --frozen --no-dev

# ---------- runtime ----------
FROM base AS runtime

WORKDIR /app

# Carry over the resolved venv from `deps`. We do NOT copy uv itself
# into runtime — image stays small.
COPY --from=deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Source. `.dockerignore` excludes data/, .venv/, etc. so this is fast.
COPY . ./

# Run as a dedicated, unprivileged user. We don't need home or a
# password; everything writeable lives under /app/data via a volume.
RUN adduser --disabled-password --gecos "" --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Match the health route. Caddy / docker compose use this to gate
# traffic — see deploy/testmaster/docker-compose.yml `healthcheck`.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
