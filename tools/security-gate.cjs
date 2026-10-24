const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const failures = [];
const clientFiles = packageJson.build?.files || [];
const extraResources = packageJson.build?.extraResources || [];
const packageScripts = packageJson.scripts || {};
const windowsPackagedAppId = 'com.maoyi.translator';
const enterpriseIconSource = 'src/assets/pikachu-translator.ico';
const enterpriseIconTarget = 'pikachu-translator.ico';

if (fs.existsSync(path.join(projectRoot, 'main.js'))) failures.push('stale root main.js build artifact must be removed');
if (fs.existsSync(path.join(projectRoot, 'tools', 'prepare-trial-config.cjs'))) failures.push('legacy plaintext trial-config preparation tool must be removed');

for (const forbidden of ['license-issuer/**/*', 'dist-electron/**/*', 'electron/license-issuer-preload.cjs']) {
  if (clientFiles.includes(forbidden)) failures.push(`client files include forbidden broad entry: ${forbidden}`);
}

for (const resource of extraResources) {
  const from = typeof resource === 'string' ? resource : resource?.from;
  if (/trial-config|license-suite\.sealed|issuer-suite-key|translation-prompts\.source|smart-reply-prompt\.source/i.test(String(from || ''))) {
    failures.push(`client resources include a secret-bearing entry: ${from}`);
  }
}

const signalResource = extraResources.find((resource) =>
  typeof resource === 'object' && resource?.to === 'signal'
);
if (signalResource?.from !== '.package-staging/signal') {
  failures.push('client package must use the sanitized Signal staging directory');
}
if (!String(packageScripts['package:win'] || '').includes('prepare:package-output')) {
  failures.push('package:win must clean the release output before building');
}
if (!String(packageScripts['package:win'] || '').includes('prepare:package-signal-runtime')) {
  failures.push('package:win must prepare the sanitized Signal runtime');
}
if (!String(packageScripts['package:win'] || '').includes('verify-packaged-output.cjs')) {
  failures.push('package:win must verify the real packaged output');
}
if (packageJson.build?.appId !== windowsPackagedAppId) {
  failures.push('default client builder AppUserModelID does not match the Windows runtime identity');
}
if (packageJson.build?.win?.icon !== enterpriseIconSource) {
  failures.push('default client builder does not use the enterprise Windows icon');
}
if (!extraResources.some(resource =>
  resource?.from === enterpriseIconSource && resource?.to === enterpriseIconTarget
)) {
  failures.push('default client package is missing the stable enterprise taskbar icon resource');
}

const allowedRuntimeDependencies = {
  '@noble/hashes': '2.2.0',
  '@scure/base': '2.2.0',
  // Local assistant ZIP packages: bounded streams and paths are validated before import.
  'unzipper': '0.12.5'
};
const runtimeDependencies = packageJson.dependencies || {};
for (const [name, version] of Object.entries(runtimeDependencies)) {
  if (allowedRuntimeDependencies[name] !== version) failures.push(`unexpected or unpinned runtime dependency: ${name}@${version}`);
}
for (const [name, version] of Object.entries(allowedRuntimeDependencies)) {
  if (runtimeDependencies[name] !== version) failures.push(`required pinned runtime dependency is missing: ${name}@${version}`);
}
if (packageJson.devDependencies?.electron !== '43.1.0') failures.push('Electron must be pinned to 43.1.0');
if (!packageJson.build?.afterPack) failures.push('Electron fuse afterPack hook is missing');

const sourceFiles = [
  'electron-builder.client-suite.cjs',
  'electron/preload.ts',
  'electron/preload.cjs',
  'electron/webview-send-guard-preload.cjs'
];
for (const relativePath of sourceFiles) {
  const text = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  if (/trial-config\.json/.test(text)) failures.push(`${relativePath} still references trial-config.json`);
}

