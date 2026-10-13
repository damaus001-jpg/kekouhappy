const path = require('node:path');

const output = process.env.MAOYI_PROMPT_GENERATOR_OUTPUT || '.tmp/prompt-generator-release';

module.exports = {
  appId: 'com.maoyi.promptgenerator',
  productName: 'maoyi提示词文件生成器',
  asar: true,
  electronDist: 'node_modules/electron/dist',
  extraMetadata: { main: 'dist-electron/prompt-generator.js' },
  directories: { output: path.resolve(output) },
  files: [
    'dist-electron/prompt-generator.js',
    'dist-electron/translation-prompt-bundle.js',
    'dist-electron/prompt-bundle-signing.js',
    'prompt-generator/**/*',
    'electron/prompt-generator-preload.cjs',
    'package.json'
  ],
  extraResources: [
    { from: 'config/translation-prompts.default.json', to: 'translation-prompts.source.json' },
    { from: '.package-staging/prompt-generator-signing.json', to: 'prompt-signing-private.json' }
  ],
  afterPack: './tools/electron-builder-after-pack.cjs',
  win: {
    target: 'portable',
    icon: 'src/assets/maoyi-app-icon.ico',
    artifactName: 'MAOYI-PROMPT-GENERATOR-${version}.${ext}'
  }
};
