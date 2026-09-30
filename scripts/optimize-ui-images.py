"""Generate lossless runtime WebP copies without changing original PNG artwork.

Run with a Python interpreter with Pillow/WebP support (the existing runtime
build venv is sufficient). --check verifies committed outputs without writing.
"""
import argparse
import io
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "app-web" / "assets" / "ui"
SOURCES = [
    ASSETS / "empty-state" / f"penguin-{name}-{layer}.png"
    for name in ("hug", "relax", "sleepy")
    for layer in ("card", "plate", "smooth")
]


def verify(source, encoded):
    with Image.open(source) as original, Image.open(io.BytesIO(encoded)) as decoded:
        assert decoded.format == "WEBP", f"Not WebP: {source}"
        assert original.size == decoded.size, f"Size changed: {source}"
        assert original.convert("RGBA").tobytes() == decoded.convert("RGBA").tobytes(), f"Pixels changed: {source}"
        assert original.info.get("icc_profile") == decoded.info.get("icc_profile"), f"Color profile changed: {source}"
        assert len(encoded) < source.stat().st_size, f"No size benefit: {source}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not features.check("webp"):
        raise RuntimeError("Pillow needs WebP encoder support")
    before = after = 0
    for source in SOURCES:
        destination = source.with_suffix(".webp")
        if args.check:
            encoded = destination.read_bytes()
        else:
            if destination.exists():
                raise FileExistsError(f"Refusing to overwrite {destination}; use --check to verify")
            with Image.open(source) as original:
                buffer = io.BytesIO()
                metadata = {key: original.info[key] for key in ("icc_profile", "exif") if key in original.info}
                original.save(buffer, format="WEBP", lossless=True, method=6, exact=True, **metadata)
                encoded = buffer.getvalue()
            verify(source, encoded)
            destination.write_bytes(encoded)
        verify(source, encoded)
        before += source.stat().st_size
        after += len(encoded)
        print(f"PASS {source.relative_to(ROOT)}: {source.stat().st_size} -> {len(encoded)} bytes; identical RGBA")
    print(f"Total: {before / 2**20:.3f} -> {after / 2**20:.3f} MiB; saved {(before-after) / 2**20:.3f} MiB")


if __name__ == "__main__":
    main()
