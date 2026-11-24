"""Stage the exact checked-out core source without modifying it."""
from pathlib import Path
import io
import subprocess
import tarfile
import sys


def prepare(source: Path, staged: Path) -> None:
    archive = subprocess.check_output(["git", "-C", str(source), "archive", "HEAD"])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
        tree.extractall(staged, filter="data")


if __name__ == "__main__":
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
