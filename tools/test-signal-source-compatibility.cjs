const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readBuffer = relativePath => fs.readFileSync(path.join(root, relativePath));
const defaultBaselineVersion = '8.17.0';
const supportedBaselines = Object.freeze({
  '8.17.0': 'B692DD94A5CBE9AC7969B0FF0C51B4DA05B2CE82B5F055A6264889251901CD57',
  '8.18.0': '38AF0DA1AEC1CEC40C44173F53DC68E6C835F0A94F974A8A8D2824B5FC3B43FE'
});

function selectBaselineVersion(argv) {
  if (argv.length === 0) return defaultBaselineVersion;
  if (argv.length !== 2 || argv[0] !== '--version') {
    throw new Error('Usage: node tools/test-signal-source-compatibility.cjs [--version <8.17.0|8.18.0>]');
  }
  const version = argv[1];
  if (!Object.hasOwn(supportedBaselines, version)) {
    throw new Error(`Unsupported Signal source baseline version: ${version}`);
  }
  return version;
}

const baselineVersion = selectBaselineVersion(process.argv.slice(2));
const versionDirectory = `v${baselineVersion}`;
const contract = JSON.parse(read(`signal-source/compatibility/${versionDirectory}.json`));
const baselineManifest = JSON.parse(read(`signal-source/baselines/${versionDirectory}.json`));

assert.deepEqual(
  baselineManifest.build.installArgs,
  ['pnpm', 'install', '--offline', '--frozen-lockfile'],
  'Signal dependency installation must never probe the network'
);
assert.equal(
  baselineManifest.build.electronArchiveSha256,
  '01889FF05A2852B86F34E274F0FD7DC41F31CCC500A8D4E07D43F4984B8CEC9A'
);
const experimentScript = read('tools/signal-source-experiment.cjs');
for (const marker of [
  "COREPACK_ENABLE_NETWORK: '0'",
  'checkOfflineWindowsBuildInputs',
  'Electron archive cache',
  'Electron native headers',
  'Writable offline pnpm store',
  'quoteWindowsCommandArgument',
  'MAOYI_SIGNAL_SOURCE_REUSE_DEPENDENCIES',
  'Reusable Signal dependency lock does not match the exact source lock',
  'electron:install-app-deps',
  "'@signalapp/windows-ucv'",
  "'--publish'",
  "'--config.electronDist'",
  'path.relative(sourcePath, electronArchivePath)',
  'only final release packaging will run'
]) {
  assert.ok(experimentScript.includes(marker), `missing offline build marker: ${marker}`);
}

assert.equal(contract.schemaVersion, 1);
assert.equal(contract.baseline, baselineVersion);
assert.equal(contract.referenceDelivery, '003');
assert.equal(contract.targetDelivery, '006');
assert.equal(contract.rules.referenceDeliveryIsUpgradeTarget, false);
assert.equal(contract.rules.preserveReferenceCapabilities, true);
assert.equal(contract.rules.launcherOnly, true);
assert.equal(contract.rules.launcherProductName, 'maoyi');
assert.equal(contract.rules.localDirectLaunchAction, 'block-without-reset');
assert.equal(contract.rules.foreignWholeFolderLaunchAction, 'full-data-root-reset-before-signal-load');
assert.equal(contract.rules.officialSignalFallback, false);
assert.equal(contract.rules.replaceCurrentRuntimeBeforeAcceptance, false);

