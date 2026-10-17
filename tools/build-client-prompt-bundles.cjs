const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.resolve(process.env.MAOYI_LICENSE_SUITE_PATH || path.join(root, '.package-secrets', 'current-license-suite.json'));
if (!fs.statSync(suitePath, { throwIfNoEntry: false })?.isFile()) {
  throw new Error(`Client signing suite is missing: ${path.relative(root, suitePath)}`);
}
for (const script of ['tools/build-translation-prompt-bundle.mjs', 'tools/build-smart-reply-prompt-bundle.mjs']) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, MAOYI_LICENSE_SUITE_PATH: suitePath },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}`);
}
