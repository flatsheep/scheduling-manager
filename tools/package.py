"""Create a deterministic install ZIP without touching a HA configuration."""
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def main():
    frontend = json.loads((ROOT / 'frontend/package.json').read_text())
    output = ROOT / 'artifacts' / f"scheduling-manager-{frontend['version']}.zip"
    files = [(p, str(p.relative_to(ROOT))) for p in (ROOT / 'custom_components').rglob('*')
             if p.is_file() and '__pycache__' not in p.parts]
    # The card is inside custom_components, exactly as downloaded by HACS.
    files += [(ROOT / name, name) for name in ('README.md', 'API.md', 'TEST_RESULTS.md', 'HA_STANDARDS.md', 'HACS_PUBLISHING.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md')]
    # Local artifacts can contain private installation data; never package them.
    files += [(p, str(p.relative_to(ROOT))) for p in (ROOT / 'docs/images').glob('*.png')]
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        for source, destination in sorted(files, key=lambda pair: pair[1]):
            info = ZipInfo(destination, date_time=(2026, 10, 6, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
    print(output)
    print(f'SHA256 {sha256(output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
