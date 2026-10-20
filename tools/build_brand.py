"""Generate the project's original, dependency-free 256px timetable icon."""

from pathlib import Path
import struct
import zlib

SIZE = 256


def main() -> None:
    pixels = bytearray(SIZE * SIZE * 4)

    def rectangle(left, top, right, bottom, color):
        for y in range(top, bottom):
            for x in range(left, right):
                offset = (y * SIZE + x) * 4
                pixels[offset:offset + 4] = bytes((*color, 255))

    rectangle(16, 28, 240, 232, (34, 49, 63))
    rectangle(24, 36, 232, 224, (250, 250, 250))
    rectangle(24, 36, 232, 86, (249, 107, 87))
    rectangle(66, 16, 78, 54, (34, 49, 63))
    rectangle(178, 16, 190, 54, (34, 49, 63))
    for y in (124, 174):
        rectangle(40, y, 216, y + 4, (78, 89, 98))
    for x in (62, 102, 142, 182):
        for y in (120, 170):
            rectangle(x, y, x + 3, y + 12, (78, 89, 98))
    rectangle(58, 102, 150, 116, (255, 134, 24))
    rectangle(138, 152, 200, 166, (0, 164, 220))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    rows = b''.join(b'\0' + pixels[y * SIZE * 4:(y + 1) * SIZE * 4] for y in range(SIZE))
    image = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
             + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))
    destination = Path(__file__).resolve().parents[1] / 'custom_components/heating_schedule_manager/brand/icon.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(image)
    print(destination)


if __name__ == '__main__':
    main()
