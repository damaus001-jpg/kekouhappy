"""Create a verified short build directory inside this same isolated worktree."""
import hashlib
import json
import os
import pathlib
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((root/'signal-source/baselines/v8.36.0.json').read_text())
archive = root/manifest['archive']['repositoryRelativePath']
if hashlib.sha256(archive.read_bytes()).hexdigest().upper() != manifest['archive']['sha256']:
    raise RuntimeError('Archive hash mismatch')
target = root/'.tmp/s'
if target.exists():
    raise RuntimeError('Refusing to overwrite the short build directory')
target.mkdir()
prefix = manifest['archive']['upstreamExtractedRoot'] + '/'
with zipfile.ZipFile(archive) as zipped:
    for member in zipped.infolist():
        if not member.filename.startswith(prefix):
            raise RuntimeError('Archive root mismatch')
        relative = member.filename[len(prefix):]
        if not relative or member.is_dir():
            continue
        dest = target/relative
        if not dest.resolve().is_relative_to(target.resolve()):
            raise RuntimeError('Archive path escape')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(zipped.read(member))
series_path = root/'signal-source/patches/v8.36.0/series.json'
series = json.loads(series_path.read_text())
env = dict(os.environ, GIT_CEILING_DIRECTORIES=str(target.parent))
for entry in series['patches']:
    patch = series_path.parent/entry['file']
    if hashlib.sha256(patch.read_bytes()).hexdigest().upper() != entry['sha256']:
        raise RuntimeError('Patch hash mismatch')
    for extra in [['--check'], []]:
        result = subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--no-index', '--whitespace=error-all', *extra, str(patch)], cwd=target, env=env, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace')[:3000])
port = root/'.tmp/signal-port/Signal-Desktop-8.36.0'
changed = subprocess.check_output(['git', '-c', 'core.autocrlf=false', 'diff', '--name-only'], cwd=port).decode().splitlines()
for name in changed:
    if (port/name).read_bytes() != (target/name).read_bytes():
        raise RuntimeError('Reviewed migration mismatch: ' + name)
digest = hashlib.sha256(json.dumps(series, separators=(',', ':')).encode()).hexdigest().upper()
(target/'.df-short-build.json').write_text(json.dumps({'version': '8.36.0', 'archiveSha256': manifest['archive']['sha256'], 'patchSetSha256': digest, 'verifiedFiles': len(changed)}, indent=2))
print(target, 'verified files:', len(changed))
