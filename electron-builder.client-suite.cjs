const path = require('node:path');

const output = process.env.MAOYI_CLIENT_BUILD_OUTPUT;
if (!output) throw new Error('MAOYI_CLIENT_BUILD_OUTPUT is required.');

module.exports = {
  appId: 'com.maoyi.translator',
  productName: '皮卡丘翻译器',
  buildVersion: '1.6.16',
  executableName: 'maoyi',
  asar: true,
  electronDist: 'node_modules/electron/dist',
  directories: { output: path.resolve(output) },
  files: [
    'dist/**/*',
    'dist-electron/main.js',
    'electron/preload.cjs',
    'electron/webview-send-guard-preload.cjs',
    'package.json'
  ],
  extraResources: [
    { from: '.package-secrets/client-license-suite.json', to: 'license-suite-public.json' },
    { from: '.package-secrets/translation-prompts.dfp', to: 'translation-prompts.dfp' },
    { from: '.package-secrets/smart-reply-prompt.dfp', to: 'smart-reply-prompt.dfp' },
    {
      from: '.package-staging/signal',
      to: 'signal'
    },
    {
      from: '.package-staging/local-speech',
      to: 'local-speech'
    },
    {
      from: 'src/assets/pikachu-translator.ico',
      to: 'pikachu-translator.ico'
    }
  ],
  afterPack: './tools/electron-builder-after-pack.cjs',
  protocols: [
    {
      name: '皮卡丘翻译器 Signal notification',
      schemes: ['maoyi-translator']
    }
  ],
  win: {
    target: 'nsis',
    icon: 'src/assets/pikachu-translator.ico',
    artifactName: 'pikaqiufanyiqi-${buildVersion}-Setup.${ext}'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '皮卡丘翻译器'
  }
};
