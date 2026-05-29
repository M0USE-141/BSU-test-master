"""Block utilities — the only survivors of the file-based test_service.

The legacy `load_test_payload`/`save_test_payload`/`find_question`/
`test_exists` helpers were retired in Phase 4 when payload moved into
the `questions` table. Use `api.services.questions_service` instead.
"""
from __future__ import annotations


def text_to_blocks(text: str) -> list[dict[str, object]]:
    """Convert plain text to the SPA's `blocks` format."""
    lines = text.splitlines() if text is not None else [""]
    if not lines:
        lines = [""]
    return [
        {
            "type": "paragraph",
            "inlines": [{"type": "text", "text": line}],
        }
        for line in lines
    ]


def extract_blocks(value: object) -> list[dict[str, object]] | None:
    """Return `value['blocks']` if it's a list, else None."""
    if isinstance(value, dict):
        blocks = value.get("blocks")
        if isinstance(blocks, list):
            return blocks
    return None
