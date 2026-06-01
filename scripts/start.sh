#!/usr/bin/env sh
# Production entrypoint (Railway / Docker).
#
# Runs, in order, before handing off to the web server:
#   1. alembic upgrade head  — apply pending DB migrations. FATAL on failure:
#      we must never start serving against a stale/incompatible schema.
#   2. repair_attempt_correctness — one-time data repair (idempotent). Best
#      effort: a failure here logs a warning but does NOT block boot. Safe to
#      remove this step once it has run successfully on production.
#
# The actual server command is passed as arguments (see Dockerfile CMD /
# Procfile) and exec'd so it becomes PID 1 and receives signals directly.
set -e

echo "[start] alembic upgrade head"
alembic upgrade head

echo "[start] repair_attempt_correctness (idempotent; remove after first run if desired)"
python scripts/repair_attempt_correctness.py || echo "[start] WARN: repair failed (non-fatal); continuing"

echo "[start] exec: $*"
exec "$@"
