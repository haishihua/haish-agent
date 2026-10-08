"""Check the complete app dependency graph, including extras, before freezing."""
from __future__ import annotations

import importlib.metadata as metadata
from pathlib import Path
import sys
import tomllib
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


def check_dependencies(source_root: Path) -> list[str]:
    project = tomllib.loads((source_root / "pyproject.toml").read_text())["project"]
    pending = [(raw, "app") for raw in project.get("dependencies", [])]
    pending += [(raw, "app") for raw in project["optional-dependencies"]["app"]]
    visited = set()
    errors = set()
    while pending:
        raw, extra = pending.pop()
        req = Requirement(raw)
        if req.marker and not req.marker.evaluate({"extra": extra}):
            continue
        try:
            dist = metadata.distribution(req.name)
        except metadata.PackageNotFoundError:
            errors.add(f"Missing runtime dependency: {req}")
            continue
        if req.specifier and not req.specifier.contains(dist.version, prereleases=True):
            errors.add(f"Incompatible runtime dependency: {req}; installed {dist.version}")
        extras = tuple(sorted({"", *req.extras}))
        key = (canonicalize_name(req.name), extras)
        if key in visited:
            continue
        visited.add(key)
        pending.extend((child, selected) for child in dist.requires or [] for selected in extras)
    return sorted(errors)


if __name__ == "__main__":
    errors = check_dependencies(Path(sys.argv[1]))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        raise SystemExit(1)
    print("[runtime-dependencies] app extras and transitive dependencies verified.")
