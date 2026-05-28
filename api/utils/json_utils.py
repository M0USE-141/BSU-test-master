"""JSON serialization utilities."""
import json
import os
from pathlib import Path


def json_dump(payload: object) -> str:
    """Serialize object to pretty JSON string."""
    return json.dumps(payload, ensure_ascii=False, indent=2)


def json_load(data: str) -> object:
    """Deserialize JSON string to object."""
    return json.loads(data)


def write_json_atomic(path: Path, payload: object) -> None:
    """Write object as JSON file atomically (write to .tmp then os.replace)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json_dump(payload), encoding="utf-8")
    os.replace(tmp, path)