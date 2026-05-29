"""SQLAlchemy type helpers — cross-dialect JSON.

`JsonDict` and `JsonList` map to native `JSONB` on PostgreSQL and to the
generic `JSON` type (TEXT under the hood) on SQLite. The model code reads
and writes Python dicts/lists; the DB driver does the encoding.

Phase 4 introduces these so new tables (`questions`, `import_jobs`,
`outgoing_emails`) and new JSONB columns (`test_collections.settings`)
work identically on dev SQLite and prod Postgres without surfacing
dialect-specific logic in the model files.
"""
from __future__ import annotations

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

# Dialect-aware type: JSONB on Postgres, JSON on everything else.
# Use as: `payload: Mapped[dict] = mapped_column(JsonDict, nullable=False)`.
JsonDict = JSON().with_variant(JSONB(), "postgresql")
JsonList = JSON().with_variant(JSONB(), "postgresql")
