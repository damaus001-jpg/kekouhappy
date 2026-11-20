"""Provision the new lockfile's dependency cache without using the old store."""
import concurrent.futures
import pathlib
import re
import subprocess
import urllib.request
import os

ROOT = pathlib.Path(__file__).resolve().parent.parent
FETCH = ROOT / '.tmp/signal-dependency-fetch'
FETCH.mkdir(parents=True, exist_ok=True)
workspace = (ROOT / '.tmp/signal-port/Signal-Desktop-8.36.0/pnpm-workspace.yaml').read_text()
files = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.pnpmfile.mjs'] + re.findall(r'(patches/[^\s\'\"]+\.patch)', workspace)

def get(name):
    target = FETCH / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen('https://raw.githubusercontent.com/signalapp/Signal-Desktop/v8.36.0/' + name, timeout=90) as response:
        target.write_bytes(response.read())

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(get, files))
env = dict(os.environ)
node_dir = ROOT / '.toolchains/node-v24.22.3-win-x64'
env['PATH'] = str(node_dir) + os.pathsep + env['PATH']
env['npm_config_cache'] = str(ROOT / '.toolchains/npm-cache')
env['ELECTRON_CACHE'] = str(ROOT / '.toolchains/electron-cache')
cmd = [str(node_dir/'node.exe'), str(ROOT/'.toolchains/pnpm-11.24.0/package/bin/pnpm.cjs'), 'fetch', '--frozen-lockfile', '--ignore-scripts', '--store-dir', str(ROOT/'.pnpm-store-complete')]
raise SystemExit(subprocess.call(cmd, cwd=FETCH, env=env))
