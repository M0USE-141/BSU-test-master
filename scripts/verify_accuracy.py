"""Standalone checks for stats_service.compute_accuracy (no pytest in this project)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.services.stats_service import compute_accuracy


def main() -> int:
    cases = [
        # (correct, total) -> (accuracy_percent, rank)
        ((0, 0), (0.0, "none")),      # never answered
        ((0, 3), (0.0, "bronze")),    # all wrong -> 0%
        ((5, 10), (50.0, "bronze")),  # 50% -> bronze (< 60)
        ((6, 10), (60.0, "silver")),  # exactly 60% -> silver
        ((2, 3), (round(2 / 3 * 100, 1), "silver")),  # 66.7% -> silver
        ((9, 10), (90.0, "gold")),    # exactly 90% -> gold
        ((3, 3), (100.0, "gold")),    # 100% -> gold
    ]
    errors = []
    for (correct, total), expected in cases:
        got = compute_accuracy(correct, total)
        if got != expected:
            errors.append(f"compute_accuracy({correct},{total}) = {got}, expected {expected}")
    for e in errors:
        print(f"[FAIL] {e}")
    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
