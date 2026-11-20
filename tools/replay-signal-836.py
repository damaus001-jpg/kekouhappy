import hashlib
import json
import os
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
source = root / '.tmp/signal-source/v8.36.0/Signal-Desktop-8.36.0'
port = root / '.tmp/signal-port/Signal-Desktop-8.36.0'
series_path = root / 'signal-source/patches/v8.36.0/series.json'
series = json.loads(series_path.read_text())
digest = hashlib.sha256(json.dumps(series, separators=(',', ':')).encode()).hexdigest().upper()
env = dict(os.environ, GIT_CEILING_DIRECTORIES=str(source.parent))
def run(args):
    result = subprocess.run(args, cwd=source, env=env, capture_output=True)
    if result.returncode:
        print(result.stderr.decode(errors='replace')[:4000])
        raise SystemExit(result.returncode)
for entry in series['patches']:
    patch = series_path.parent / entry['file']
    if hashlib.sha256(patch.read_bytes()).hexdigest().upper() != entry['sha256']:
        raise RuntimeError('Patch hash mismatch')
    if '--check-only' not in sys.argv:
        run(['git', '-c', 'core.autocrlf=false', 'apply', '--no-index', '--check', '--whitespace=error-all', str(patch)])
        run(['git', '-c', 'core.autocrlf=false', 'apply', '--no-index', '--whitespace=error-all', str(patch)])
    run(['git', '-c', 'core.autocrlf=false', 'apply', '--no-index', '--reverse', '--check', str(patch)])
changed = subprocess.check_output(['git', '-c', 'core.autocrlf=false', 'diff', '--name-only'], cwd=port).decode().splitlines()
for name in changed:
    if (source / name).read_bytes() != (port / name).read_bytes():
        raise RuntimeError('Prepared source differs from reviewed migration: ' + name)
marker_path = source.parent / '.df-source-experiment.json'
marker = json.loads(marker_path.read_text())
old_hash = marker['patchSetSha256']
marker['patchSetSha256'] = digest
marker_path.write_text(json.dumps(marker, indent=2) + '\n')
for name in ['electron/main.ts', 'tools/signal-source-experiment.cjs']:
    target = root / name
    target.write_bytes(target.read_bytes().replace(old_hash.encode(), digest.encode()))
print(json.dumps({'patchSetSha256': digest, 'verifiedFiles': len(changed), 'launcherEntry': (source/'app/maoyi/bootstrap.main.ts').is_file()}, indent=2))
