"""Pin the official archive, extract it safely, and replay the reviewed integration."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile
import os

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARCHIVE_SHA = '38B003DC2C65F1D17D6E99CB864CC923A63B1A37A574DD1BB3F67F4CA9620FEA'
UPSTREAM_ROOT = 'signalapp-Signal-Desktop-ceafb48'
UPSTREAM_TAG = 'ceafb48536643567744d2ea77382ba80b279f0fc'
audit = ROOT / '.tmp/upstream-audit'
source = audit / 'Signal-Desktop-v8.36.0.api.zip'
if hashlib.sha256(source.read_bytes()).hexdigest().upper() != ARCHIVE_SHA:
    raise RuntimeError('Official archive hash mismatch')
tag = json.loads((audit / 'tag-ref.json').read_text())
if tag['object']['sha'] != UPSTREAM_TAG or tag['object']['type'] != 'tag':
    raise RuntimeError('Unexpected upstream tag')
archive_path = ROOT / 'reference-sources/Signal-Desktop-v8.36.0.zip'
if not archive_path.exists():
    shutil.copyfile(source, archive_path)
reference = ROOT / 'reference-sources/Signal-Desktop-v8.36.0/Signal-Desktop-8.36.0'
experiment = ROOT / '.tmp/signal-source/v8.36.0'
prepared = experiment / 'Signal-Desktop-8.36.0'
with zipfile.ZipFile(archive_path) as zipped:
    for dest in [reference, prepared]:
        if dest.exists():
            raise RuntimeError('Refusing to overwrite existing source: ' + str(dest))
        dest.mkdir(parents=True)
        for member in zipped.infolist():
            if not member.filename.startswith(UPSTREAM_ROOT + '/'):
                raise RuntimeError('Archive root mismatch')
            relative = member.filename[len(UPSTREAM_ROOT)+1:]
            if not relative or member.is_dir():
                continue
            target = dest / relative
            if not target.resolve().is_relative_to(dest.resolve()):
                raise RuntimeError('Archive path escape')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zipped.read(member))
    # The earlier migration used individual raw GitHub downloads. Ensure they
    # represent the same exact upstream files before applying their patch.
    port = ROOT / '.tmp/signal-port/Signal-Desktop-8.36.0'
    files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', 'HEAD'], cwd=port).decode().splitlines()
    for name in files:
        original = subprocess.check_output(['git', 'show', 'HEAD:' + name], cwd=port)
        if original != (reference / name).read_bytes():
            raise RuntimeError('Raw/archive upstream mismatch: ' + name)
series_path = ROOT / 'signal-source/patches/v8.36.0/series.json'
series = json.loads(series_path.read_text())
digest = hashlib.sha256(json.dumps(series, separators=(',', ':')).encode()).hexdigest().upper()
for entry in series['patches']:
    patch = series_path.parent / entry['file']
    if hashlib.sha256(patch.read_bytes()).hexdigest().upper() != entry['sha256']:
        raise RuntimeError('Patch hash mismatch')
    for args in [['--check'], []]:
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--no-index', '--whitespace=error-all', *args, str(patch)], cwd=prepared, env=dict(os.environ, GIT_CEILING_DIRECTORIES=str(prepared.parent)), check=True)
if not (prepared / 'app/maoyi/bootstrap.main.ts').is_file() or "main: 'app/maoyi/bootstrap.main.ts'" not in (prepared / 'rolldown.config.ts').read_text():
    raise RuntimeError('Patched startup entry missing')
manifest = {
    'schemaVersion': 1, 'version': '8.36.0',
    'archive': {'repositoryRelativePath': 'reference-sources/Signal-Desktop-v8.36.0.zip', 'sha256': ARCHIVE_SHA, 'extractedRoot': 'Signal-Desktop-8.36.0', 'upstreamExtractedRoot': UPSTREAM_ROOT, 'upstreamTagObject': UPSTREAM_TAG, 'url': 'https://api.github.com/repos/signalapp/Signal-Desktop/zipball/v8.36.0'},
    'referenceSource': {'repositoryRelativePath': 'reference-sources/Signal-Desktop-v8.36.0/Signal-Desktop-8.36.0'},
    'patchSeries': {'projectRelativePath': 'signal-source/patches/v8.36.0/series.json'},
    'package': {'name': 'signal-desktop', 'version': '8.36.0', 'node': '24.22.3', 'packageManager': 'pnpm@11.24.0', 'electron': '45.4.1'},
    'experiment': {'projectRelativePath': '.tmp/signal-source/v8.36.0', 'minimumPrepareFreeBytes': 1073741824, 'minimumBuildFreeBytes': 16106127360},
    'build': {'installArgs': ['pnpm', 'install', '--offline', '--frozen-lockfile'], 'cleanPaths': ['release', 'bundles'], 'unsignedWindows': True, 'electronArchiveSha256': '2BA6223AFA9121F42831FEFE92C434334907540165294FC56697449D12E7CFE9', 'buildSteps': [['pnpm', 'run', 'generate'], ['pnpm', 'run', 'build:rolldown:prod'], ['pnpm', 'run', 'build:release', '--win', 'dir']]}
}
(ROOT / 'signal-source/baselines/v8.36.0.json').write_text(json.dumps(manifest, indent=2) + '\n')
(experiment / '.df-source-experiment.json').write_text(json.dumps({'schemaVersion': 1, 'version': '8.36.0', 'archiveSha256': ARCHIVE_SHA, 'patchSetSha256': digest, 'packageManager': 'pnpm@11.24.0', 'node': '24.22.3'}, indent=2) + '\n')
contract = json.loads((ROOT / 'signal-source/compatibility/v8.18.0.json').read_text())
contract['baseline'] = '8.36.0'
(ROOT / 'signal-source/compatibility/v8.36.0.json').write_text(json.dumps(contract, indent=2) + '\n')
print(json.dumps({'prepared': str(prepared), 'archiveSha256': ARCHIVE_SHA, 'patchSetSha256': digest}, indent=2))