const requiredCapabilities = [
  'launcher-only-start',
  'local-direct-block-without-reset',
  'foreign-whole-folder-full-reset',
  'guard-before-account-database',
  'no-official-signal-fallback',
  'profile-data-isolation',
  'authenticated-control-channel',
  'window-show-hide-bounds-shutdown-heartbeat',
  'english-bubble-to-chinese',
  'chinese-composer-to-english',
  'encrypted-cache-restoration',
  'signal-a-b-a-cache-restoration',
  'unread-notification-bridge',
  'event-driven-window-sync-without-800ms-polling',
  'typed-command-bridge',
  'windows-owner-window',
  'main-process-lock-visibility-gate'
];
if (baselineVersion === '8.18.0') {
  requiredCapabilities.splice(
    requiredCapabilities.indexOf('main-process-lock-visibility-gate'),
    0,
    'windows-owner-chain-fail-closed'
  );
  requiredCapabilities.push('source-message-added-live-translation');
  requiredCapabilities.push('source-bubble-manual-refresh');
  requiredCapabilities.push('source-native-smart-reply-request');
  requiredCapabilities.push('source-media-caption-translation');
  requiredCapabilities.push('source-long-message-translation');
  requiredCapabilities.push('source-native-composer-review');
  requiredCapabilities.push('source-deterministic-window-presentation');
  requiredCapabilities.push('source-dark-window-background');
  requiredCapabilities.push('source-outgoing-text-and-hidden-input-guard');
  requiredCapabilities.push('source-notification-activation-routed-through-launcher');
}
const capabilityIds = contract.capabilities.map(item => item.id);
assert.deepEqual(capabilityIds, requiredCapabilities);

const patchSeriesDirectory = `signal-source/patches/${versionDirectory}`;
const patchSeries = JSON.parse(read(`${patchSeriesDirectory}/series.json`));
assert.equal(patchSeries.schemaVersion, 1);
assert.equal(patchSeries.baseline, baselineVersion);
const expectedPatchSeries = [
  {
    file: '0001-maoyi-launcher-startup-guard.patch',
    sha256: 'BF51154AB6A72B80D255EFA0A9A361F4F83F572D17D5A248667CA25A0520F8D8'
  },
  {
    file: '0002-maoyi-typed-control-bridge.patch',
    sha256: 'E4268FA2FAE0FBAEEA6ABF463C5A91CACD0F917E43C82211DA30DF76DB83B632'
  },
  {
    file: '0003-maoyi-window-security-controller.patch',
    sha256: baselineVersion === '8.18.0'
      ? '2737648A3D828DED0F9DA316B915EB4620971802D3E4E092B1760EE120E4CCC9'
      : '78CDC75C460C6CC398585FCECF51FD74556F01E32CBC37E3D4D22C337E0685CD'
  }
];
if (baselineVersion === '8.18.0') {
  expectedPatchSeries.push({
    file: '0004-maoyi-source-translation-cache-bridge.patch',
    sha256: 'E1A261466D7D9F6C38896C7236C9E27067871320123F0BE86EE00A09ADF8F7A8'
  });
  expectedPatchSeries.push({
    file: '0005-maoyi-realtime-message-translation.patch',
    sha256: '43B1CBDDF3E1A9C5CDBD0B03EAA33BC464D63A214880D26F495045635823DFD6'
  });
  expectedPatchSeries.push({
    file: '0006-maoyi-source-bubble-refresh.patch',
    sha256: '1E124603EC29EFE3F4B4090D70DCC9F891F48D253C5ED174CD6668B0B4A8E7A6'
  });
  expectedPatchSeries.push({
    file: '0007-maoyi-incoming-auto-translation-stability.patch',
    sha256: 'F260FAC184A6080E4055CF2BEA8205987841430B8DCF4E834DD0081594656B02'
  });
  expectedPatchSeries.push({
    file: '0008-maoyi-source-smart-reply-request.patch',
    sha256: '579BBE111DBF5D81018C7016F74FD10E3BD1498A4BE2920FE009B6D70D83FC91'
  });
  expectedPatchSeries.push({
    file: '0009-maoyi-refresh-real-state.patch',
    sha256: '848B7A1E90E9C86A17F1343BB47ECF782817D2E1EE60C26172A418D2EEC2BCBC'
  });
  expectedPatchSeries.push({
    file: '0010-maoyi-media-caption-translation.patch',
    sha256: '6FA5F0C6DA1A72ADE4BABE6C080286FD78319270B8A453E012C192C285249071'
  });
  expectedPatchSeries.push({
    file: '0011-maoyi-long-message-translation.patch',
    sha256: '1E857B05B9C75C5980432AA02131CE327B12C979A8E2C517B103BA646AAD78B8'
  });
  expectedPatchSeries.push({
    file: '0012-maoyi-source-composer-review.patch',
    sha256: '91EDDC177148B77F414794852824E3636000DC424D8AA761E38F04F994B1A89B'
  });
  expectedPatchSeries.push({
    file: '0013-maoyi-dark-window-background.patch',
    sha256: '0A50854993F2127CC2C8661131E84FC0E587373AE5A139358D6F94BAFEC897A8'
  });
  expectedPatchSeries.push({
    file: '0014-maoyi-deterministic-window-presentation.patch',
    sha256: '4B4AD98E8E2459737090E9CDD71ACA8137ECD36F1EE93D361C5EF5DFA3E8F89E'
  });
  expectedPatchSeries.push({
    file: '0015-maoyi-owner-chain-fail-closed.patch',
    sha256: '601C73FF60B4B36FDA8A3EFF8646B54232598BCFB205AA15A47080CBCD296DD6'
  });
  expectedPatchSeries.push({
    file: '0016-maoyi-three-incoming-smart-reply-anchors.patch',
    sha256: '412F1915C7E58208AD140BBE8F80A75760361AA45F60004BB495686EE569A607'
  });
  expectedPatchSeries.push({
    file: '0017-maoyi-hidden-input-and-chinese-send-guard.patch',
    sha256: 'F2FFFB502466D362932B6E5CE1463B1CE7A93B6164A7D51F3D1654FCC2D36809'
  });
  expectedPatchSeries.push({
    file: '0018-maoyi-notification-activation-routing.patch',
    sha256: '8E35A4A99A160382004F2074E6745D7DFB41F0755B8E91DBE99176A73B6B8BCB'
  });
  expectedPatchSeries.push({
    file: '0019-maoyi-whatsapp-dark-bubble-colors.patch',
    sha256: '80ED6A370986444E3874801DD0E1D03D034DED7880291FC7B3F169018C53A533'
  });
  expectedPatchSeries.push({
    file: '0020-maoyi-preserve-translations-on-ordinary-hide.patch',
    sha256: '7F09D27A8282D4066EBAC6E1A7E67760AD93AF9E6D6CB4CD59422A914632DBBE'
  });
  expectedPatchSeries.push({
    file: '0021-maoyi-translation-letter-spacing.patch',
    sha256: 'C729AB8EE716F2A85AB9A7162DF49A30BBB713A733832EFFD399326B41A64DB2'
  });
  expectedPatchSeries.push({
    file: '0022-maoyi-refresh-without-translation.patch',
    sha256: '199F14510C60C57653677F7C903E93EF8FB5D73805140244DDEB910EFB6E63F1'
  });
  expectedPatchSeries.push({
    file: '0023-maoyi-translation-recovery.patch',
    sha256: '53327F562599C71BF9A9616E733CEB1EB2529C647BFE1F94D74CAEE9169AC668'
  });
}
assert.deepEqual(patchSeries.patches, expectedPatchSeries);

