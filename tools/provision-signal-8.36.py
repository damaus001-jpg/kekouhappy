"""Download and verify the pinned build tools into this worktree only."""
import concurrent.futures
import base64
import hashlib
import json
import pathlib
import tarfile
import urllib.request
import zipfile
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / '.toolchains'
DEST.mkdir(exist_ok=True)

def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=240) as response, path.open('wb') as out:
        while data := response.read(1024 * 1024):
            out.write(data)

def node():
    version = '24.22.3'
    filename = f'node-v{version}-win-x64.zip'
    base = f'https://nodejs.org/dist/v{version}/'
    checksums = urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=45).read().decode()
    expected = next(line.split()[0] for line in checksums.splitlines() if line.endswith('  ' + filename))
    archive = DEST / filename
    download(base + filename, archive)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError('Node SHA256 mismatch')
    with zipfile.ZipFile(archive) as zipped:
        zipped.extractall(DEST)
    return {'node': version, 'sha256': actual}

def pnpm():
    version = '11.24.0'
    metadata = json.load(urllib.request.urlopen(f'https://registry.npmjs.org/pnpm/{version}', timeout=45))
    archive = DEST / f'pnpm-{version}.tgz'
    download(metadata['dist']['tarball'], archive)
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    if integrity != metadata['dist']['integrity']:
        raise RuntimeError('pnpm integrity mismatch')
    with tarfile.open(archive) as tar:
        tar.extractall(DEST / f'pnpm-{version}', filter='data')
    return {'pnpm': version, 'integrity': integrity}

def electron():
    version = '45.4.1'
    name = f'electron-v{version}-win32-x64.zip'
    url = f'https://github.com/electron/electron/releases/download/v{version}/'
    sums = urllib.request.urlopen(url + 'SHASUMS256.txt', timeout=90).read().decode()
    expected = next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*') == name)
    (DEST / 'electron-shasums.txt').write_text(sums)
    print(json.dumps({'electron': version, 'expectedSha256': expected}), flush=True)
    archive = DEST / 'electron-cache' / name
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        download(url + name, archive)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError('Electron SHA256 mismatch')
    (DEST / 'electron-45.4.1.json').write_text(json.dumps({'version': version, 'sha256': actual}, indent=2))
    return {'electron': version, 'sha256': actual}

if __name__ == '__main__':
    if '--electron' in sys.argv:
        print(json.dumps(electron()), flush=True)
        raise SystemExit(0)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in concurrent.futures.as_completed([pool.submit(node), pool.submit(pnpm)]):
            try:
                value = result.result()
            except Exception as error:
                value = {'error': str(error)}
            results.append(value)
            print(json.dumps(value), flush=True)
    (DEST / 'signal-8.36-tools.json').write_text(json.dumps(results, indent=2))