const mainSource = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const sharedSource = fs.readFileSync(path.join(projectRoot, 'electron', 'shared.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const webviewSendGuardPreloadSource = fs.readFileSync(path.join(projectRoot, 'electron', 'webview-send-guard-preload.cjs'), 'utf8');
const suiteBuilderSource = fs.readFileSync(path.join(projectRoot, 'electron-builder.client-suite.cjs'), 'utf8');
const licenseSource = fs.readFileSync(path.join(projectRoot, 'electron', 'license-core.ts'), 'utf8');
const clientLicenseSource = fs.readFileSync(path.join(projectRoot, 'electron', 'client-license.ts'), 'utf8');
const issuerSource = fs.readFileSync(path.join(projectRoot, 'electron', 'license-issuer.ts'), 'utf8');
const promptGeneratorSource = fs.readFileSync(path.join(projectRoot, 'electron', 'prompt-generator.ts'), 'utf8');
const suitePackagerSource = fs.readFileSync(path.join(projectRoot, 'tools', 'package-license-suite.cjs'), 'utf8');
const packagedOutputVerifierSource = fs.readFileSync(path.join(projectRoot, 'tools', 'verify-packaged-output.cjs'), 'utf8');
const clientMainBundlerSource = fs.readFileSync(path.join(projectRoot, 'tools', 'bundle-client-main.cjs'), 'utf8');
const enterpriseIconPath = path.join(projectRoot, enterpriseIconSource);
const enterpriseIcon = fs.readFileSync(enterpriseIconPath);
if (
  enterpriseIcon.length < 1024 ||
  enterpriseIcon.readUInt16LE(0) !== 0 ||
  enterpriseIcon.readUInt16LE(2) !== 1
) {
  failures.push('enterprise Windows icon resource is missing or invalid');
}
if (!mainSource.includes(`const windowsPackagedAppUserModelId = '${windowsPackagedAppId}';`)) {
  failures.push('Windows runtime AppUserModelID does not match the installer identity');
}
if (!mainSource.includes("const windowsDeveloperAppUserModelId = 'com.maoyi.translator.developer';")) {
  failures.push('developer Windows identity is not isolated from customer installations');
}
if (!mainSource.includes("const packagedApplicationIconFileName = 'pikachu-translator.ico';")) {
  failures.push('main window does not bind the packaged enterprise icon resource');
}
if (!mainSource.includes('icon: applicationIcon,') || !mainSource.includes('mainWindow.setIcon(applicationIcon)')) {
  failures.push('main BrowserWindow does not explicitly apply the enterprise icon');
}
if (!suiteBuilderSource.includes(`appId: '${windowsPackagedAppId}'`)) {
  failures.push('suite client AppUserModelID does not match the Windows runtime identity');
}
if (!suiteBuilderSource.includes(`icon: '${enterpriseIconSource}'`)) {
  failures.push('suite client builder does not use the enterprise Windows icon');
}
if (
  !suiteBuilderSource.includes(`from: '${enterpriseIconSource}'`) ||
  !suiteBuilderSource.includes(`to: '${enterpriseIconTarget}'`)
) {
  failures.push('suite client package is missing the stable enterprise taskbar icon resource');
}
if (!/prepare-package-signal-runtime\.cjs/.test(suitePackagerSource)) {
  failures.push('full-suite packaging must prepare the sanitized Signal runtime');
}
if (suitePackagerSource.includes("[npmCli, 'run', 'test:signal-control']")) {
  failures.push('full-suite packaging must not roll the source-built Signal runtime back from a legacy backup');
}
if (!suitePackagerSource.includes("['tools/test-signal-control-channel.cjs']")) {
  failures.push('full-suite packaging must directly verify the current source-built Signal runtime');
}
if (
  packagedOutputVerifierSource.indexOf('const signalEntries = await asar.listPackage(signalAsar);') < 0 ||
  packagedOutputVerifierSource.indexOf('const signalEntries = await asar.listPackage(signalAsar);') >
    packagedOutputVerifierSource.indexOf('for (const entry of signalEntries)')
) {
  failures.push('packaged Signal notification verification uses the Signal entry list before initialization');
}
if (!suitePackagerSource.includes("'build:prompt-bundles'")) {
  failures.push('full-suite packaging must rebuild both encrypted prompt bundles with the selected local service key');
}
if (!/\[npmCli,\s*'run',\s*'test:security'\],\s*\{\s*MAOYI_LICENSE_SUITE_PATH:\s*suitePath\s*\}/.test(suitePackagerSource)) {
  failures.push('full-suite security tests must validate prompt bundles against the selected suite identity');
}
if (
  !suitePackagerSource.includes('developmentPromptArtifactSnapshot') ||
  !suitePackagerSource.includes('restoreLocalFiles(developmentPromptArtifactSnapshot)')
) {
  failures.push('full-suite packaging must restore developer prompt bundles after suite signing');
}
if (
  !packagedOutputVerifierSource.includes('baselineProcessIds') ||
  !packagedOutputVerifierSource.includes('terminateNewWindowsProcesses')
) {
  failures.push('packaged startup smoke tests must collect detached portable child processes');
}
if (!clientLicenseSource.includes("'.package-secrets', 'developer-license-suite.json'")) {
  failures.push('developer client must use a dedicated public suite identity');
}
if (clientLicenseSource.includes("'.package-secrets', 'current-license-suite.json'")) {
  failures.push('developer client must not follow the mutable packaging suite identity');
}
if (suitePackagerSource.includes('developer-license-suite.json')) {
  failures.push('full-suite packaging must not read or mutate the developer suite identity');
}
if (/enqueueEnterpriseChatAsset|flushEnterpriseChatAssetQueue/.test(mainSource)) {
  failures.push('automatic enterprise chat asset archival is still reachable');
}
if (/deepseekApiKey\s*:\s*string/.test(sharedSource)) failures.push('renderer-visible AppConfig still exposes the service secret');
if (/\ballowpopups\b/i.test(rendererSource)) failures.push('webview allowpopups is enabled');
if (/localStorage(?:\?|)\.setItem/.test(rendererSource)) {
  failures.push('renderer source writes data to plaintext localStorage');
}
if (!/df\.translationCache\.v1/.test(rendererSource) || !/localStorage\.removeItem/.test(rendererSource)) {
  failures.push('legacy plaintext translation-cache cleanup is missing');
}
if (!/app\.enableSandbox\(\)/.test(mainSource)) failures.push('client process sandbox is not enabled');
if (!/app\.disableHardwareAcceleration\(\)/.test(issuerSource)) failures.push('issuer must use software rendering for portable Windows compatibility');
if (!/app\.disableHardwareAcceleration\(\)/.test(promptGeneratorSource)) failures.push('prompt generator must use software rendering for portable Windows compatibility');
for (const [label, source] of [['issuer', issuerSource], ['prompt generator', promptGeneratorSource]]) {
  if (!source.includes("appendSwitch('disable-gpu')")) {
    failures.push(`${label} must disable hardware GPU acceleration`);
  }
  if (source.includes("appendSwitch('disable-software-rasterizer')")) {
    failures.push(`${label} must retain Chromium software rendering as the GPU fallback`);
  }
}
if (!/assertTrustedIpcSender/.test(mainSource)) failures.push('client IPC sender validation is missing');
if (!clientFiles.includes('electron/webview-send-guard-preload.cjs')) {
  failures.push('early webview Chinese-send guard preload is missing from the default client package');
}
if (!suiteBuilderSource.includes("'electron/webview-send-guard-preload.cjs'")) {
  failures.push('early webview Chinese-send guard preload is missing from the client suite');
}
if (!mainSource.includes('webPreferences.preload = webviewSendGuardPreloadPath')) {
  failures.push('platform webviews do not attach the early Chinese-send guard preload');
}
if (
  !webviewSendGuardPreloadSource.includes("ipcRenderer.sendToHost('df-translator'") ||
  !webviewSendGuardPreloadSource.includes('event.stopImmediatePropagation()') ||
  !webviewSendGuardPreloadSource.includes('if (!event.isTrusted) return;')
) {
  failures.push('early webview Chinese-send guard is missing trusted-event blocking or the authenticated host route');
}
if (!/licenseFormatVersion\s*=\s*2/.test(licenseSource) || !/X25519-HKDF-SHA256\+A256GCM/.test(licenseSource)) {
  failures.push('device-bound license envelope v2 is not enabled');
}
if (!clientFiles.includes('dist-electron/main.js')) failures.push('single bundled main-process entry is missing from the client package');
if (clientFiles.some(file => file.startsWith('dist-electron/') && file !== 'dist-electron/main.js')) failures.push('separate Electron main-process modules must not be included in the client package');
if (!String(packageScripts['package:win'] || '').includes('bundle-client-main.cjs')) failures.push('package:win must bundle and minify the client main process');
if (!suiteBuilderSource.includes("'dist-electron/main.js'")) failures.push('single bundled main-process entry is missing from the client suite');
if (suiteBuilderSource.includes("'dist-electron/storage-migration.js'") || suiteBuilderSource.includes("'dist-electron/client-license.js'")) failures.push('client suite must not expose separate readable main-process modules');
if (!suitePackagerSource.includes("['tools/bundle-client-main.cjs']")) failures.push('full-suite packaging must bundle and minify the client main process');
if (!clientMainBundlerSource.includes('minify: true') || !clientMainBundlerSource.includes('sourcemap: false')) failures.push('client main-process bundler must minify output without source maps');
for (const moduleName of [
  'payment-address.js', 'sensitive-send-authorization.js', 'translation-sensitive-tokens.js',
  'translation-prompt-bundle.js', 'smart-reply-core.js', 'smart-reply-prompt-bundle.js',
  'translation-english-style.js', 'storage-migration.js', 'signal-notification-routing.js',
  'remote-guard.js'
]) {
  if (!mainSource.includes(`'./${moduleName}'`) && !mainSource.includes(`"./${moduleName}"`)) {
    failures.push(`client main process no longer imports required runtime module: ${moduleName}`);
  }
}
if (!packageJson.build?.protocols?.some(entry => entry?.schemes?.includes('maoyi-translator'))) {
  failures.push('default client package does not register the Maoyi notification protocol');
}
if (!suiteBuilderSource.includes("schemes: ['maoyi-translator']")) {
  failures.push('suite client does not register the Maoyi notification protocol');
}
if (!suiteBuilderSource.includes("'.package-secrets/translation-prompts.dfp'")) failures.push('encrypted translation prompt file is missing from the client suite');
if (!suiteBuilderSource.includes("'.package-secrets/smart-reply-prompt.dfp'")) failures.push('encrypted smart-reply prompt file is missing from the client suite');
if (!extraResources.some((resource) => typeof resource === 'object' && resource?.from === '.package-secrets/smart-reply-prompt.dfp' && resource?.to === 'smart-reply-prompt.dfp')) {
  failures.push('encrypted smart-reply prompt file is missing from the standard client package');
}
if (/Suite 006/.test(suitePackagerSource) || /\\u5957\\u88c5 006/.test(suitePackagerSource)) {
  failures.push('full-suite README title is still hard-coded to sequence 006');
}
if (!suitePackagerSource.includes('Suite ${sequence}') || !suitePackagerSource.includes('\\u5957\\u88c5 ${sequence}')) {
  failures.push('full-suite README title does not use the requested sequence');
}
if (/const\s+(?:composerEnglish|messageChinese)SystemPrompt\s*=/.test(mainSource)) failures.push('plaintext translation prompts remain embedded in client source');

if (failures.length) {
  console.error(failures.map((failure) => `SECURITY GATE: ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Security source/package gate passed.');
