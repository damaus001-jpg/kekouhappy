"""Isolated migration helper. Never reads account data or modifies the main checkout."""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.request
import zipfile
import sys
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIT = ROOT / '.tmp/upstream-audit'
TARGET = ROOT / '.tmp/signal-port/Signal-Desktop-8.36.0'
SERIES = ROOT / 'signal-source/patches/v8.18.0/series.json'

def prepare():
    series = json.loads(SERIES.read_text())
    added, modified = set(), set()
    for entry in series['patches']:
        patch = (SERIES.parent / entry['file']).read_text(encoding='utf-8')
        for part in re.split(r'(?m)^diff --git ', patch)[1:]:
            filename = part.splitlines()[0].split(' b/', 1)[1]
            if '\nnew file mode ' in part:
                added.add(filename)
            elif filename not in added:
                modified.add(filename)
    TARGET.mkdir(parents=True, exist_ok=True)
    def fetch(name):
        dest = TARGET / name
        if dest.exists():
            return name, 'cached'
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = 'https://raw.githubusercontent.com/signalapp/Signal-Desktop/v8.36.0/' + name
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                data = response.read()
            dest.write_bytes(data)
            return name, hashlib.sha256(data).hexdigest()
        except Exception as error:
            return name, str(error)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch, sorted(modified | {'package.json', '.nvmrc', 'pnpm-workspace.yaml', '.npmrc'})))
    (AUDIT / 'affected-source-downloads.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))

def apply():
    def git(*args):
        return subprocess.run(['git', '-c', 'core.autocrlf=false', *args], cwd=TARGET, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if (TARGET / '.git').exists():
        raise RuntimeError('Port already initialized; refusing to reapply')
    git('init')
    git('add', '.')
    result = git('-c', 'user.name=Signal migration', '-c', 'user.email=migration@localhost', 'commit', '-m', 'Upstream v8.36.0 affected files')
    if result.returncode:
        raise RuntimeError(result.stderr)
    results = []
    for entry in json.loads(SERIES.read_text())['patches']:
        result = git('apply', '--reject', '--whitespace=nowarn', str(SERIES.parent / entry['file']))
        results.append({'patch': entry['file'], 'exitCode': result.returncode, 'output': result.stderr})
    (AUDIT / 'initial-patch-results.json').write_text(json.dumps(results, indent=2))
    rejects = sorted(str(p.relative_to(TARGET)) for p in TARGET.rglob('*.rej'))
    print(json.dumps({'patches': len(results), 'failedPatches': [r['patch'] for r in results if r['exitCode']], 'rejects': rejects}, indent=2))

def merge():
    old = ROOT / '.tmp/signal-port/old-patched'
    replay = not old.exists()
    old.mkdir(parents=True, exist_ok=True)
    patches = json.loads(SERIES.read_text())['patches']
    with zipfile.ZipFile(ROOT / 'reference-sources/Signal-Desktop-v8.18.0.zip') as archive:
        prefix = 'Signal-Desktop-8.18.0/'
        originals = {}
        for name in archive.namelist():
            rel = name.removeprefix(prefix)
            if name.startswith(prefix) and not name.endswith('/') and (TARGET / rel).is_file():
                data = archive.read(name)
                originals[rel] = data
                dest = old / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                if replay:
                    dest.write_bytes(data)
    env = dict(__import__('os').environ, GIT_CEILING_DIRECTORIES=str(old.parent))
    for entry in patches if replay else []:
        result = subprocess.run(['git', 'apply', '--no-index', '--whitespace=nowarn', str(SERIES.parent / entry['file'])], cwd=old, env=env, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode())
    conflicts = []
    for file in old.rglob('*'):
        if not file.is_file():
            continue
        rel = file.relative_to(old).as_posix()
        dest = TARGET / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if rel not in originals:
            shutil.copyfile(file, dest)
            continue
        upstream = subprocess.run(['git', 'show', 'HEAD:' + rel], cwd=TARGET, capture_output=True, check=True).stdout
        dest.write_bytes(upstream.replace(b'\r\n', b'\n'))
        base = AUDIT / 'merge-base.tmp'
        base.write_bytes(originals[rel].replace(b'\r\n', b'\n'))
        file.write_bytes(file.read_bytes().replace(b'\r\n', b'\n'))
        result = subprocess.run(['git', 'merge-file', '-L', 'upstream-8.36.0', '-L', 'upstream-8.18.0', '-L', 'maoyi-patches', str(dest), str(base), str(file)], capture_output=True)
        if result.returncode:
            conflicts.append(rel)
    (AUDIT / 'three-way-conflicts.json').write_text(json.dumps(conflicts, indent=2))
    print(json.dumps(conflicts, indent=2))

def freeze():
    for file in TARGET.rglob('*'):
        if file.suffix in {'.ts', '.tsx', '.scss'} and '.git' not in file.parts:
            if re.search(r'(?m)^<<<<<<<|^=======|^>>>>>>>', file.read_text(encoding='utf-8')):
                raise RuntimeError('Unresolved conflict: ' + str(file))
            file.write_bytes(file.read_bytes().replace(b'\r\n', b'\n'))
    subprocess.run(['git', '-c', 'core.autocrlf=false', 'add', '-N', '--', 'app/maoyi', 'ts/maoyi', 'ts/test-node/maoyi'], cwd=TARGET, check=True, capture_output=True)
    patch = subprocess.run(['git', '-c', 'core.autocrlf=false', 'diff', '--binary', '--full-index'], cwd=TARGET, capture_output=True, check=True).stdout
    dest = ROOT / 'signal-source/patches/v8.36.0'
    dest.mkdir(parents=True, exist_ok=True)
    filename = '0001-maoyi-complete-integration.patch'
    (dest / filename).write_bytes(patch)
    series = {'schemaVersion': 1, 'baseline': '8.36.0', 'patches': [{'file': filename, 'sha256': hashlib.sha256(patch).hexdigest().upper()}]}
    (dest / 'series.json').write_text(json.dumps(series, indent=2) + '\n')
    digest = hashlib.sha256(json.dumps(series, separators=(',', ':')).encode()).hexdigest().upper()
    (AUDIT / 'port-patch-hash.txt').write_text(digest)
    print('Patch set SHA256:', digest, 'patch bytes:', len(patch))

if __name__ == '__main__':
    {'fetch': prepare, 'apply': apply, 'merge': merge, 'freeze': freeze}[sys.argv[1] if len(sys.argv)>1 else 'fetch']()
