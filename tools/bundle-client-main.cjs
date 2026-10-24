const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const entryPath = path.join(projectRoot, 'electron', 'main.ts');
const outputPath = path.join(projectRoot, 'dist-electron', 'main.js');

async function main() {
  const { build } = await import('rolldown');
  if (!fs.existsSync(entryPath)) throw new Error('Electron main-process entry is missing.');

  const result = await build({
    input: entryPath,
    external: [/^electron$/, /^node:/],
    treeshake: false,
    write: false,
    output: {
      file: outputPath,
      format: 'esm',
      minify: true,
      sourcemap: false
    }
  });
  if (result.output.length !== 1 || result.output[0].type !== 'chunk') {
    throw new Error('Expected one bundled Electron main-process output.');
  }

  const output = result.output[0];
  const unexpectedImports = output.imports.filter(id => id !== 'electron' && !id.startsWith('node:'));
  if (unexpectedImports.length) {
    throw new Error(`Bundled Electron output still imports internal or third-party modules: ${unexpectedImports.join(', ')}`);
  }
  if (output.code.includes('sourceMappingURL') || result.output.some(item => item.type === 'asset' && item.fileName.endsWith('.map'))) {
    throw new Error('Source maps must not be included in the customer main-process bundle.');
  }

  const tempPath = `${outputPath}.bundling`;
  fs.writeFileSync(tempPath, output.code, 'utf8');
  fs.renameSync(tempPath, outputPath);

  const sourceBytes = fs.statSync(entryPath).size;
  const outputBytes = Buffer.byteLength(output.code);
  console.log(`Customer main process bundled into one minified file: ${sourceBytes} -> ${outputBytes} bytes; ${output.imports.length} Node/Electron built-ins remain external; no source maps.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
