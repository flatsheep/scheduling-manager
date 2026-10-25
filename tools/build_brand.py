"""Render trimmed, lossless, interlaced timetable icons at 256px and 512px."""

from pathlib import Path
import struct
import zlib

SIZE = 256
ADAM7 = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
         (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))


def render(size: int) -> bytes:
    """Draw from the same square geometry, rather than upscale a raster icon."""
    scale = size // SIZE
    pixels = bytearray(size * size * 4)

    def rectangle(left, top, right, bottom, color):
        left, top, right, bottom = (coordinate * scale for coordinate in (left, top, right, bottom))
        row = bytes((*color, 255)) * (right - left)
        for y in range(top, bottom):
            offset = (y * size + left) * 4
            pixels[offset:offset + len(row)] = row

    # The calendar spans the full square canvas; only the shaped space around
    # the top binding rings is transparent, with no empty outer rows/columns.
    rectangle(0, 14, 256, 256, (34, 49, 63))
    rectangle(9, 23, 247, 247, (250, 250, 250))
    rectangle(9, 23, 247, 83, (249, 107, 87))
    rectangle(57, 0, 71, 45, (34, 49, 63))
    rectangle(185, 0, 199, 45, (34, 49, 63))
    for y in (128, 187):
        rectangle(27, y, 229, y + 4, (78, 89, 98))
    for x in (52, 98, 144, 190):
        for y in (123, 182):
            rectangle(x, y, x + 3, y + 14, (78, 89, 98))
    rectangle(48, 101, 153, 118, (255, 134, 24))
    rectangle(139, 161, 211, 178, (0, 164, 220))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    # Adam7 progressively displays the image. Each pass has its own scanlines;
    # filter 0 preserves the exact RGBA artwork before lossless zlib compression.
    rows = bytearray()
    for start_x, start_y, step_x, step_y in ADAM7:
        for y in range(start_y, size, step_y):
            rows.append(0)
            for x in range(start_x, size, step_x):
                offset = (y * size + x) * 4
                rows.extend(pixels[offset:offset + 4])
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 1))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / 'custom_components/scheduling_manager/brand'
    destination.mkdir(parents=True, exist_ok=True)
    for size, filename in ((256, 'icon.png'), (512, 'icon@2x.png')):
        path = destination / filename
        path.write_bytes(render(size))
        print(path)


if __name__ == '__main__':
    main()
