import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const clientBuilder = fs.readFileSync(path.join(root, 'electron-builder.client-suite.cjs'), 'utf8');
const source = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const result = await build({
  input: path.join(root, 'electron', 'main.ts'),
  external: [/^electron$/, /^node:/],
  treeshake: false,
  write: false,
  output: { file: 'main.js', format: 'esm', minify: true, sourcemap: false }
});

assert.equal(result.output.length, 1);
const [bundle] = result.output;
assert.equal(bundle.type, 'chunk');
assert.ok(Buffer.byteLength(bundle.code) < Buffer.byteLength(source), 'the single production bundle should be smaller than the TypeScript entry');
assert.ok(bundle.code.includes('https://api.deepseek.com/chat/completions'), 'the DeepSeek translation endpoint must remain in the bundle');
assert.doesNotMatch(bundle.code, /sourceMappingURL/);
assert.ok(bundle.imports.every(id => id === 'electron' || id.startsWith('node:')), 'only Electron and Node built-ins may remain external');
assert.ok(packageJson.build.files.includes('dist-electron/main.js'));
assert.ok(!packageJson.build.files.some(file => file.startsWith('dist-electron/') && file !== 'dist-electron/main.js'));
assert.match(clientBuilder, /'dist-electron\/main\.js'/);
assert.doesNotMatch(clientBuilder, /'dist-electron\/(?!main\.js)[^']+\.js'/);

console.log(`client-main-bundle: ${Buffer.byteLength(bundle.code)} bytes, ${bundle.imports.length} built-ins external, no internal modules or source maps`);
