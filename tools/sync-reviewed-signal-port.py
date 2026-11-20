import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parent.parent
port = root/'.tmp/signal-port/Signal-Desktop-8.36.0'
subprocess.run(['python', str(root/'tools/port-signal-8.36.py'), 'freeze'], check=True)
changed = subprocess.check_output(['git', '-c', 'core.autocrlf=false', 'diff', '--name-only'], cwd=port).decode().splitlines()
series = json.loads((root/'signal-source/patches/v8.36.0/series.json').read_text())
digest = hashlib.sha256(json.dumps(series, separators=(',', ':')).encode()).hexdigest().upper()
for relative in ['.tmp/s', '.tmp/signal-source/v8.36.0/Signal-Desktop-8.36.0']:
    source = root/relative
    for name in changed:
        dest = source/name
        if not dest.resolve().is_relative_to(source.resolve()):
            raise RuntimeError('Source path escape')
        data = (port/name).read_bytes()
        if not dest.exists() or dest.read_bytes() != data:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    marker_path = source/'.df-short-build.json'
    if marker_path.exists():
        marker = json.loads(marker_path.read_text())
        marker.update(patchSetSha256=digest, verifiedFiles=len(changed))
        marker_path.write_text(json.dumps(marker, indent=2))
subprocess.run(['python', str(root/'tools/replay-signal-836.py'), '--check-only'], check=True)
