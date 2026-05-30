from __future__ import annotations
import logging
import os
import sys


# Third-party libraries whose DEBUG output drowns out real application
# logs and confuses log-routing platforms (Railway, Datadog) into tagging
# every line as severity=error. Pinned to WARNING regardless of root level.
_NOISY_LOGGERS = (
    "urllib3.connectionpool",     # per-request "200 0" / "404 0" lines for every S3 call
    "urllib3.util.retry",
    "botocore",                   # tons of internal lifecycle/credential DEBUG
    "botocore.parsers",
    "botocore.endpoint",
    "botocore.hooks",
    "botocore.auth",
    "s3transfer",
    "boto3",
    "minio",                      # we own the calls; INFO is enough
    "charset_normalizer",
    "asyncio",                    # selector-loop DEBUG noise on Windows
    "PIL",                        # avatar/image pipeline
    "PIL.PngImagePlugin",
    "multipart",                  # python-multipart parses every upload chunk
    "multipart.multipart",
)


# Uvicorn ships its own handlers attached directly to `uvicorn`,
# `uvicorn.access`, and `uvicorn.error` — and by default they all write
# to stderr. That's the second piece of the "everything tagged as error
# in Railway" puzzle. Clearing their handlers + setting propagate=True
# routes those records through OUR split handlers below.
_UVICORN_LOGGERS = ("uvicorn", "uvicorn.access", "uvicorn.error")


class _MaxLevelFilter(logging.Filter):
    """Allow only records strictly below the given level.

    Used to route INFO/WARNING to stdout while leaving ERROR/CRITICAL to
    the stderr handler — Railway (and most log platforms) classify
    severity by stream: stdout → info, stderr → error.
    """

    def __init__(self, max_level: int) -> None:
        super().__init__()
        self._max = max_level

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        return record.levelno < self._max


def setup_console_logging(level: int | None = None) -> None:
    """Call once at app start. Configures the root logger + silences noisy libs.

    Split streams for platform-friendly severity classification:
      * stdout — DEBUG / INFO / WARNING. Railway tags these as info-level.
      * stderr — ERROR / CRITICAL only. Railway tags these as error-level.

    Without the split, Python's default `StreamHandler()` writes to stderr,
    so Railway marks every line — including `INFO: ... 200 OK` access logs
    and urllib3 DEBUG — as severity=error. We saw exactly this in the
    incident logs: 1001 entries, all `severity":"error"`, real errors
    indistinguishable from healthy 200s.

    Level resolution:
      1. Explicit `level` arg, if given.
      2. `LOG_LEVEL` env var (e.g. `INFO`, `DEBUG`, `WARNING`).
      3. Default `INFO` — DEBUG is too verbose for any non-local environment.

    Noisy third-party loggers are pinned to WARNING unconditionally so even
    a deliberate root=DEBUG (local debugging) doesn't bring back the spam.
    """
    if level is None:
        env_level = os.environ.get("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, env_level, logging.INFO)

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    root = logging.getLogger()
    # Re-running setup (e.g. on hot reload) should not stack handlers.
    # We tag ours so a second call replaces only what we own.
    for existing in list(root.handlers):
        if getattr(existing, "_testmaster_managed", False):
            root.removeHandler(existing)

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(fmt)
    stdout_handler.addFilter(_MaxLevelFilter(logging.ERROR))
    stdout_handler._testmaster_managed = True  # type: ignore[attr-defined]

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(fmt)
    stderr_handler.setLevel(logging.ERROR)
    stderr_handler._testmaster_managed = True  # type: ignore[attr-defined]

    root.addHandler(stdout_handler)
    root.addHandler(stderr_handler)
    root.setLevel(level)

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)

    # Strip uvicorn's own stderr handlers + let records propagate to root.
    # We keep uvicorn.access at INFO (200 OK access logs land in stdout now)
    # and uvicorn.error at INFO too — uvicorn writes startup banners and
    # real exceptions to that logger; the level filter on the handlers
    # routes them correctly (banners → stdout, exceptions → stderr).
    for name in _UVICORN_LOGGERS:
        lg = logging.getLogger(name)
        for h in list(lg.handlers):
            lg.removeHandler(h)
        lg.propagate = True
        # If user dialed root to WARNING, don't let uvicorn override that.
        lg.setLevel(logging.NOTSET)
