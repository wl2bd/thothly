"""A visitor's own cover image: checked, fitted to the cover frame once, kept
beside the job's outputs until the compile lays the title over it."""

import io
import os
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.render.cover import fit_to_cover

# The browser scales a photo down before sending it, so these only stop abuse.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
# Decoded size guard: a 200 KB PNG can unpack into a 600 MB bitmap. The browser
# never sends more than 2560 px on a side.
_MAX_PIXELS = 2560 * 2560 * 11 // 10
_FORMATS = {"JPEG", "PNG", "WEBP"}


class InvalidCoverImage(Exception):
    """Not an image we can use; the message is written for the visitor."""


def cover_image_path(job_id: str) -> Path:
    return settings.data_dir / "covers" / f"{job_id}.jpg"


def save_cover_image(job_id: str, data: bytes) -> Path:
    if not data:
        raise InvalidCoverImage("That file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidCoverImage("That image is too large. Pick one under 8 MB.")
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in _FORMATS:
            raise InvalidCoverImage("Use a JPEG, PNG or WebP image.")
        if image.width * image.height > _MAX_PIXELS:
            raise InvalidCoverImage("That image is too large. Pick a smaller one.")
        fitted = fit_to_cover(image)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise InvalidCoverImage("That file isn't an image we can read.") from None

    # Written aside, then swapped in: a compile reading it never sees half a file.
    path = cover_image_path(job_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    fitted.save(tmp, format="JPEG", quality=88)
    os.replace(tmp, path)
    return path


def remove_cover_image(job_id: str) -> None:
    cover_image_path(job_id).unlink(missing_ok=True)