for (const entry of patchSeries.patches) {
  const patchSha256 = crypto
    .createHash('sha256')
    .update(readBuffer(`${patchSeriesDirectory}/${entry.file}`))
    .digest('hex')
    .toUpperCase();
  assert.equal(patchSha256, entry.sha256, `patch SHA-256 mismatch: ${entry.file}`);
}
const patchSetSha256 = crypto.createHash('sha256').update(JSON.stringify({
  schemaVersion: patchSeries.schemaVersion,
  baseline: patchSeries.baseline,
  patches: patchSeries.patches.map(entry => ({ file: entry.file, sha256: entry.sha256 }))
})).digest('hex').toUpperCase();
assert.equal(
  patchSetSha256,
  supportedBaselines[baselineVersion],
  `unapproved Signal ${baselineVersion} patch set`
);

const startupPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[0].file}`);
if (baselineVersion === '8.18.0') {
  const darkBubblePatch = read(
    `${patchSeriesDirectory}/0019-maoyi-whatsapp-dark-bubble-colors.patch`
  );
  assert.match(darkBubblePatch, /\.light-theme \.module-message__container--outgoing/);
  assert.match(darkBubblePatch, /background-color: #2c6bed !important;/);
  assert.match(darkBubblePatch, /\.light-theme \.module-message__container--incoming/);
  assert.match(darkBubblePatch, /background-color: #e9e9e9 !important;/);
  assert.match(darkBubblePatch, /\.dark-theme \.module-message__container--outgoing/);
  assert.match(darkBubblePatch, /background-color: #144d37 !important;/);
  assert.match(darkBubblePatch, /background-image: none !important;/);
  assert.match(darkBubblePatch, /\.dark-theme \.module-message__container--incoming/);
  assert.match(darkBubblePatch, /background-color: #242626 !important;/);
  assert.doesNotMatch(
    darkBubblePatch,
    /-\s+background-color: variables\.\$color-(?:ultramarine|gray-75);/,
    'the dark bubble patch must not replace Signal light/default source declarations'
  );
  const translationSpacingPatch = read(
    `${patchSeriesDirectory}/0021-maoyi-translation-letter-spacing.patch`
  );
  assert.match(
    translationSpacingPatch,
    /\.module-message__maoyi-translation[\s\S]*?letter-spacing: 0\.3px;/,
    'Signal source translations must use the same 0.3px Chinese spacing as web translations'
  );
  assert.match(
    translationSpacingPatch,
    /border-block-start: 1px solid #d8c081;/,
    'Signal source translations must use the refresh-window text color separator'
  );
}
for (const expected of [
  'app/maoyi/bootstrap.main.ts',
  'app/maoyi/launchGuard.main.ts',
  'credential-accepted',
  'signal-main.js',
  'isMaoyiEmbedLaunch() || app.requestSingleInstanceLock()',
  'updatesEnabled: false'
]) {
  assert.ok(startupPatch.includes(expected), `missing startup source-patch marker: ${expected}`);
}

const bridgePatch = read(`${patchSeriesDirectory}/${patchSeries.patches[1].file}`);
for (const expected of [
  'app/maoyi/controlBridge.main.ts',
  'app/maoyi/controlProtocol.main.ts',
  'maoyi-signal-control-auth-v1',
  'maoyi-signal-control-message-v1',
  'main-to-signal',
  'signal-to-main',
  'verifyMaoyiLauncherEnvelope'
]) {
  assert.ok(bridgePatch.includes(expected), `missing typed-bridge source-patch marker: ${expected}`);
}

const windowSecurityPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[2].file}`);
for (const expected of [
  'app/maoyi/windowController.main.ts',
  'app/maoyi/windowsOwner.node.ts',
  'security.visibility-applied',
  'window.owner-attached',
  'GWLP_HWNDPARENT',
  'GetWindowThreadProcessId',
  'skipTaskbar: true',
  'maoyiWindowController?.markRuntimeReady()',
  "case 'script.execute'"
]) {
  assert.ok(windowSecurityPatch.includes(expected), `missing window-security source-patch marker: ${expected}`);
}

