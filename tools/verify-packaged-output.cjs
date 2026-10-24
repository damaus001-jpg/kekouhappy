const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const asar = require('@electron/asar');
const { FuseState, FuseV1Options, getCurrentFuseWire } = require('@electron/fuses');

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

function findFile(root, fileName) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return target;
    }
  }
  throw new Error(`${fileName} was not found under ${root}`);
}

function findTopLevelFile(root, pattern, label) {
  const matches = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(root, entry.name));
  if (matches.length !== 1) {
    throw new Error(`${label} expected one top-level delivery EXE, found ${matches.length}.`);
  }
  return matches[0];
}

function collectPaths(root) {
  const paths = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      paths.push(target);
      if (entry.isSymbolicLink()) throw new Error(`Packaged output contains a symbolic link: ${target}`);
      if (entry.isDirectory()) pending.push(target);
    }
  }
  return paths;
}

function hasSensitiveKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:deepseekApiKey|serviceSecret|privateKeyPem|protectedPrivateKey)$/i.test(key)) return true;
    if (hasSensitiveKey(child)) return true;
  }
  return false;
}

function verifyNoForbiddenResources(resources) {
  const forbiddenPatterns = [
    /(?:^|[\\/])trial-config\.json$/i,
    /(?:^|[\\/])license-suite\.sealed$/i,
    /(?:^|[\\/])issuer-suite-key\.json$/i,
    /(?:^|[\\/])current-license-suite\.json$/i,
    /(?:^|[\\/])client-license-suite\.json$/i,
    /(?:^|[\\/])\.package-secrets(?:[\\/]|$)/i,
    /(?:^|[\\/])df-runtime-binding\.dat$/i,
    /(?:^|[\\/])app\.(?:original|patched|before[^\\/]*)\.asar(?:\.unpacked)?(?:[\\/]|$)/i
  ];
  const paths = collectPaths(resources);
  for (const target of paths) {
    const relative = path.relative(resources, target);
    const forbidden = forbiddenPatterns.find((pattern) => pattern.test(relative));
    if (forbidden) throw new Error(`Client package contains forbidden resource: ${relative}`);
  }

  for (const target of paths) {
    if (!target.toLowerCase().endsWith('.json')) continue;
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    try {
      const value = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (hasSensitiveKey(value)) {
        throw new Error(`Client package JSON contains a secret-bearing field: ${path.relative(resources, target)}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
}

function verifyPublicLicenseSuite(resources) {
  const suitePath = path.join(resources, 'license-suite-public.json');
  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
  const expectedKeys = ['issuerId', 'keyId', 'productId', 'promptSigning', 'publicKeyPem', 'suiteId'];
  if (suite.upgradeFrom !== undefined) expectedKeys.push('upgradeFrom');
  expectedKeys.sort();
  const actualKeys = Object.keys(suite).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Public license suite contains unexpected fields: ${actualKeys.join(', ')}`);
  }
  for (const key of ['issuerId', 'keyId', 'productId', 'publicKeyPem', 'suiteId']) {
    if (typeof suite[key] !== 'string' || !suite[key]) throw new Error(`Public license suite field is missing: ${key}`);
  }
  for (const kind of ['translation', 'smartReply']) {
    const identity = suite.promptSigning?.[kind];
    if (
      identity?.suiteId !== suite.suiteId ||
      typeof identity.keyId !== 'string' || !identity.keyId ||
      typeof identity.publicKeyPem !== 'string' || !identity.publicKeyPem ||
      !/^[a-f0-9]{64}$/i.test(identity.publicKeySha256 || '') ||
      identity.privateKeyPem !== undefined
    ) throw new Error(`Public ${kind} prompt signing identity is invalid.`);
  }
  return suite;
}

function verifyEnterpriseWindowsIcon(resources) {
  const iconPath = path.join(resources, 'pikachu-translator.ico');
  const icon = fs.readFileSync(iconPath);
  if (
    icon.length < 1024 ||
    icon.readUInt16LE(0) !== 0 ||
    icon.readUInt16LE(2) !== 1 ||
    icon.readUInt16LE(4) < 6
  ) {
    throw new Error('Client package is missing a valid enterprise Windows icon resource.');
  }
}

function verifySignedPrompt(resources, suite, fileName, kind, identityName) {
  const promptPath = path.join(resources, fileName);
  const stat = fs.statSync(promptPath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size < 128 || stat.size > 192 * 1024) {
    throw new Error(`Client package is missing a valid signed ${kind} prompt resource.`);
  }
  const bundle = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
  const expectedKeys = ['algorithm', 'format', 'keyId', 'kind', 'payload', 'schemaVersion', 'signature', 'suiteId'];
  if (JSON.stringify(Object.keys(bundle).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Signed ${kind} prompt resource contains unexpected fields.`);
  }
  const identity = suite.promptSigning[identityName];
  if (
    bundle.schemaVersion !== 2 ||
    bundle.format !== 'DF-PROMPT-SIGNED' ||
    bundle.algorithm !== 'Ed25519' ||
    bundle.kind !== kind ||
    bundle.suiteId !== suite.suiteId ||
    bundle.keyId !== identity.keyId ||
    typeof bundle.payload !== 'string' || !bundle.payload ||
    typeof bundle.signature !== 'string' || !bundle.signature
  ) throw new Error(`Signed ${kind} prompt resource does not match the client suite.`);
}

async function verifyMaoyiFuses(executablePath) {
  const wire = await getCurrentFuseWire(executablePath);
  const expected = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE]
  ]);
  for (const [option, state] of expected) {
    if (wire[option] !== state) throw new Error(`${path.basename(executablePath)} fuse ${FuseV1Options[option]} is not hardened.`);
  }
}

async function verifySignalFuses(executablePath) {
  const wire = await getCurrentFuseWire(executablePath);
  const expected = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    // Signal 8.18 requires this for bundles/preload/wrapper.js. Disabling it
    // passes a process-alive smoke test but leaves every Signal window white.
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.ENABLE]
  ]);
  for (const [option, state] of expected) {
    if (wire[option] !== state) throw new Error(`Signal.exe fuse ${FuseV1Options[option]} is incompatible with the verified runtime profile.`);
  }
}

async function verifyClient(clientRoot) {
  const executable = findFile(clientRoot, 'maoyi.exe');
  await verifyMaoyiFuses(executable);
  const appRoot = path.dirname(executable);
  const resources = path.join(appRoot, 'resources');
  verifyNoForbiddenResources(resources);
  verifyEnterpriseWindowsIcon(resources);
  const speechModel = path.join(resources, 'local-speech', 'ggml-base-q5_1.bin');
  const speechM4aHelper = path.join(resources, 'local-speech', 'm4a-to-wav.ps1');
  if (!fs.statSync(speechModel, { throwIfNoEntry: false })?.isFile() || fs.statSync(speechModel).size < 50 * 1024 * 1024) {
    throw new Error('Client package is missing the bundled local speech model.');
  }
  const m4aHelperSource = fs.readFileSync(speechM4aHelper, 'utf8');
  if (!m4aHelperSource.includes('$profile.Audio.SampleRate = 16000') || !m4aHelperSource.includes('$profile.Audio.ChannelCount = 1')) {
    throw new Error('Client package is missing the verified local M4A conversion helper.');
  }
  const suite = verifyPublicLicenseSuite(resources);
  verifySignedPrompt(resources, suite, 'translation-prompts.dfp', 'translation', 'translation');
  verifySignedPrompt(resources, suite, 'smart-reply-prompt.dfp', 'smart-reply', 'smartReply');
  const appAsar = path.join(resources, 'app.asar');
  const entries = await asar.listPackage(appAsar);
  for (const forbidden of [/license-issuer/i, /trial-config/i, /issuer-suite-key/i, /license-suite\.sealed/i]) {
    if (entries.some((entry) => forbidden.test(entry))) throw new Error(`Client app.asar contains forbidden entry matching ${forbidden}.`);
  }
  const clientMainEntry = entries.find((entry) => /(?:^|[\\/])dist-electron[\\/]main\.js$/.test(entry));
  if (!clientMainEntry) throw new Error('Client app.asar is missing the bundled main process.');
  if (entries.some((entry) => /(?:^|[\\/])dist-electron[\\/].+\.map$/.test(entry))) {
    throw new Error('Client app.asar contains Electron main-process source maps.');
  }
  const unbundledMainModules = /(?:profile-data-cleanup|signal-notification-routing|client-license|license-core|assistant-library|translation-prompt-bundle|smart-reply-prompt-bundle|storage-migration)\.js$/i;
  if (entries.some((entry) => /(?:^|[\\/])dist-electron[\\/]/.test(entry) && unbundledMainModules.test(entry))) {
    throw new Error('Client app.asar contains separate readable main-process modules instead of the single bundle.');
  }
  const bundledMain = Buffer.from(await asar.extractFile(appAsar, clientMainEntry.replace(/^[/\\]/, ''))).toString('utf8');
  if (/sourceMappingURL|from\s*["']\.\//.test(bundledMain)) {
    throw new Error('Client main-process bundle exposes a source map or relative internal module imports.');
  }
  const signalExecutable = path.join(resources, 'signal', 'Signal.exe');
  await verifySignalFuses(signalExecutable);
  const signalAsar = path.join(resources, 'signal', 'resources', 'app.asar');
  const signalAsarHeaderHash = crypto.createHash('sha256')
    .update(asar.getRawHeader(signalAsar).headerString)
    .digest('hex');
  if (!fs.readFileSync(signalExecutable).includes(Buffer.from(signalAsarHeaderHash, 'utf8'))) {
    throw new Error('Bundled Signal.exe embedded app.asar header hash does not match the bundled app.asar.');
  }
  const signalMain = Buffer.from(await asar.extractFile(signalAsar, 'bundles/main.js')).toString('utf8');
  const signalEntries = await asar.listPackage(signalAsar);
  let hasMaoyiNotificationActivation = false;
  let hasMaoyiNotificationRegistration = false;
  for (const entry of signalEntries) {
    const normalized = entry.replace(/^[\\/]+/, '');
    if (!/(?:^|[\\/])bundles[\\/].+\.js$/.test(normalized)) continue;
    const source = Buffer.from(await asar.extractFile(signalAsar, normalized)).toString('utf8');
    hasMaoyiNotificationActivation ||= source.includes('maoyi-translator://signal-notification/v1/');
    hasMaoyiNotificationRegistration ||= source.includes('notification.route.register');
    if (hasMaoyiNotificationActivation && hasMaoyiNotificationRegistration) break;
  }
  if (!hasMaoyiNotificationActivation || !hasMaoyiNotificationRegistration) {
    throw new Error('Bundled Signal notifications can still bypass the Maoyi activation route.');
  }
  const bridgeEntry = signalEntries.find((entry) => /(?:^|[\\/])bundles[\\/]chunks[\\/]messageBridge\.main-[^\\/]+\.js$/.test(entry));
  const signalBridge = bridgeEntry
    ? Buffer.from(await asar.extractFile(signalAsar, bridgeEntry.replace(/^[/\\]/, ''))).toString('utf8')
    : signalMain;
  const preloadEntry = signalEntries.find(entry => entry.replace(/\\/g, '/').replace(/^\//, '') === 'bundles/preload/main.js');
  if (!preloadEntry) throw new Error('Bundled Signal is missing its translation preload.');
  const signalPreload = Buffer.from(await asar.extractFile(signalAsar, preloadEntry.replace(/^[/\\]/, ''))).toString('utf8');
  const signalProjectionEntry = signalEntries.find((entry) => /(?:^|[\\/])bundles[\\/]chunks[\\/]messageBridgeChannels\.std-[^\\/]+\.js$/.test(entry));
  const signalProjection = signalProjectionEntry
    ? Buffer.from(await asar.extractFile(signalAsar, signalProjectionEntry.replace(/^[/\\]/, ''))).toString('utf8')
    : '';
  if (!signalProjection.includes('isCurrentLocalCalendarDay') || !signalProjection.includes('.slice(-18)')) {
    throw new Error('Bundled Signal GPT context is missing the current-day 18-message selector.');
  }
  for (const marker of ['resyncConversation', 'resetRefreshState']) {
    if (!signalBridge.includes(marker) || !signalPreload.includes(marker)) {
      throw new Error(`Bundled Signal is missing translation recovery: ${marker}`);
    }
  }
  if (!signalPreload.includes('翻译超时，请点击重试')) {
    throw new Error('Bundled Signal is missing translation refresh timeout recovery.');
  }
  if (!signalBridge.includes('maoyi-signal-control-auth-v1') && !signalMain.includes('__dfSignalControlAuthV1')) {
    throw new Error('Bundled Signal is missing authenticated control protocol.');
  }
  let launcherGuarded = signalMain.includes('dfLaunchPipe') && signalMain.includes('local-direct-blocked') && signalMain.includes('credential-accepted');
  if (!launcherGuarded && signalEntries.some((entry) => /(?:^|[\\/])df-bootstrap\.cjs$/.test(entry))) {
    const signalGuard = Buffer.from(await asar.extractFile(signalAsar, 'df-bootstrap.cjs')).toString('utf8');
    launcherGuarded = signalGuard.includes('credential.controlKey');
  }
  if (!launcherGuarded) throw new Error('Bundled Signal guard is missing the launcher credential binding.');
  return executable;
}

async function verifyIssuer(issuerRoot, expectedSuiteId) {
  const runtimeExecutable = findFile(issuerRoot, 'MAOYI AUTHORIZER.exe');
  await verifyMaoyiFuses(runtimeExecutable);
  const appAsar = path.join(path.dirname(runtimeExecutable), 'resources', 'app.asar');
  const entries = await asar.listPackage(appAsar);
  if (entries.some((entry) => /trial-config/i.test(entry))) throw new Error('Issuer app.asar contains trial-config data.');
  const identity = JSON.parse(asar.extractFile(appAsar, 'dist-electron/issuer-suite-key.json').toString('utf8'));
  if (
    !/^\d{9}$/.test(identity.suiteId || '') ||
    identity.suiteId !== expectedSuiteId ||
    !identity.keyId ||
    !/^[a-f0-9]{64}$/i.test(identity.publicKeySha256 || '')
  ) throw new Error('Issuer app.asar is missing the expected suite-scoped identity.');
  return findTopLevelFile(issuerRoot, /^MAOYI-AUTHORIZER-[\d.]+\.exe$/i, 'Issuer');
}

async function verifyPromptGenerator(promptGeneratorRoot, expectedSuiteId) {
  const runtimeExecutable = findFile(promptGeneratorRoot, 'maoyi\u63d0\u793a\u8bcd\u6587\u4ef6\u751f\u6210\u5668.exe');
  await verifyMaoyiFuses(runtimeExecutable);
  const appAsar = path.join(path.dirname(runtimeExecutable), 'resources', 'app.asar');
  const entries = await asar.listPackage(appAsar);
  for (const forbidden of [/client-license-suite/i, /current-license-suite/i, /license-suite\.sealed/i, /issuer-suite-key/i, /privateKeyPem/i]) {
    if (entries.some((entry) => forbidden.test(entry))) {
      throw new Error(`Prompt generator app.asar contains forbidden entry matching ${forbidden}.`);
    }
  }
  const signingPath = path.join(path.dirname(runtimeExecutable), 'resources', 'prompt-signing-private.json');
  const signing = JSON.parse(fs.readFileSync(signingPath, 'utf8'));
  if (
    signing.schemaVersion !== 1 ||
    signing.suiteId !== expectedSuiteId ||
    signing.identity?.suiteId !== expectedSuiteId ||
    signing.keyId !== signing.identity?.keyId ||
    !signing.identity?.privateKeyPem ||
    signing.smartReply !== undefined ||
    signing.identity?.kind === 'smart-reply'
  ) throw new Error('Prompt generator translation signing identity is invalid or cross-scoped.');
  return findTopLevelFile(
    promptGeneratorRoot,
    /^MAOYI-PROMPT-GENERATOR-[\d.]+\.exe$/i,
    'Prompt generator'
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listWindowsProcessIdsByImageName(imageName) {
  if (process.platform !== 'win32' || !imageName) return new Set();
  try {
    const output = execFileSync(
      'tasklist.exe',
      ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const ids = new Set();
    for (const line of output.split(/\r?\n/u)) {
      const match = line.match(/^"[^"]*","(\d+)"/u);
      if (match) ids.add(Number(match[1]));
    }
    return ids;
  } catch {
    return new Set();
  }
}

function terminateNewWindowsProcesses(imageName, baselineProcessIds) {
  if (process.platform !== 'win32' || !imageName) return;
  for (const processId of listWindowsProcessIdsByImageName(imageName)) {
    if (baselineProcessIds.has(processId)) continue;
    try {
      execFileSync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } catch {
      // The tested child may have exited between tasklist and taskkill.
    }
  }
}

async function verifyExecutableStarts(
  executable,
  label,
  userDataEnvironmentName = '',
  forceSoftwareRendering = false,
  packagedProcessImageName = ''
) {
  const breakpointExitCode = 0x80000003;
  const maximumAttempts = 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    // Portable electron-builder launchers detach the extracted application.
    // taskkill /T on the launcher cannot reliably collect that child, so keep
    // an exact baseline and only terminate matching PIDs created by this test.
    const baselineProcessIds = listWindowsProcessIdsByImageName(packagedProcessImageName);
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'maoyi-package-smoke-'));
    let child;
    let stderr = '';
    try {
      // Match a normal desktop launch. Logging only captures a bounded failure
      // diagnostic and does not add renderer/debugging privileges.
      child = spawn(executable, [
        `--user-data-dir=${userData}`,
        ...(forceSoftwareRendering ? ['--disable-gpu'] : [])
      ], {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: false,
        env: {
          ...process.env,
          ELECTRON_ENABLE_LOGGING: '1',
          ...(userDataEnvironmentName ? { [userDataEnvironmentName]: userData } : {})
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4096);
      });
      const launchError = new Promise((_, reject) => child.once('error', reject));
      await Promise.race([delay(6_000), launchError]);
      if (child.exitCode === null) return;
      if (child.exitCode !== breakpointExitCode || attempt === maximumAttempts) {
        const diagnostic = stderr.trim() ? ` Diagnostic: ${stderr.trim()}` : '';
        throw new Error(`${label} exited during the packaged startup smoke test with code ${child.exitCode}.${diagnostic}`);
      }
      console.warn(`${label} hit a transient STATUS_BREAKPOINT during startup; retrying once with a fresh profile.`);
    } finally {
      if (child?.pid) {
        try {
          execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } catch {
          child.kill();
        }
      }
      await delay(750);
      terminateNewWindowsProcesses(packagedProcessImageName, baselineProcessIds);
      await delay(500);
      try {
        fs.rmSync(userData, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
      } catch (error) {
        // A successful startup must not be reported as failed only because Windows
        // is still releasing a Chromium profile file. The directory is temporary.
        console.warn(`packaged-output: could not remove smoke directory ${userData}: ${error.code || error}`);
      }
    }
    await delay(2_000);
  }
}

async function main() {
  if (!argument('client')) throw new Error('--client is required.');
  const expectedSuiteId = argument('suite-id');
  if (argument('issuer') && !/^\d{9}$/.test(expectedSuiteId)) {
    throw new Error('--suite-id is required and must contain nine digits when verifying an issuer.');
  }
  const clientRoot = path.resolve(argument('client'));
  const clientExecutable = await verifyClient(clientRoot);
  const issuerExecutable = argument('issuer')
    ? await verifyIssuer(path.resolve(argument('issuer')), expectedSuiteId)
    : '';
  const promptGeneratorExecutable = argument('prompt-generator')
    ? await verifyPromptGenerator(path.resolve(argument('prompt-generator')), expectedSuiteId)
    : '';
  if (process.env.MAOYI_PACKAGE_SKIP_STARTUP === '1') {
    console.log('packaged-output: requested artifacts passed security checks; startup checks skipped by request');
    return;
  }
  if (issuerExecutable) {
    await verifyExecutableStarts(
      issuerExecutable,
      'Issuer',
      'MAOYI_ISSUER_USER_DATA_DIR',
      true,
      'MAOYI AUTHORIZER.exe'
    );
  }
  if (promptGeneratorExecutable) {
    await delay(1_500);
    await verifyExecutableStarts(
      promptGeneratorExecutable,
      'Prompt generator',
      '',
      true,
      'maoyi提示词文件生成器.exe'
    );
  }
  // The client owns a much larger Chromium tree plus the bundled Signal
  // runtime. Kill it last so its asynchronous Windows/GPU teardown cannot
  // contaminate startup checks for the two small internal tools.
  await delay(1_500);
  await verifyExecutableStarts(
    clientExecutable,
    'Client',
    'MAOYI_USER_DATA_DIR',
    false,
    'maoyi.exe'
  );
  console.log('packaged-output: requested artifacts passed security checks');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
