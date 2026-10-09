#!/usr/bin/env python3
"""Launcher icons for the TeliTall phone edition. Navy tile, two people, green bubble."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent / "app" / "src" / "main" / "res"
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

NAVY = (11, 35, 64, 255)
GREEN = (14, 159, 110, 255)
BLUE = (27, 95, 209, 255)
PAPER = (244, 247, 245, 255)


def draw(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    radius = int(size * 0.22)
    pen.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=NAVY)

    def circle(cx, cy, r, color):
        pen.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    def person(cx, head_y, color, scale):
        circle(cx, head_y, int(size * 0.075 * scale), color)
        body_w = int(size * 0.16 * scale)
        body_h = int(size * 0.20 * scale)
        top = head_y + int(size * 0.10 * scale)
        pen.rounded_rectangle(
            (cx - body_w, top, cx + body_w, top + body_h),
            radius=int(size * 0.08),
            fill=color,
        )

    person(int(size * 0.34), int(size * 0.30), BLUE, 1)
    person(int(size * 0.68), int(size * 0.28), GREEN, 1.05)

    bubble_l = int(size * 0.22)
    bubble_t = int(size * 0.52)
    bubble_r = int(size * 0.78)
    bubble_b = int(size * 0.78)
    pen.rounded_rectangle((bubble_l, bubble_t, bubble_r, bubble_b), radius=int(size * 0.08), fill=GREEN)
    tail = [
        (int(size * 0.34), bubble_b - 2),
        (int(size * 0.28), int(size * 0.90)),
        (int(size * 0.46), bubble_b - 2),
    ]
    pen.polygon(tail, fill=GREEN)
    dot_y = (bubble_t + bubble_b) // 2
    for cx in (0.40, 0.50, 0.60):
        circle(int(size * cx), dot_y, max(2, int(size * 0.028)), PAPER)
    return image


def main() -> None:
    for folder, size in SIZES.items():
        out = ROOT / folder
        out.mkdir(parents=True, exist_ok=True)
        draw(size).save(out / "ic_launcher.png")
        print(out / "ic_launcher.png")


if __name__ == "__main__":
    main()