if (baselineVersion === '8.18.0') {
  const presentationPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[13].file}`);
  for (const expected of [
    "type: 'window.present'",
    "type: 'window.presentation-applied'",
    'const presentMainWindow',
    'originals.show()',
    'originals.moveTop()',
    'mainWindow.webContents.invalidate()',
    'const ownerMatches =',
    'ownerDescriptor?.handle === command.handle',
    '!ownerAttached',
    'requestId: command.requestId'
  ]) {
    assert.ok(
      presentationPatch.includes(expected),
      `missing Signal native presentation marker: ${expected}`
    );
  }
  assert.ok(
    !presentationPatch.includes('+      rawHide(mainWindow);') &&
      !presentationPatch.includes('+      originals.focus();'),
    'Signal native presentation must not hide first or explicitly steal focus from its owner'
  );
  const ownerChainPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[14].file}`);
  for (const expected of [
    'const rejectOwner',
    'attachOwnerToAuxiliaryWindows',
    'verifyMaoyiWindowOwner',
    'Napi::Value HasWindowOwner',
    'GetWindow(child, GW_OWNER) == owner'
  ]) {
    assert.ok(ownerChainPatch.includes(expected), `missing Signal owner-chain marker: ${expected}`);
  }
  const nativeOwnerVerification = ownerChainPatch.slice(
    ownerChainPatch.indexOf('Napi::Value HasWindowOwner'),
    ownerChainPatch.indexOf('Napi::Object Init')
  );
  assert.ok(
    !nativeOwnerVerification.includes('SetWindowLongPtrW') &&
      !nativeOwnerVerification.includes('SetWindowPos'),
    'Signal owner verification must not mutate the native window relationship or z-order'
  );
  const darkWindowPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[12].file}`);
  assert.ok(
    darkWindowPatch.includes("backgroundColor: '#08090d'"),
    'Signal 8.18 embed windows must retain a dark native background while Chromium redraws'
  );
  assert.ok(
    !darkWindowPatch.includes('beginFrameSubscription') &&
      !darkWindowPatch.includes('surface-not-ready'),
    'the dark native background patch must not restore the hidden-frame presentation gate'
  );
  const translationCachePatch = read(`${patchSeriesDirectory}/${patchSeries.patches[3].file}`);
  for (const expected of [
    'app/maoyi/messageBridge.main.ts',
    'ts/maoyi/messageBridge.preload.ts',
    'ts/maoyi/translationRuntime.preload.ts',
    'message.visibleBatch',
    'translation.cacheResultBatch',
    'module-message__maoyi-translation'
  ]) {
    assert.ok(
      translationCachePatch.includes(expected),
      `missing translation-cache source-patch marker: ${expected}`
    );
  }
  const realtimeMessagePatch = read(`${patchSeriesDirectory}/${patchSeries.patches[4].file}`);
  for (const expected of [
    'ts/maoyi/messageAddedObserver.std.ts',
    'message.added',
    'MESSAGES_ADDED',
    'MaoyiAddedMessageLedger',
    'publishMaoyiAddedMessage'
  ]) {
    assert.ok(
      realtimeMessagePatch.includes(expected),
      `missing realtime-message source-patch marker: ${expected}`
    );
  }
  const bubbleRefreshPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[5].file}`);
  for (const expected of [
    'translation.refresh.request',
    'requestMaoyiTranslationRefresh',
    'module-message__maoyi-translation-refresh',
    'module-message__maoyi-translation-tail',
    '{this.renderMaoyiTranslationRefresh()}',
    'const characters = Array.from(maoyiTranslationText)',
    "const lastCharacter = characters.pop() ?? ''",
    'margin: 0 0 0 3px',
    'color: #0b7654',
    'color: #f8fbff',
    'sourceBubbleRefreshContract_test.node.ts'
  ]) {
    assert.ok(
      bubbleRefreshPatch.includes(expected),
      `missing source-bubble-refresh patch marker: ${expected}`
    );
  }
  assert.ok(
    !bubbleRefreshPatch.includes('module-message__maoyi-translation-footer'),
    'source-bubble-refresh patch must not restore the old footer row'
  );
  const refreshStatePatch = read(`${patchSeriesDirectory}/${patchSeries.patches[8].file}`);
  for (const expected of [
    'translation.refresh.status',
    'MaoyiTranslationRefreshLedger',
    'useMaoyiTranslationRefreshPending',
    "maoyiTranslationRefreshPending ? '...' : '↻'",
    'aria-busy={maoyiTranslationRefreshPending || undefined}',
    'disabled={maoyiTranslationRefreshPending}',
    'refreshState_test.node.ts'
  ]) {
    assert.ok(
      refreshStatePatch.includes(expected),
      `missing real refresh-state patch marker: ${expected}`
    );
  }
  const incomingStabilityPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[6].file}`);
  for (const expected of [
    'message.contact.length > 0',
    'conversationEpoch',
    'does not drop a queued added message',
    'decoded empty contact list'
  ]) {
    assert.ok(
      incomingStabilityPatch.includes(expected),
      `missing incoming-stability patch marker: ${expected}`
    );
  }
  const smartReplyPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[7].file}`);
  for (const expected of [
    'smartReply.request',
    'smartReply.result',
    'smartReply.error',
    'requestMaoyiSmartReply',
    'module-message__maoyi-smart-reply',
    '+  @include mixins.font-body-2;',
    '+        applyMaoyiSmartReplyPending(message);',
    '+        pendingSmartReplies.clear();',
    "maoyiSmartReplyPending ? '生成中...' : '智能回复'",
    'sourceSmartReplyContract_test.node.ts',
    'writeMaoyiSmartReplyToComposer'
  ]) {
    assert.ok(
      smartReplyPatch.includes(expected),
      `missing source-smart-reply patch marker: ${expected}`
    );
  }
  assert.ok(
    !smartReplyPatch.includes('+  @include mixins.font-body-2-bold;'),
    'the native Signal smart-reply button label must use regular weight'
  );
  const mediaCaptionPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[9].file}`);
  for (const expected of [
    'hasTranslatableMediaCaptionPayload',
    "contentType?.startsWith('image/')",
    "contentType?.startsWith('video/')",
    'adds English image and video captions to the existing text projection',
    "text: 'Ordinary message'",
    "attachments: [{ contentType: 'audio/mpeg' }]",
    "attachments: [{ contentType: 'application/pdf' }]"
  ]) {
    assert.ok(
      mediaCaptionPatch.includes(expected),
      `missing media-caption translation patch marker: ${expected}`
    );
  }
  const outgoingTextGuardPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[16].file}`);
  for (const expected of [
    'window.setFocusable(false)',
    'window.setFocusable(true)',
    'assertMaoyiOutgoingTextAllowed(body)',
    'containsMaoyiBlockedChineseText(',
    '/\\p{Script=Han}/u',
    'blocks Chinese and mixed Chinese/English text before send',
    'allows reviewed English and standalone URLs'
  ]) {
    assert.ok(
      outgoingTextGuardPatch.includes(expected),
      `missing hidden-input/outgoing-text guard patch marker: ${expected}`
    );
  }
  const notificationActivationPatch = read(`${patchSeriesDirectory}/${patchSeries.patches[17].file}`);
  for (const expected of [
    "randomBytes(32).toString('base64url')",
    "type: 'notification.route.register'",
    'maoyi-translator://signal-notification/v1/',
    'getWindowsNotificationSignalRoute',
    'assert.notInclude(xml, \'sgnl://\')'
  ]) {
    assert.ok(
      notificationActivationPatch.includes(expected),
      `missing notification activation routing marker: ${expected}`
    );
  }
}

