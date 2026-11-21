const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../.tmp/signal-port/Signal-Desktop-8.36.0');
const diagnostics = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(ts|tsx)$/.test(file)) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const diagnostic of source.parseDiagnostics) {
        diagnostics.push({file: path.relative(root, file), message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')});
      }
    }
  }
}
visit(root);
console.log(JSON.stringify({syntaxErrors: diagnostics}, null, 2));
process.exitCode = diagnostics.length ? 1 : 0;
