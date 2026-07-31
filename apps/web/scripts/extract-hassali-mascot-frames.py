from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "mascots" / "hassali-mascot-sprite.png"
OUTPUT = ROOT / "public" / "mascots"


def rough_silhouette(size: tuple[int, int], frame_kind: str) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    if frame_kind == "coin":
        draw.ellipse((width * 0.1, height * 0.06, width * 0.9, height * 0.74), fill=255)
        return mask

    if frame_kind == "walk":
        points = [
            (0.13, 0.96), (0.11, 0.84), (0.22, 0.74), (0.19, 0.61),
            (0.27, 0.49), (0.21, 0.34), (0.29, 0.17), (0.46, 0.04),
            (0.68, 0.05), (0.84, 0.18), (0.86, 0.38), (0.77, 0.49),
            (0.88, 0.61), (0.83, 0.74), (0.93, 0.89), (0.88, 0.97),
            (0.70, 0.99), (0.55, 0.87), (0.45, 0.99), (0.28, 0.99),
        ]
    else:
        points = [
            (0.05, 0.96), (0.08, 0.77), (0.18, 0.61), (0.13, 0.43),
            (0.24, 0.23), (0.40, 0.06), (0.65, 0.04), (0.83, 0.16),
            (0.91, 0.34), (0.99, 0.43), (0.94, 0.57), (0.84, 0.66),
            (0.93, 0.83), (0.89, 0.96), (0.70, 0.99), (0.54, 0.88),
            (0.39, 0.99), (0.20, 0.99),
        ]
    draw.polygon([(int(x * width), int(y * height)) for x, y in points], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(1))


def foreground_mask(crop: Image.Image, frame_kind: str) -> Image.Image:
    return rough_silhouette(crop.size, frame_kind)


def isolate(
    source: Image.Image,
    box: tuple[int, int, int, int],
    frame_kind: str,
) -> Image.Image:
    crop = source.crop(box).convert("RGB")
    rgba = crop.convert("RGBA")
    rgba.putalpha(foreground_mask(crop, frame_kind))
    return rgba


def make_strip(
    source: Image.Image,
    boxes: list[tuple[int, int, int, int]],
    cell_size: tuple[int, int],
    output_name: str,
    frame_kind: str,
) -> None:
    cell_width, cell_height = cell_size
    strip = Image.new("RGBA", (cell_width * len(boxes), cell_height), (0, 0, 0, 0))

    for index, box in enumerate(boxes):
        frame = isolate(source, box, frame_kind)
        frame.thumbnail((cell_width - 8, cell_height - 8), Image.Resampling.LANCZOS)
        x = index * cell_width + (cell_width - frame.width) // 2
        y = cell_height - frame.height - 2
        strip.alpha_composite(frame, (x, y))

    strip.save(OUTPUT / output_name, optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")

    make_strip(
        source,
        [
            (286, 132, 482, 382),
            (442, 132, 638, 382),
            (594, 132, 790, 382),
            (746, 132, 942, 382),
            (900, 132, 1096, 382),
            (1054, 132, 1250, 382),
            (1206, 132, 1402, 382),
        ],
        (88, 104),
        "hassali-walk-strip.png",
        "walk",
    )
    make_strip(
        source,
        [
            (100, 424, 350, 716),
            (300, 424, 550, 716),
            (500, 424, 750, 716),
            (700, 424, 950, 716),
            (900, 424, 1150, 716),
            (1100, 424, 1350, 716),
        ],
        (88, 104),
        "hassali-throw-strip.png",
        "throw",
    )
    make_strip(
        source,
        [
            (475, 768, 573, 928),
            (570, 768, 668, 928),
            (665, 768, 763, 928),
            (760, 768, 858, 928),
            (850, 768, 948, 928),
        ],
        (32, 48),
        "hassali-coin-strip.png",
        "coin",
    )


if __name__ == "__main__":
    main()