const sourceExperimentTool = read('tools/signal-source-experiment.cjs');
const runtimePatcher = read('tools/patch-signal-control-channel.cjs');
assert.match(runtimePatcher, /source-developer-data-root/);
assert.match(runtimePatcher, /source-window-surface-invalidation/);
assert.match(runtimePatcher, /webContents\.invalidate/);
assert.match(runtimePatcher, /sourceNativeSurfaceMarkers\.every/);
assert.match(runtimePatcher, /sourceNativeLongMessageMarkers\.every/);
assert.match(runtimePatcher, /e\.show\(\),e\.moveTop\(\),s\.webContents\.invalidate\(\)/);
assert.match(runtimePatcher, /text\/x-signal-plain/);
assert.match(runtimePatcher, /maoyi developer data/);
assert.match(runtimePatcher, /marker is missing or ambiguous/);
assert.ok(sourceExperimentTool.includes('GIT_CEILING_DIRECTORIES'));

const guard = read('signal-guard/df-bootstrap.cjs');
const guardRuntime = require(path.join(root, 'signal-guard', 'df-bootstrap.cjs'));
const developerDataRoot = path.resolve('D:\\Fixture', 'maoyi Developer Data');
const developerProfileId = '00000000-0000-4000-8000-000000000001';
assert.equal(guardRuntime.isOwnedDataRoot(developerDataRoot), true);
assert.equal(
  guardRuntime.deriveDataRoot(path.join(
    developerDataRoot,
    'SignalInstances',
    `Signal-${developerProfileId}`
  )),
  developerDataRoot
);
assert.equal(guardRuntime.isOwnedDataRoot(path.resolve('D:\\Fixture', 'untrusted-data')), false);
assert.match(guard, /maoyi developer data/);
assert.match(guard, /local-direct-blocked/);
assert.match(guard, /缺少启动器，请从maoyi启动/);
assert.match(guard, /foreign-initializing/);
assert.match(guard, /缺少启动器，正在初始化/);
assert.match(guard, /credential-accepted/);

