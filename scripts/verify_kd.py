"""Standalone checks for stats_service.compute_kd (no pytest in this project)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.services.stats_service import compute_kd


def main() -> int:
    cases = [
        # (correct, total) -> (ratio, rank)
        ((0, 0), (0.0, "none")),    # never answered
        ((0, 3), (0.0, "bronze")),  # all wrong
        ((1, 2), (1.0, "silver")),  # K=1 D=1 -> 1.0
        ((2, 3), (2.0, "gold")),    # K=2 D=1 -> 2.0
        ((3, 3), (6.0, "gold")),    # D=0 -> K*2 = 6
        ((1, 4), (round(1/3, 1), "bronze")),  # K=1 D=3 -> 0.3
    ]
    errors = []
    for (correct, total), expected in cases:
        got = compute_kd(correct, total)
        if got != expected:
            errors.append(f"compute_kd({correct},{total}) = {got}, expected {expected}")
    for e in errors:
        print(f"[FAIL] {e}")
    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
