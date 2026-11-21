const fs = require('node:fs');
const { createRequire } = require('node:module');
console.log('P realpath:', fs.realpathSync.native('P:\\'));
const r = createRequire('P:\\packages\\windows-ucv\\package.json');
console.log('node-addon-api:', r.resolve('node-addon-api'));