const runtimeSecurityTest = read('tools/test-runtime-security.mjs');
assert.match(runtimeSecurityTest, /runCloneResetWorker/);
assert.match(runtimeSecurityTest, /credential and full-reset checks passed/);

const main = read('electron/main.ts');
assert.ok(
  main.includes(`'${baselineVersion}': '${supportedBaselines[baselineVersion]}'`),
  `translator does not approve the exact Signal ${baselineVersion} patch set`
);
for (const expected of [
  'launchSignalProfile',
  'hideSignalProfile',
  'hideAllSignalWindows',
  "'window.hide'",
  "type: 'heartbeat.ack'",
  "type: 'window.owner'",
  "type: 'security.visibility'",
  "message.type === 'security.visibility-applied'",
  '!workspaceVisibilityGate.locked',
  "join(developmentProjectRoot, '.tmp', 'signal-source-ui')",
  'realpathSync.native',
  'MAOYI_SIGNAL_SOURCE_SHA256',
  'supportedSignalSourcePatchSets',
  '.df-signal-source-runtime-copy.json',
  'hashFileSha256(candidate)',
  "basename(unpackedRoot).toLowerCase() !== 'win-unpacked'"
]) {
  assert.ok(main.includes(expected), `missing current Signal compatibility marker: ${expected}`);
}
if (baselineVersion === '8.18.0') {
  const translationLifetimePatch = read(
    'signal-source/patches/v8.18.0/0020-maoyi-preserve-translations-on-ordinary-hide.patch'
  );
  for (const expected of [
    'const suspendRendererRequests = (): void =>',
    "command.type === 'security.visibility' && command.locked",
    "if (command.type === 'window.hide')",
    "if (command.type === 'shutdown')",
    'control.setAuthenticated(false)',
    "type: 'translation.runtime.clear'"
  ]) {
    assert.ok(
      translationLifetimePatch.includes(expected),
      `missing Signal translation-lifetime contract: ${expected}`
    );
  }
  assert.match(
    translationLifetimePatch,
    /security\.visibility' && command\.locked\)[\s\S]*?\+\s+suspendRendererRequests\(\)/
  );
  assert.match(
    translationLifetimePatch,
    /if \(command\.type === 'shutdown'\)[\s\S]*?clearRendererRuntime\(\)/
  );
  for (const expected of [
    'presentSignalWorkspace',
    'requestSignalWindowPresentation',
    'signalPresentationAckTimeoutMs = 1_000',
    "type: 'window.present'",
    "message.type === 'window.presentation-applied'",
    'request.appId === appId',
    "'signal:present-workspace'",
    "message.type === 'message.added'",
    'SIGNAL_LIVE_TRANSLATION_QUEUE_START',
    'task.abortController.signal',
    'isValidSignalTranslationProjection',
    'sendSignalTranslationRefreshStatus',
    "reason: forceRefresh ? 'manual-refresh' : 'visible-message'",
    'refreshRequestId: message.requestId',
    'AbortSignal.timeout(signalTranslationRefreshAttemptTimeoutMs)'
  ]) {
    assert.ok(main.includes(expected), `missing realtime Signal translation marker: ${expected}`);
  }
}
assert.ok(
  !main.includes('return [experimentExecutable, developmentExecutable]'),
  'Signal source experiment must never fall back to the legacy development runtime'
);

const planZh = read('SIGNAL_SOURCE_INTEGRATION_PLAN.md');
const planEn = read('SIGNAL_SOURCE_INTEGRATION_PLAN.en.md');
assert.ok(planZh.includes('`003` 功能兼容合同'));
assert.ok(planZh.includes('Signal 整个运行文件夹及其数据被复制到非本机后单独启动'));
assert.ok(planEn.includes('Suite `003` Capability-Compatibility Contract'));
assert.ok(planEn.includes('complete Signal runtime folder and its data are copied to a foreign machine'));

console.log(
  `signal-source-compatibility (${baselineVersion}): launcher, clone reset, ` +
  'feature preservation, and source-upgrade contracts passed'
);
