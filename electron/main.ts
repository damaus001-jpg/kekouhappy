import {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  net,
  nativeImage,
  powerMonitor,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  webContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';
import { appendFile, cp, readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { createReadStream, lstatSync, readFileSync, realpathSync, statSync, type Dirent } from 'node:fs';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { cpus, freemem, networkInterfaces, totalmem } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAssistantLibrary, saveAssistantModule, importAssistantModule, attachAssistantMedia, revealAssistantMedia, exportAssistantTemplate, exportAssistantModule, assistantMediaPath } from './assistant-library.js';
import type { AssistantKind, AssistantModule } from './assistant-library-types.js';
import { handoffChatToGpt } from './gpt-handoff.js';
import { installOpenSmsLoginPersistence, removeOpenSmsLogin } from './opensms-login.js';
import { stageAssistantMaterial, currentAssistantMaterial, readAssistantUsage, recordAssistantUse, readAssistantImage, removeAssistantUsageForProfile } from './assistant-material-store.js';
import { filterProfileScopedJsonl, profileLogIdentityHash } from './profile-data-cleanup.js';
import type { AssistantMaterial, AssistantUseRequest } from './assistant-material-types.js';
import { exportConversationFile } from './conversation-export.js';
import type { ConversationExportRequest } from './conversation-export-types.js';
import type {
  AppConfig,
  AppTheme,
  ChatProfile,
  FingerprintProfile,
  Platform,
  PlatformInfo,
  SendAuthorizationRequest,
  SignalSentIntegrityRequest,
  SensitiveSendAuthorizeRequest,
  SensitiveSendPrepareRequest,
  SensitiveSendRequest,
  SignalWindowPresentationResult,
  SignalWorkspaceBounds,
  SmartReplyRequest,
  TranslateRequest,
  TranslationCacheEntry,
  TranslationCacheLoadRequest,
  TranslationCacheLookupRequest,
  TranslationCacheSetRequest,
  NonEnglishContactRequest,
  LockScreenStatus,
  LockScreenSetPinResult,
  LockScreenUnlockResult,
  NetworkOfflineCheckResult,
  LockScreenPinChangeMode,
  LockScreenPinChangeAuthorizationResult,
  RemoteGuardActionResult,
  RemoteGuardState,
  RemoteGuardStatus,
  TranslationCustomizationStatus
} from './shared.js';
import {
  buildWindowsChromiumUserAgent,
  buildSignalSourceOnlyAcceptanceDiagnostic,
  canonicalRenderedSendIntegrityText,
  composeChineseToEnglishPrompt,
  defaultChineseToEnglishEditablePrompt,
  normalizeChineseToEnglishEditablePrompt,
  sanitizeLastActiveProfileIds,
  sanitizeProfileTabOrder,
  resolveProfileUserAgent,
  restoreComposerEnglishLayout,
  sanitizeComposerEnglishTranslation,
  signalSourceOnlyAcceptanceStages,
  workspaceAppForPlatform,
  type SignalSourceOnlyAcceptanceStage,
  type SignalSourceOnlyAcceptanceStageCounts
} from './shared.js';
import { ClientLicenseManager } from './client-license.js';
import {
  cloneResetArgument,
  cloneResetPlanPathFromArgs,
  cloneResetWorkerDataPath,
  createCloneResetPlan,
  runCloneResetWorker
} from './clone-reset.js';
import {
  createStorageMigrationPlan,
  runStorageMigrationWorker,
  storageMigrationArgument,
  storageMigrationPlanPathFromArgs,
  storageMigrationWorkerDataPath
} from './storage-migration.js';
import {
  createSignalLaunchCredential,
  type RuntimeBindingPayload
} from './runtime-security-core.js';
import {
  defaultRuntimeBindingPath,
  ensureRuntimeBinding,
  ensureSignalInstanceBinding,
  inspectRuntimeBinding,
  mirrorRuntimeBinding,
  upgradeRuntimeBinding
} from './runtime-security.js';
import {
  decryptTranslationCacheRecord,
  encryptTranslationCacheRecord,
  type EncryptedTranslationCacheRecord
} from './translation-cache-crypto.js';
import {
  inspectSensitiveSendText,
  isBlockedPhoneNumberText,
  blockedPhoneNumberMessage,
  isAllowedWalletNetwork,
  type WalletNetwork
} from './payment-address.js';
import { SensitiveSendAuthorizationStore } from './sensitive-send-authorization.js';
import {
  protectTranslationSensitiveTokens,
  restoreTranslationSensitiveTokens
} from './translation-sensitive-tokens.js';
import {
  insertSignalNotificationRoute,
  normalizeStoredSignalNotificationRoutes,
  parseSignalNotificationActivationUrl,
  signalNotificationProtocol,
  validateSignalNotificationRegistration,
  type SignalNotificationRouteRecord
} from './signal-notification-routing.js';
import {
  translationPromptBundleFileName,
  verifyTranslationPromptBundle,
  type TranslationPrompts
} from './translation-prompt-bundle.js';
import {
  buildTranslationSourceDataEnvelope,
  isSuspiciousComposerEnglish,
  normalizeComposerEnglishStyle,
  translationSourceDataProtocol
} from './translation-english-style.js';
import {
  smartReplyPromptBundleFileName,
  verifySmartReplyPromptBundle,
  type SmartReplyPrompt
} from './smart-reply-prompt-bundle.js';
import type { PromptSigningPublicIdentity } from './prompt-bundle-signing.js';
import {
  validateSmartReplyRequest
} from './smart-reply-core.js';
import {
  inspectWindowsRemoteAccess,
  remoteGuardProcessScanIntervalMs,
  requestWindowsWorkstationLock
} from './remote-guard.js';
import { TranslationDiagnostics } from './translation-diagnostics.js';

const defaultModel = 'deepseek-flash';
const appDisplayName = '皮卡丘翻译器';
const appUserDataDirName = 'maoyi';
const developerUserDataDirName = 'maoyi Developer Data';
const appDataFolderName = 'maoyi Data';
const storageBootstrapDirName = app.isPackaged
  ? 'maoyi Launcher'
  : 'maoyi Developer Launcher';
const windowsPackagedAppUserModelId = 'com.maoyi.translator';
const windowsDeveloperAppUserModelId = 'com.maoyi.translator.developer';
const packagedApplicationIconFileName = 'pikachu-translator.ico';
const legacyUserDataDirName = 'chat-translator';
const __dirname = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(__dirname, '../electron/preload.cjs');
const webviewSendGuardPreloadPath = join(__dirname, '../electron/webview-send-guard-preload.cjs');
const cloneResetPlanPath = cloneResetPlanPathFromArgs();
const cloneResetWorkerMode = Boolean(cloneResetPlanPath);
const storageMigrationPlanPath = storageMigrationPlanPathFromArgs();
const storageMigrationWorkerMode = Boolean(storageMigrationPlanPath);
const backgroundWorkerMode = cloneResetWorkerMode || storageMigrationWorkerMode;
const developmentProjectRoot = resolve(app.getAppPath());
const signalSourceExperimentValue = !app.isPackaged
  ? process.env.MAOYI_SIGNAL_SOURCE_EXE?.trim() || ''
  : '';
const supportedSignalSourcePatchSets: Readonly<Record<string, string>> = Object.freeze({
  '8.17.0': 'B692DD94A5CBE9AC7969B0FF0C51B4DA05B2CE82B5F055A6264889251901CD57',
  '8.18.0': '38AF0DA1AEC1CEC40C44173F53DC68E6C835F0A94F974A8A8D2824B5FC3B43FE'
});
const signalSourceOnlyAcceptanceValue =
  process.env.MAOYI_SIGNAL_SOURCE_ONLY_ACCEPTANCE?.trim() || '';
if (signalSourceOnlyAcceptanceValue && !['0', '1'].includes(signalSourceOnlyAcceptanceValue)) {
  throw new Error('MAOYI_SIGNAL_SOURCE_ONLY_ACCEPTANCE must be 0 or 1.');
}
const signalSourceOnlyAcceptanceRequested = signalSourceOnlyAcceptanceValue === '1';
let signalSourceExperimentMetadata: {
  version: string;
  patchSetSha256: string;
  isolatedRuntimeCopy: boolean;
} | null = null;
let signalSourceOnlyAcceptanceActive = false;

function resolveSignalSourceOnlyAcceptance() {
  if (!signalSourceOnlyAcceptanceRequested) return false;
  const hasConflictingMode = Boolean(
    backgroundWorkerMode ||
      process.env.VITE_DEV_SERVER_URL ||
      process.argv.some(argument => argument.startsWith('--remote-debugging-')) ||
      Object.keys(process.env).some(name => name.startsWith('MAOYI_SMOKE_') && process.env[name])
  );
  if (
    app.isPackaged ||
    process.platform !== 'win32' ||
    !signalSourceExperimentValue ||
    hasConflictingMode
  ) {
    throw new Error('Signal source-only acceptance requires an isolated Windows source experiment.');
  }
  signalExecutableCandidates();
  if (
    signalSourceExperimentMetadata?.version !== '8.18.0' ||
    signalSourceExperimentMetadata.patchSetSha256 !== supportedSignalSourcePatchSets['8.18.0'] ||
    !signalSourceExperimentMetadata.isolatedRuntimeCopy
  ) {
    throw new Error('Signal source-only acceptance requires the exact isolated v8.18.0 patch set.');
  }
  return true;
}

function isCanonicalChildPath(rootPath: string, targetPath: string) {
  const childPath = relative(rootPath, targetPath);
  return Boolean(
    childPath &&
      childPath !== '..' &&
      !childPath.startsWith(`..${sep}`) &&
      !isAbsolute(childPath)
  );
}

function assertCanonicalChildPath(rootPath: string, targetPath: string, label: string) {
  if (!isCanonicalChildPath(rootPath, targetPath)) {
    throw new Error(`${label} must stay inside ${rootPath}.`);
  }
}

function canonicalRealDirectory(path: string, label: string) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  return realpathSync.native(path);
}

function validateSignalSourceExperimentUserData(userDataPath: string) {
  if (!userDataPath || !isAbsolute(userDataPath)) {
    throw new Error('Signal source experiments require an absolute MAOYI_USER_DATA_DIR.');
  }
  const allowedRoot = join(developmentProjectRoot, '.tmp', 'signal-source-ui');
  const canonicalRoot = canonicalRealDirectory(allowedRoot, 'Signal source experiment root');
  const canonicalUserData = realpathSync.native(userDataPath);
  if (lstatSync(userDataPath).isSymbolicLink() || !statSync(canonicalUserData).isDirectory()) {
    throw new Error('Signal source experiment user data must be a real directory.');
  }
  assertCanonicalChildPath(canonicalRoot, canonicalUserData, 'Signal source experiment user data');
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true
  }
}]);
app.enableSandbox();

const platformDefaults: Record<Platform, { label: string; url: string }> = {
  whatsapp: { label: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  'telegram-a': { label: 'Telegram A', url: 'https://web.telegram.org/a' },
  'telegram-k': { label: 'Telegram K', url: 'https://web.telegram.org/k/' },
  signal: { label: 'Signal', url: '' },
  opensms: { label: '打新增', url: 'https://www.opensms.cc/#/index/chat' }
};

const whatsappUserAgent = buildWindowsChromiumUserAgent(process.versions.chrome);
const telegramUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.243 Safari/537.36';
const defaultBrowserUserAgent = whatsappUserAgent;
const userDataOverride = process.env.MAOYI_USER_DATA_DIR?.trim() || '';
if (signalSourceExperimentValue) {
  validateSignalSourceExperimentUserData(userDataOverride);
}
const defaultUserDataPath = join(
  app.getPath('appData'),
  app.isPackaged ? appUserDataDirName : developerUserDataDirName
);
const runtimeLoggingEnabled = !app.isPackaged;
const translationDiagnosticsEnabled = !app.isPackaged && process.env.MAOYI_TRANSLATION_DIAGNOSTICS === '1';
const translationDiagnostics = translationDiagnosticsEnabled
  ? new TranslationDiagnostics(join(initialDiagnosticsRoot(), 'logs')) : null;
const profilesBeingRemoved = new Set<string>();
let profileLogWriteQueue: Promise<void> = Promise.resolve();
let diagnosticServiceSecret = '';
const diagnosticInFlight = new Map<string, { startedAt: number; platform: string; reason: string }>();
function initialDiagnosticsRoot() {
  return join(developmentProjectRoot, '.tmp', 'translation-diagnostics-client');
}
function recordTranslationDiagnostic(stage: string, details: Record<string, unknown> = {}) {
  if (typeof details.profileId === 'string' && profilesBeingRemoved.has(details.profileId)) return;
  translationDiagnostics?.record(stage, details);
}
let diagnosticProbe = { state: 'idle', elapsedMs: 0 };
async function runDiagnosticApiProbe() {
  if (!translationDiagnosticsEnabled || !diagnosticServiceSecret || diagnosticProbe.state === 'running') return diagnosticProbe;
  diagnosticProbe = { state: 'running', elapsedMs: 0 };
  const start = Date.now();
  try {
    const translated = await translateWithDeepSeek({ text: 'Hello, how are you today?', from: 'English', to: 'Chinese', reason: 'diagnostic-probe', requestId: randomUUID() }, AbortSignal.timeout(25_000), 'content-free');
    diagnosticProbe = { state: /[\u4e00-\u9fff]/.test(translated) ? 'passed' : 'invalid-result', elapsedMs: Date.now() - start };
  } catch { diagnosticProbe = { state: 'failed', elapsedMs: Date.now() - start }; }
  recordTranslationDiagnostic(`probe:${diagnosticProbe.state}`, { elapsedMs: diagnosticProbe.elapsedMs });
  return diagnosticProbe;
}
app.setName(appDisplayName);
if (process.platform === 'win32') {
  app.setAppUserModelId(
    app.isPackaged ? windowsPackagedAppUserModelId : windowsDeveloperAppUserModelId
  );
  if (app.isPackaged) app.setAsDefaultProtocolClient(signalNotificationProtocol);
}
const initialUserDataPath = cloneResetWorkerMode
  ? cloneResetWorkerDataPath(cloneResetPlanPath)
  : storageMigrationWorkerMode
    ? storageMigrationWorkerDataPath(storageMigrationPlanPath)
    : userDataOverride || defaultUserDataPath;
app.setPath('userData', initialUserDataPath);
app.setPath('sessionData', initialUserDataPath);
app.userAgentFallback = defaultBrowserUserAgent;
app.commandLine.appendSwitch(
  'disable-features',
  'ImeThread,SpareRendererForSitePerProcess,SpellChecking,SpellingService,V8CodeCache,WinDelaySpellcheckServiceInit'
);

let mainWindow: BrowserWindow | null = null;
const compactWindowWidth = 1100;
const compactWindowHeight = 720;
const taskbarUnreadMaximum = 999_999;
let taskbarUnreadCount = 0;
const taskbarUnreadGlyphs: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000']
});

function writeTaskbarUnreadPixel(
  bitmap: Buffer,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255
) {
  if (x < 0 || x >= 16 || y < 0 || y >= 16) return;
  const offset = (y * 16 + x) * 4;
  bitmap[offset] = blue;
  bitmap[offset + 1] = green;
  bitmap[offset + 2] = red;
  bitmap[offset + 3] = alpha;
}

function createTaskbarUnreadOverlay(count: number) {
  const bitmap = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= 56.25) {
        const border = distanceSquared >= 42.25;
        writeTaskbarUnreadPixel(bitmap, x, y, border ? 154 : 222, border ? 15 : 35, border ? 42 : 63);
      }
    }
  }

  const label = count > 99 ? '99+' : String(count);
  const scale = label.length <= 2 ? 2 : 1;
  const glyphWidth = 3 * scale;
  const spacing = scale;
  const labelWidth = label.length * glyphWidth + (label.length - 1) * spacing;
  const labelHeight = 5 * scale;
  const startX = Math.floor((16 - labelWidth) / 2);
  const startY = Math.floor((16 - labelHeight) / 2);
  for (let glyphIndex = 0; glyphIndex < label.length; glyphIndex += 1) {
    const glyph = taskbarUnreadGlyphs[label[glyphIndex]];
    if (!glyph) continue;
    const glyphX = startX + glyphIndex * (glyphWidth + spacing);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;
        for (let scaleY = 0; scaleY < scale; scaleY += 1) {
          for (let scaleX = 0; scaleX < scale; scaleX += 1) {
            writeTaskbarUnreadPixel(
              bitmap,
              glyphX + column * scale + scaleX,
              startY + row * scale + scaleY,
              255,
              255,
              255
            );
          }
        }
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: 16, height: 16, scaleFactor: 1 });
}

function applyTaskbarUnreadOverlay() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  if (taskbarUnreadCount === 0) {
    mainWindow.setOverlayIcon(null, '没有未读消息');
    return;
  }
  mainWindow.setOverlayIcon(
    createTaskbarUnreadOverlay(taskbarUnreadCount),
    `总未读消息 ${taskbarUnreadCount} 条`
  );
}

function applyTaskbarUnreadAttention() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.flashFrame(taskbarUnreadCount > 0 && !mainWindow.isFocused());
}

function setTaskbarUnreadCount(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > taskbarUnreadMaximum
  ) {
    throw new Error('Taskbar unread count is invalid.');
  }
  taskbarUnreadCount = value;
  applyTaskbarUnreadOverlay();
  applyTaskbarUnreadAttention();
}
const remoteGuardScanIntervalMs = 8_000;
const remoteGuardWindowsLockDelayMs = 3_000;
let remoteGuardStatus: RemoteGuardStatus = {
  enabled: process.platform === 'win32',
  state: 'starting',
  checkedAt: 0,
  nextScanAt: 0,
  scanDurationMs: 0,
  scanIntervalMs: remoteGuardScanIntervalMs,
  processScanIntervalMs: remoteGuardProcessScanIntervalMs,
  windowsLockDelayMs: remoteGuardWindowsLockDelayMs,
  threatActive: false,
  incidentLatched: false,
  windowsSessionLocked: false,
  windowsLockState: 'idle',
  findings: [],
  coverage: { windowsSessions: false, processes: false, connections: 'not-needed' }
};
let remoteGuardStarted = false;
let remoteGuardThreatActive = false;
let remoteGuardIncidentLatched = false;
let remoteGuardScanTimer: NodeJS.Timeout | null = null;
let remoteGuardScanPromise: Promise<RemoteGuardStatus> | null = null;
let remoteGuardWindowsLockTimer: NodeJS.Timeout | null = null;
let remoteGuardBeepTimer: NodeJS.Timeout | null = null;
let remoteGuardVisibilityLockPromise: Promise<void> | null = null;
let remoteGuardLastClearState: RemoteGuardState = 'starting';
let remoteGuardRuntimeReason = '';
const remoteGuardAlarmWindows = new Set<BrowserWindow>();
let clientLicenseManager: ClientLicenseManager | null = null;
let authorizedRuntimePrepared = false;
let activeRuntimeSecurity: { payload: RuntimeBindingPayload; devicePrivateKeyPem: string } | null = null;
let runtimeSuiteUpgradePending: RuntimeBindingPayload | null = null;
const configuredPartitions = new Set<string>();
const partitionPolicies = new Map<string, Platform>();
const sessionPolicies = new Map<Session, Platform>();
const sessionStoragePolicies = new Map<string, Platform>();
const translationCacheWriteQueues = new Map<string, Promise<boolean>>();
const translationCacheChunkRecordLimit = 1000;
const translationCacheChunkByteLimit = 2 * 1024 * 1024;
const visibleMessageDeepSeekDedupe = new Map<string, Promise<string>>();
const approvedComposerTranslations = new Map<string, {
  profileId: string;
  platform: Platform;
  conversationSignature: string;
  textHash: string;
  expiresAt: number;
}>();
const approvedComposerTranslationTtlMs = 10 * 60 * 1000;
const sensitiveSendAuthorizations = new SensitiveSendAuthorizationStore();
type TranslationCacheChunkMeta = {
  file: string;
  count: number;
  bytes: number;
  minUpdatedAt: number;
  maxUpdatedAt: number;
};
type TranslationCacheIndex = {
  schemaVersion: 3;
  updatedAt: number;
  chunks: TranslationCacheChunkMeta[];
  oldestViewedKey?: string;
  oldestViewedAt?: number;
  lastViewedRange?: string;
};
type TranslationCacheKeyFile = {
  schemaVersion: 3;
  suiteId: string;
  dataRootId: string;
  protectedKey: string;
  createdAt: string;
};
let translationCacheKey: Buffer | null = null;
let translationCacheInitialization: Promise<void> | null = null;
const signalProcesses = new Map<string, ChildProcess>();
const signalLaunchPromises = new Map<string, Promise<{ pid: number | null; dataDir: string; wsPort?: number; recovered?: boolean }>>();
type SignalControlSession = {
  processId: number;
  key: Buffer;
  createdAt: number;
};
type SignalControlClient = SignalControlSession & {
  socket: Socket;
  connectedAt: number;
  lastSeenAt: number;
  sendSequence: number;
  receiveSequence: number;
  ready: boolean;
};
const signalControlSessions = new Map<string, SignalControlSession>();
const signalControlClients = new Map<string, SignalControlClient>();
let signalNotificationRoutes = new Map<string, SignalNotificationRouteRecord>();
let signalNotificationRoutesLoaded = false;
let signalNotificationRouteWriteQueue: Promise<void> = Promise.resolve();
let signalControlStatusWriteQueue: Promise<void> = Promise.resolve();
const pendingSignalNotificationActivationIds: string[] = [];
type PendingSignalCacheSnapshotRequest = {
  requestId: string;
  conversationId: string;
  client: SignalControlClient;
  state: 'pending' | 'responding' | 'completed';
  cacheOnly?: boolean;
  acceptanceTrigger?: {
    messageId: string;
    sourceHash: string;
    resultSent: boolean;
    forceCacheResult?: boolean;
    refreshTaskKey?: string;
  };
};
type ActiveSignalCacheConversation = {
  conversationId: string;
  client: SignalControlClient;
};
const signalCachePendingRequestLimit = 128;
let signalLayoutReplayTimers: ReturnType<typeof setTimeout>[] = [];
const signalCacheInFlightRequestLimit = 8;
const pendingSignalCacheSnapshotRequests = new Map<
  string,
  Map<string, PendingSignalCacheSnapshotRequest>
>();
const signalCacheInFlightRequestCounts = new Map<string, number>();
const activeSignalCacheConversations = new Map<string, ActiveSignalCacheConversation>();
type SignalOutgoingIntegrityObservation = {
  conversationId: string;
  messageId: string;
  sourceText: string;
  messageTimestamp: number;
  observedAt: number;
};
const signalOutgoingIntegrityObservations = new Map<string, SignalOutgoingIntegrityObservation[]>();
const signalOutgoingIntegrityObservationLimit = 32;
const signalOutgoingIntegrityObservationTtlMs = 30_000;
type PendingSignalSmartReplyRequest = {
  requestId: string;
  conversationId: string;
  trigger: SignalVisibleMessage;
  client: SignalControlClient;
};
const pendingSignalSmartReplyRequests = new Map<
  string,
  Map<string, PendingSignalSmartReplyRequest>
>();

// SIGNAL_SOURCE_ONLY_ACCEPTANCE_DIAGNOSTICS_START
const signalSourceOnlyAcceptanceStageCounts = Object.fromEntries(
  signalSourceOnlyAcceptanceStages.map(stage => [stage, 0])
) as SignalSourceOnlyAcceptanceStageCounts;
let signalSourceOnlyAcceptanceStartedAt = 0;
let signalSourceOnlyAcceptanceSummaryWriteQueue: Promise<void> = Promise.resolve();

function initializeSignalSourceOnlyAcceptanceDiagnostics() {
  for (const stage of signalSourceOnlyAcceptanceStages) {
    signalSourceOnlyAcceptanceStageCounts[stage] = 0;
  }
  signalSourceOnlyAcceptanceStartedAt = Date.now();
  appendSignalSourceOnlyAcceptanceStage('mode-active');
}

function appendSignalSourceOnlyAcceptanceStage(
  stage: SignalSourceOnlyAcceptanceStage
) {
  recordTranslationDiagnostic(`signal:stage:${stage}`);
  if (!signalSourceOnlyAcceptanceActive || !runtimeLoggingEnabled) return;
  signalSourceOnlyAcceptanceStageCounts[stage] += 1;
  const summary = buildSignalSourceOnlyAcceptanceDiagnostic(
    stage,
    signalSourceOnlyAcceptanceStageCounts,
    Math.max(0, Date.now() - signalSourceOnlyAcceptanceStartedAt)
  );
  signalSourceOnlyAcceptanceSummaryWriteQueue = signalSourceOnlyAcceptanceSummaryWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(app.getPath('userData'), { recursive: true });
      await writeJsonAtomic(signalSourceOnlyAcceptanceSummaryPath(), summary);
    });
}
// SIGNAL_SOURCE_ONLY_ACCEPTANCE_DIAGNOSTICS_END

// SIGNAL_LIVE_TRANSLATION_QUEUE_START
const signalLiveTranslationGlobalConcurrency = 24;
const signalLiveTranslationProfileConcurrency = 4;
const signalLiveTranslationPendingLimit = signalCachePendingRequestLimit;
const signalLiveTranslationSourceTextLimit = 4_000;
const signalLiveTranslationRefreshCoalesceMs = 100;
const signalLiveTranslationRetryDelaysMs = [5_000, 30_000] as const;
const signalTranslationRefreshCooldownMs = 1_500;
const signalTranslationRefreshAttemptTimeoutMs = 30_000;
const signalLiveTranslationAttemptTimeoutMs = 90_000;
const signalTranslationRefreshStateLimit = 512;

type SignalLiveTranslationMode = 'live' | 'manual-refresh';

type SignalLiveTranslationTask = {
  key: string;
  mode: SignalLiveTranslationMode;
  origin?: 'new-message' | 'history';
  appId: string;
  profileId: string;
  conversationId: string;
  client: SignalControlClient;
  messageId: string;
  sourceHash: string;
  sourceText: string;
  direction: 'incoming' | 'outgoing';
  attempts: number;
  createdAt: number;
  cancelled: boolean;
  abortController: AbortController;
  translatedText?: string;
  refreshRequestId?: string;
  refreshIdentityKey?: string;
  refreshProjectionKey?: string;
  refreshRevision?: number;
  refreshProcessing?: boolean;
};

type SignalLiveTranslationRetry = {
  task: SignalLiveTranslationTask;
  timer: NodeJS.Timeout;
};

type SignalLiveTranslationRefresh = {
  appId: string;
  task: SignalLiveTranslationTask;
  timer: NodeJS.Timeout;
};

type SignalTranslationRefreshState = {
  appId: string;
  revision: number;
  projectionKey: string;
  acceptedAt: number;
  taskKey: string;
};

type SignalTranslationRefreshObservation = {
  taskKey?: string;
  pending: boolean;
};

const signalLiveTranslationQueue: SignalLiveTranslationTask[] = [];
const signalLiveTranslationPendingKeys = new Set<string>();
const signalLiveTranslationFailedUntil = new Map<string, number>();
const signalLiveTranslationRetryTimers = new Map<string, SignalLiveTranslationRetry>();
const signalLiveTranslationRunningProfiles = new Map<string, number>();
const signalLiveTranslationRunningTasks = new Map<string, SignalLiveTranslationTask>();
const signalLiveTranslationRefreshTimers = new Map<string, SignalLiveTranslationRefresh>();
const signalLiveTranslationDeferredSnapshots = new Map<string, SignalLiveTranslationTask>();
const signalTranslationRefreshStates = new Map<string, SignalTranslationRefreshState>();
let signalLiveTranslationRunningCount = 0;
let signalLiveTranslationPumpTimer: NodeJS.Timeout | null = null;

function signalLiveTranslationTaskKey(
  profileId: string,
  conversationId: string,
  messageId: string,
  sourceHash: string,
  sourceText: string
) {
  const exactSourceDigest = createHash('sha256')
    .update(normalizeSignalCacheSourceText(sourceText), 'utf8')
    .digest('base64url');
  return JSON.stringify([
    profileId,
    conversationId,
    messageId,
    sourceHash,
    exactSourceDigest
  ]);
}

function signalTranslationRefreshIdentityKey(
  profileId: string,
  conversationId: string,
  messageId: string
) {
  return JSON.stringify([profileId, conversationId, messageId]);
}

function signalTranslationRefreshProjectionKey(message: SignalVisibleMessage) {
  const exactSourceDigest = createHash('sha256')
    .update(normalizeSignalCacheSourceText(message.sourceText), 'utf8')
    .digest('base64url');
  return JSON.stringify([
    message.sourceHash,
    exactSourceDigest,
    message.direction,
    message.timestamp
  ]);
}

function observeSignalTranslationRefresh(
  profileId: string,
  conversationId: string,
  messageId: string
): SignalTranslationRefreshObservation {
  const state = signalTranslationRefreshStates.get(
    signalTranslationRefreshIdentityKey(profileId, conversationId, messageId)
  );
  return {
    taskKey: state?.taskKey,
    pending: Boolean(state?.taskKey && signalLiveTranslationPendingKeys.has(state.taskKey))
  };
}

function sendSignalTranslationRefreshStatus(
  task: SignalLiveTranslationTask,
  state: 'processing' | 'idle',
  error?: 'failed' | 'timeout' | 'busy'
) {
  if (
    task.mode !== 'manual-refresh' ||
    !task.refreshRequestId
  ) {
    return false;
  }
  if (state === 'processing') {
    if (task.refreshProcessing || !isSignalLiveTranslationEligible(task)) return false;
    const sent = sendSignalControlMessage(task.appId, {
      type: 'translation.refresh.status',
      requestId: task.refreshRequestId,
      conversationId: task.conversationId,
      messageId: task.messageId,
      state
    });
    if (sent) task.refreshProcessing = true;
    return sent;
  }
  if (!task.refreshProcessing) return false;
  task.refreshProcessing = false;
  return sendSignalControlMessage(task.appId, {
    type: 'translation.refresh.status',
    requestId: task.refreshRequestId,
    conversationId: task.conversationId,
    messageId: task.messageId,
    state,
    ...(error ? { error } : {})
  });
}

function isSignalTranslationRefreshObservationSettled(
  profileId: string,
  conversationId: string,
  messageId: string,
  observed: SignalTranslationRefreshObservation
) {
  const current = observeSignalTranslationRefresh(profileId, conversationId, messageId);
  return Boolean(
    !observed.pending &&
      !current.pending &&
      observed.taskKey === current.taskKey
  );
}

function isSignalTranslationRefreshTriggerCurrent(
  profileId: string,
  pending: PendingSignalCacheSnapshotRequest
) {
  const refreshTaskKey = pending.acceptanceTrigger?.refreshTaskKey;
  if (!refreshTaskKey || !pending.acceptanceTrigger) return true;
  return observeSignalTranslationRefresh(
    profileId,
    pending.conversationId,
    pending.acceptanceTrigger.messageId
  ).taskKey === refreshTaskKey;
}

function sameSignalLiveTranslationMessage(
  task: SignalLiveTranslationTask,
  appId: string,
  conversationId: string,
  messageId: string
) {
  return Boolean(
    task.appId === appId &&
      task.conversationId === conversationId &&
      task.messageId === messageId
  );
}

function cancelSignalLiveTranslationTask(task: SignalLiveTranslationTask) {
  task.cancelled = true;
  task.abortController.abort();
  signalLiveTranslationPendingKeys.delete(task.key);
  sendSignalTranslationRefreshStatus(task, 'idle');
}

function hasSignalLiveTranslationForMessage(
  appId: string,
  conversationId: string,
  messageId: string
) {
  return Boolean(
    signalLiveTranslationQueue.some(task =>
      sameSignalLiveTranslationMessage(task, appId, conversationId, messageId)
    ) ||
      Array.from(signalLiveTranslationRetryTimers.values()).some(({ task }) =>
        sameSignalLiveTranslationMessage(task, appId, conversationId, messageId)
      ) ||
      Array.from(signalLiveTranslationRunningTasks.values()).some(task =>
        sameSignalLiveTranslationMessage(task, appId, conversationId, messageId)
      )
  );
}

function cancelSignalLiveTranslationsForMessage(
  appId: string,
  conversationId: string,
  messageId: string
) {
  for (let index = signalLiveTranslationQueue.length - 1; index >= 0; index -= 1) {
    const task = signalLiveTranslationQueue[index];
    if (!sameSignalLiveTranslationMessage(task, appId, conversationId, messageId)) continue;
    signalLiveTranslationQueue.splice(index, 1);
    cancelSignalLiveTranslationTask(task);
  }
  for (const [key, retry] of signalLiveTranslationRetryTimers) {
    if (!sameSignalLiveTranslationMessage(retry.task, appId, conversationId, messageId)) continue;
    clearTimeout(retry.timer);
    signalLiveTranslationRetryTimers.delete(key);
    cancelSignalLiveTranslationTask(retry.task);
  }
  for (const task of signalLiveTranslationRunningTasks.values()) {
    if (!sameSignalLiveTranslationMessage(task, appId, conversationId, messageId)) continue;
    cancelSignalLiveTranslationTask(task);
  }
  for (const [key, refresh] of signalLiveTranslationRefreshTimers) {
    if (!sameSignalLiveTranslationMessage(refresh.task, appId, conversationId, messageId)) continue;
    clearTimeout(refresh.timer);
    signalLiveTranslationRefreshTimers.delete(key);
  }
}

function trimSignalTranslationRefreshStates() {
  while (signalTranslationRefreshStates.size > signalTranslationRefreshStateLimit) {
    let evicted = false;
    for (const [key, state] of signalTranslationRefreshStates) {
      if (state.taskKey && signalLiveTranslationPendingKeys.has(state.taskKey)) continue;
      signalTranslationRefreshStates.delete(key);
      evicted = true;
      break;
    }
    if (!evicted) break;
  }
}

function cancelSignalLiveTranslationsForApp(appId: string) {
  signalLiveTranslationDeferredSnapshots.delete(appId);
  for (let index = signalLiveTranslationQueue.length - 1; index >= 0; index -= 1) {
    const task = signalLiveTranslationQueue[index];
    if (task.appId !== appId) continue;
    signalLiveTranslationQueue.splice(index, 1);
    cancelSignalLiveTranslationTask(task);
  }
  for (const [key, retry] of signalLiveTranslationRetryTimers) {
    if (retry.task.appId !== appId) continue;
    clearTimeout(retry.timer);
    signalLiveTranslationRetryTimers.delete(key);
    cancelSignalLiveTranslationTask(retry.task);
  }
  for (const task of signalLiveTranslationRunningTasks.values()) {
    if (task.appId !== appId) continue;
    cancelSignalLiveTranslationTask(task);
  }
  for (const [key, refresh] of signalLiveTranslationRefreshTimers) {
    if (refresh.appId !== appId) continue;
    clearTimeout(refresh.timer);
    signalLiveTranslationRefreshTimers.delete(key);
  }
  for (const [key, state] of signalTranslationRefreshStates) {
    if (state.appId === appId) signalTranslationRefreshStates.delete(key);
  }
}

function cancelAllSignalLiveTranslations() {
  const appIds = new Set<string>();
  for (const task of signalLiveTranslationQueue) appIds.add(task.appId);
  for (const retry of signalLiveTranslationRetryTimers.values()) appIds.add(retry.task.appId);
  for (const task of signalLiveTranslationRunningTasks.values()) appIds.add(task.appId);
  for (const refresh of signalLiveTranslationRefreshTimers.values()) appIds.add(refresh.appId);
  for (const state of signalTranslationRefreshStates.values()) appIds.add(state.appId);
  for (const appId of appIds) cancelSignalLiveTranslationsForApp(appId);
}

function isSignalLiveTranslationEligible(task: SignalLiveTranslationTask) {
  const context = getSignalCacheControlContext(task.appId, task.client);
  const activeConversation = activeSignalCacheConversations.get(task.appId);
  const refreshState = task.mode === 'manual-refresh' && task.refreshIdentityKey
    ? signalTranslationRefreshStates.get(task.refreshIdentityKey)
    : undefined;
  return Boolean(
    !task.cancelled &&
      context?.profileId === task.profileId &&
      activeConversation?.client === task.client &&
      activeConversation.conversationId === task.conversationId &&
      (
        task.mode !== 'manual-refresh' ||
        (
          refreshState?.revision === task.refreshRevision &&
          refreshState?.projectionKey === task.refreshProjectionKey
        )
      )
  );
}

function signalLiveTranslationRefreshKey(task: SignalLiveTranslationTask) {
  return task.mode === 'manual-refresh' ? task.key : task.appId;
}

function scheduleSignalLiveTranslationRefresh(task: SignalLiveTranslationTask) {
  if (!isSignalLiveTranslationEligible(task)) return;
  const refreshKey = signalLiveTranslationRefreshKey(task);
  const existing = signalLiveTranslationRefreshTimers.get(refreshKey);
  if (
    existing?.task.client === task.client &&
    existing.task.conversationId === task.conversationId &&
    isSignalLiveTranslationEligible(existing.task)
  ) {
    return;
  }
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const scheduled = signalLiveTranslationRefreshTimers.get(refreshKey);
    if (
      scheduled?.timer !== timer ||
      scheduled.task !== task
    ) {
      return;
    }
    signalLiveTranslationRefreshTimers.delete(refreshKey);
    if (!isSignalLiveTranslationEligible(task)) return;
    const snapshotRequest = validateSignalMessageSnapshotRequest({
      type: 'message.snapshot.request',
      requestId: randomUUID()
    });
    const pendingStored = setPendingSignalCacheRequest(task.appId, {
      requestId: snapshotRequest.requestId,
      conversationId: task.conversationId,
      client: task.client,
      state: 'pending',
      acceptanceTrigger: task.mode === 'manual-refresh' || signalSourceOnlyAcceptanceActive
        ? {
            messageId: task.messageId,
            sourceHash: task.sourceHash,
            resultSent: false,
            forceCacheResult: task.mode === 'manual-refresh',
            refreshTaskKey: task.mode === 'manual-refresh' ? task.key : undefined
          }
        : undefined
    });
    if (!pendingStored) return;
    if (!sendSignalControlMessage(task.appId, snapshotRequest)) {
      deletePendingSignalCacheRequest(task.appId, snapshotRequest.requestId);
      return;
    }
    appendSignalSourceOnlyAcceptanceStage('snapshot-request-sent');
  }, signalLiveTranslationRefreshCoalesceMs);
  signalLiveTranslationRefreshTimers.set(refreshKey, {
    appId: task.appId,
    task,
    timer
  });
}

async function runSignalLiveTranslationTask(task: SignalLiveTranslationTask) {
  const forceRefresh = task.mode === 'manual-refresh';
  const cacheRequest: TranslationCacheLookupRequest = {
    profileId: task.profileId,
    platform: 'signal',
    contactId: task.conversationId,
    contactIdType: 'platform',
    sourceHashes: [task.sourceHash]
  };
  if (!isSignalLiveTranslationEligible(task)) return;
  if (!forceRefresh) {
    if (await isMarkedNonEnglishContact(cacheRequest)) {
      recordTranslationDiagnostic('signal:excluded-contact', { profileId: task.profileId });
      return;
    }
    if (!isSignalLiveTranslationEligible(task)) return;

    appendSignalSourceOnlyAcceptanceStage('cache-lookup');
    const cachedEntries = await lookupTranslationCache(cacheRequest);
    if (!isSignalLiveTranslationEligible(task)) return;
    const cached = cachedEntries.find(entry => entry.sourceHash === task.sourceHash);
    if (
      cached &&
      typeof cached.sourceText === 'string' &&
      normalizeSignalCacheSourceText(cached.sourceText) ===
        normalizeSignalCacheSourceText(task.sourceText) &&
      isUsefulSignalCacheTranslation(task.sourceText, cached.translatedText)
    ) {
      appendSignalSourceOnlyAcceptanceStage('cache-hit');
      scheduleSignalLiveTranslationRefresh(task);
      return;
    }
  }

  if (!task.translatedText) {
    appendSignalSourceOnlyAcceptanceStage('api-start');
    sendSignalTranslationRefreshStatus(task, 'processing');
    const translationSignal = forceRefresh
      ? AbortSignal.any([
          task.abortController.signal,
          AbortSignal.timeout(signalTranslationRefreshAttemptTimeoutMs)
        ])
      : task.abortController.signal;
    const translatedText = await translateWithDeepSeek(
      {
        requestId: randomUUID(),
        text: task.sourceText,
        from: 'English',
        to: 'Chinese',
        reason: forceRefresh ? 'manual-refresh' : 'visible-message',
        profileId: task.profileId,
        platform: 'signal',
        sourceHash: task.sourceHash,
        messageKey: task.messageId,
        contactId: task.conversationId,
        contactIdType: 'platform',
        direction: task.direction,
        messagePart: 'body'
      },
      translationSignal,
      'content-free'
    );
    if (!isSignalLiveTranslationEligible(task)) return;
    if (
      !isUsefulSignalCacheTranslation(task.sourceText, translatedText) ||
      Buffer.byteLength(translatedText, 'utf8') > signalCacheProtocolMaxTextBytes
    ) {
      throw new Error('Signal live translation result is invalid.');
    }
    task.translatedText = translatedText;
    appendSignalSourceOnlyAcceptanceStage('api-success');
  }

  if (!forceRefresh && await isMarkedNonEnglishContact(cacheRequest)) return;
  if (!isSignalLiveTranslationEligible(task)) return;
  const saved = await saveTranslationCacheEntry(
    {
      profileId: task.profileId,
      sourceHash: task.sourceHash,
      sourceText: task.sourceText,
      translatedText: task.translatedText,
      platform: 'signal',
      contactId: task.conversationId,
      contactIdType: 'platform',
      direction: task.direction,
      messagePart: 'body'
    },
    () => isSignalLiveTranslationEligible(task),
    { bypassNonEnglishContactGuard: forceRefresh }
  );
  if (!saved || !isSignalLiveTranslationEligible(task)) return;
  appendSignalSourceOnlyAcceptanceStage('cache-saved');
  scheduleSignalLiveTranslationRefresh(task);
}

function finishSignalLiveTranslationTask(task: SignalLiveTranslationTask, error?: 'failed') {
  signalLiveTranslationPendingKeys.delete(task.key);
  signalLiveTranslationRetryTimers.delete(task.key);
  sendSignalTranslationRefreshStatus(task, 'idle', error);
  trimSignalTranslationRefreshStates();
  if (signalLiveTranslationPendingKeys.size < signalLiveTranslationPendingLimit) {
    for (const [appId, deferred] of signalLiveTranslationDeferredSnapshots) {
      signalLiveTranslationDeferredSnapshots.delete(appId);
      if (isSignalLiveTranslationEligible(deferred)) scheduleSignalLiveTranslationRefresh(deferred);
    }
  }
}

function releaseSignalLiveTranslationSlot(task: SignalLiveTranslationTask) {
  signalLiveTranslationRunningTasks.delete(task.key);
  signalLiveTranslationRunningCount = Math.max(0, signalLiveTranslationRunningCount - 1);
  const profileCount = signalLiveTranslationRunningProfiles.get(task.profileId) ?? 0;
  if (profileCount <= 1) {
    signalLiveTranslationRunningProfiles.delete(task.profileId);
  } else {
    signalLiveTranslationRunningProfiles.set(task.profileId, profileCount - 1);
  }
}

function scheduleSignalLiveTranslationPump() {
  if (signalLiveTranslationPumpTimer) return;
  signalLiveTranslationPumpTimer = setTimeout(() => {
    signalLiveTranslationPumpTimer = null;
    pumpSignalLiveTranslationQueue();
  }, 0);
}

function scheduleSignalLiveTranslationRetry(task: SignalLiveTranslationTask) {
  const retryDelay = signalLiveTranslationRetryDelaysMs[task.attempts];
  if (retryDelay === undefined || !isSignalLiveTranslationEligible(task)) {
    if (isSignalLiveTranslationEligible(task)) {
      signalLiveTranslationFailedUntil.set(task.key, Date.now() + 60_000);
      for (const [key, until] of signalLiveTranslationFailedUntil) {
        if (until <= Date.now() || signalLiveTranslationFailedUntil.size > signalLiveTranslationPendingLimit) signalLiveTranslationFailedUntil.delete(key);
      }
    }
    appendSignalSourceOnlyAcceptanceStage('failed');
    finishSignalLiveTranslationTask(task, isSignalLiveTranslationEligible(task) ? 'failed' : undefined);
    return;
  }
  const retryTask = {
    ...task,
    attempts: task.attempts + 1,
    createdAt: Date.now() + retryDelay
  };
  appendSignalSourceOnlyAcceptanceStage('retry-scheduled');
  const timer = setTimeout(() => {
    const retry = signalLiveTranslationRetryTimers.get(task.key);
    if (retry?.timer !== timer) return;
    signalLiveTranslationRetryTimers.delete(task.key);
    if (!isSignalLiveTranslationEligible(retryTask)) {
      finishSignalLiveTranslationTask(retryTask);
      return;
    }
    signalLiveTranslationQueue.push(retryTask);
    scheduleSignalLiveTranslationPump();
  }, retryDelay);
  signalLiveTranslationRetryTimers.set(task.key, { task: retryTask, timer });
}

function pumpSignalLiveTranslationQueue() {
  signalLiveTranslationQueue.sort((left, right) => {
    if (left.mode !== right.mode) return left.mode === 'manual-refresh' ? -1 : 1;
    const priority = (task: SignalLiveTranslationTask) => task.origin !== 'history' ? 0 : Date.now() - task.createdAt > 5_000 ? -1 : 1;
    if (priority(left) !== priority(right)) return priority(left) - priority(right);
    return left.createdAt - right.createdAt;
  });
  while (
    signalLiveTranslationQueue.length > 0 &&
    signalLiveTranslationRunningCount < signalLiveTranslationGlobalConcurrency
  ) {
    const nextIndex = signalLiveTranslationQueue.findIndex(
      task => {
        const running = Array.from(signalLiveTranslationRunningTasks.values());
        const profileCount = signalLiveTranslationRunningProfiles.get(task.profileId) ?? 0;
        if (task.mode === 'manual-refresh') return profileCount < signalLiveTranslationProfileConcurrency + 1;
        if (signalLiveTranslationRunningCount >= signalLiveTranslationGlobalConcurrency - 2) return false;
        if (task.origin === 'history') {
          return profileCount < signalLiveTranslationProfileConcurrency &&
            running.filter(item => item.origin === 'history').length < 12 &&
            running.filter(item => item.profileId === task.profileId && item.origin === 'history').length < 2;
        }
        return profileCount < signalLiveTranslationProfileConcurrency;
      }
    );
    if (nextIndex < 0) return;
    const [task] = signalLiveTranslationQueue.splice(nextIndex, 1);
    if (!isSignalLiveTranslationEligible(task)) {
      finishSignalLiveTranslationTask(task);
      continue;
    }
    signalLiveTranslationRunningCount += 1;
    signalLiveTranslationRunningProfiles.set(
      task.profileId,
      (signalLiveTranslationRunningProfiles.get(task.profileId) ?? 0) + 1
    );
    signalLiveTranslationRunningTasks.set(task.key, task);
    void runSignalLiveTranslationAttempt(task)
      .then(() => {
        releaseSignalLiveTranslationSlot(task);
        finishSignalLiveTranslationTask(task);
        scheduleSignalLiveTranslationPump();
      })
      .catch((error) => {
        releaseSignalLiveTranslationSlot(task);
        recordTranslationDiagnostic('signal:task-failed', { profileId: task.profileId, attempts: task.attempts, ...deepSeekTransportDiagnostic(error) });
        const retryTask = error instanceof Error && error.name === 'TimeoutError'
          ? { ...task, cancelled: false, refreshProcessing: false, abortController: new AbortController() }
          : task;
        scheduleSignalLiveTranslationRetry(retryTask);
        scheduleSignalLiveTranslationPump();
      });
  }
}

function runSignalLiveTranslationAttempt(task: SignalLiveTranslationTask): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      task.abortController.signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error('Signal translation cancelled'));
    const timer = setTimeout(() => {
      const error = new Error('Signal translation attempt timed out');
      error.name = 'TimeoutError';
      finish(error);
      task.cancelled = true;
      sendSignalTranslationRefreshStatus(task, 'idle', 'timeout');
      task.abortController.abort();
    }, task.mode === 'manual-refresh' ? signalTranslationRefreshAttemptTimeoutMs : signalLiveTranslationAttemptTimeoutMs);
    task.abortController.signal.addEventListener('abort', onAbort, { once: true });
    if (task.abortController.signal.aborted) onAbort();
    void runSignalLiveTranslationTask(task).then(() => finish(), error => finish(error));
  });
}

function enqueueSignalLiveTranslation(
  appId: string,
  profileId: string,
  client: SignalControlClient,
  message: SignalVisibleMessage,
  origin: 'new-message' | 'history' = 'new-message'
) {
  if (
    message.sourceText.length > signalLiveTranslationSourceTextLimit ||
    !isValidSignalTranslationProjection(message)
  ) {
    recordTranslationDiagnostic('signal:projection-skipped', { profileId, textLength: message.sourceText.length, pending: signalLiveTranslationPendingKeys.size });
    return false;
  }
  const key = signalLiveTranslationTaskKey(
    profileId,
    message.conversationId,
    message.messageId,
    message.sourceHash,
    message.sourceText
  );
  if (signalLiveTranslationPendingKeys.has(key)) return false;
  if ((signalLiveTranslationFailedUntil.get(key) ?? 0) > Date.now()) return false;
  const task: SignalLiveTranslationTask = {
    key,
    mode: 'live',
    origin,
    appId,
    profileId,
    conversationId: message.conversationId,
    client,
    messageId: message.messageId,
    sourceHash: message.sourceHash,
    sourceText: message.sourceText,
    direction: message.direction,
    attempts: 0,
    createdAt: Date.now(),
    cancelled: false,
    abortController: new AbortController()
  };
  if (!isSignalLiveTranslationEligible(task)) return false;
  if (signalLiveTranslationPendingKeys.size >= signalLiveTranslationPendingLimit) {
    // Retain one snapshot reminder per active instance instead of silently
    // forgetting its newest incoming/outgoing messages when the queue is full.
    signalLiveTranslationDeferredSnapshots.set(appId, task);
    recordTranslationDiagnostic('signal:projection-deferred', { profileId, pending: signalLiveTranslationPendingKeys.size });
    return false;
  }
  signalLiveTranslationPendingKeys.add(key);
  recordTranslationDiagnostic('signal:enqueued', { profileId, textLength: message.sourceText.length, queued: signalLiveTranslationQueue.length + 1 });
  signalLiveTranslationQueue.push(task);
  scheduleSignalLiveTranslationPump();
  return true;
}

function enqueueSignalTranslationRefresh(
  appId: string,
  profileId: string,
  client: SignalControlClient,
  message: SignalTranslationRefreshRequest
) {
  if (
    message.sourceText.length > signalLiveTranslationSourceTextLimit ||
    !isValidSignalTranslationProjection(message)
  ) {
    return false;
  }

  const identityKey = signalTranslationRefreshIdentityKey(
    profileId,
    message.conversationId,
    message.messageId
  );
  const projectionKey = signalTranslationRefreshProjectionKey(message);
  const previousState = signalTranslationRefreshStates.get(identityKey);
  const now = Date.now();
  if (
    previousState?.projectionKey === projectionKey &&
    now - previousState.acceptedAt < signalTranslationRefreshCooldownMs
  ) {
    return false;
  }

  const hasSupersededTask = hasSignalLiveTranslationForMessage(
    appId,
    message.conversationId,
    message.messageId
  );
  if (
    signalLiveTranslationPendingKeys.size >= signalLiveTranslationPendingLimit &&
    !hasSupersededTask
  ) {
    return false;
  }
  cancelSignalLiveTranslationsForMessage(
    appId,
    message.conversationId,
    message.messageId
  );
  if (signalLiveTranslationPendingKeys.size >= signalLiveTranslationPendingLimit) return false;

  const revision = previousState && previousState.revision < Number.MAX_SAFE_INTEGER
    ? previousState.revision + 1
    : 1;
  const baseKey = signalLiveTranslationTaskKey(
    profileId,
    message.conversationId,
    message.messageId,
    message.sourceHash,
    message.sourceText
  );
  const key = JSON.stringify(['manual-refresh', baseKey, revision, randomUUID()]);
  const task: SignalLiveTranslationTask = {
    key,
    mode: 'manual-refresh',
    appId,
    profileId,
    conversationId: message.conversationId,
    client,
    messageId: message.messageId,
    sourceHash: message.sourceHash,
    sourceText: message.sourceText,
    direction: message.direction,
    attempts: 0,
    createdAt: now,
    cancelled: false,
    abortController: new AbortController(),
    refreshRequestId: message.requestId,
    refreshIdentityKey: identityKey,
    refreshProjectionKey: projectionKey,
    refreshRevision: revision
  };
  signalTranslationRefreshStates.delete(identityKey);
  signalTranslationRefreshStates.set(identityKey, {
    appId,
    revision,
    projectionKey,
    acceptedAt: now,
    taskKey: key
  });
  trimSignalTranslationRefreshStates();
  if (!isSignalLiveTranslationEligible(task)) {
    signalTranslationRefreshStates.delete(identityKey);
    return false;
  }
  signalLiveTranslationPendingKeys.add(key);
  signalLiveTranslationQueue.push(task);
  scheduleSignalLiveTranslationPump();
  return true;
}
// SIGNAL_LIVE_TRANSLATION_QUEUE_END

function clearSignalCacheRequestState(appId: string) {
  pendingSignalCacheSnapshotRequests.delete(appId);
  pendingSignalSmartReplyRequests.delete(appId);
  activeSignalCacheConversations.delete(appId);
  signalOutgoingIntegrityObservations.delete(appId);
  cancelSignalLiveTranslationsForApp(appId);
}

function clearAllSignalCacheRequestState() {
  pendingSignalCacheSnapshotRequests.clear();
  pendingSignalSmartReplyRequests.clear();
  activeSignalCacheConversations.clear();
  cancelAllSignalLiveTranslations();
}

function setPendingSignalSmartReplyRequest(
  appId: string,
  pending: PendingSignalSmartReplyRequest
) {
  let requests = pendingSignalSmartReplyRequests.get(appId);
  if (!requests) {
    requests = new Map();
    pendingSignalSmartReplyRequests.set(appId, requests);
  }
  if (requests.has(pending.requestId)) return false;
  // A click is a new user intent. It immediately replaces any older request for
  // this Signal profile; stale responses are rejected by object identity below.
  requests.clear();
  requests.set(pending.requestId, pending);
  return true;
}

function getPendingSignalSmartReplyRequest(appId: string, requestId: string) {
  return pendingSignalSmartReplyRequests.get(appId)?.get(requestId);
}

function removePendingSignalSmartReplyRequest(
  appId: string,
  pending: PendingSignalSmartReplyRequest
) {
  const requests = pendingSignalSmartReplyRequests.get(appId);
  if (requests?.get(pending.requestId) !== pending) return;
  requests.delete(pending.requestId);
  if (requests.size === 0) pendingSignalSmartReplyRequests.delete(appId);
}

function getPendingSignalCacheRequest(appId: string, requestId: string) {
  return pendingSignalCacheSnapshotRequests.get(appId)?.get(requestId);
}

function setPendingSignalCacheRequest(
  appId: string,
  pending: PendingSignalCacheSnapshotRequest
) {
  let requests = pendingSignalCacheSnapshotRequests.get(appId);
  if (!requests) {
    requests = new Map();
    pendingSignalCacheSnapshotRequests.set(appId, requests);
  }
  if (requests.has(pending.requestId)) return false;
  if (requests.size >= signalCachePendingRequestLimit) {
    let oldestPendingRequestId: string | undefined;
    let evictableRequestId: string | undefined;
    for (const [requestId, request] of requests) {
      if (request.state === 'completed') {
        evictableRequestId = requestId;
        break;
      }
      if (request.state === 'pending' && !oldestPendingRequestId) {
        oldestPendingRequestId = requestId;
      }
    }
    evictableRequestId ??= oldestPendingRequestId;
    if (!evictableRequestId) return false;
    requests.delete(evictableRequestId);
  }
  requests.set(pending.requestId, pending);
  return true;
}

function deletePendingSignalCacheRequest(appId: string, requestId: string) {
  const requests = pendingSignalCacheSnapshotRequests.get(appId);
  if (!requests) return;
  requests.delete(requestId);
  if (requests.size === 0) pendingSignalCacheSnapshotRequests.delete(appId);
}

function tryAcquireSignalCacheLookupSlot(appId: string) {
  const count = signalCacheInFlightRequestCounts.get(appId) ?? 0;
  if (count >= signalCacheInFlightRequestLimit) return false;
  signalCacheInFlightRequestCounts.set(appId, count + 1);
  return true;
}

function releaseSignalCacheLookupSlot(appId: string) {
  const count = signalCacheInFlightRequestCounts.get(appId) ?? 0;
  if (count <= 1) {
    signalCacheInFlightRequestCounts.delete(appId);
    return;
  }
  signalCacheInFlightRequestCounts.set(appId, count - 1);
}
type SignalVisibilityAckWaiter = {
  revision: number;
  resolve: (applied: boolean) => void;
  timer: NodeJS.Timeout;
};
const signalVisibilityAckWaiters = new Map<string, SignalVisibilityAckWaiter>();
const signalScriptRequests = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>();
type SignalPresentationRequest = {
  appId: string;
  profileId: string;
  requestId: string;
  bounds: { x: number; y: number; width: number; height: number };
  resolve: (result: SignalWindowPresentationResult) => void;
  readyTimer: NodeJS.Timeout;
  acknowledgementTimer: NodeJS.Timeout | null;
  sent: boolean;
};
const signalPresentationRequests = new Map<string, SignalPresentationRequest>();
const signalPresentationRequestIdsByApp = new Map<string, string>();
const signalPresentationInvocationIdsByApp = new Map<string, string>();
const signalStartupRecoveryAttempts = new Set<string>();
const pendingSignalWorkspaceBounds = new Map<string, SignalWorkspaceBounds>();
const lastSignalScreenBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
let visibleSignalProfileId: string | null = null;
let signalMoveSyncTimer: ReturnType<typeof setTimeout> | null = null;
let signalMoveFinalTimer: ReturnType<typeof setTimeout> | null = null;
let signalMainWindowSuspended = false;
let signalProfileToRestoreAfterMainWindow: string | null = null;
let workspaceVisibilityGate = { locked: true, revision: 0 };
const signalMoveSyncIntervalMs = 16;
const signalMoveFinalDelayMs = 48;
const signalControlHandshakeTimeoutMs = 5_000;
const signalControlMaxFrameBytes = 1024 * 1024;
const signalControlMaxSockets = 64;
const signalVisibilityAckTimeoutMs = 1_000;
const signalPresentationReadyTimeoutMs = 15_000;
const signalPresentationAckTimeoutMs = 1_000;
const signalPresentationPositionTolerancePx = 1;
const signalPresentationSizeTolerancePx = 2;
const signalVisibilityShutdownGraceMs = 250;
let signalShutdownBeforeQuitDone = false;
let signalShutdownBeforeQuitPromise: Promise<void> | null = null;
let signalShutdownBeforeQuitTimer: NodeJS.Timeout | null = null;
let signalControlServer: Server | null = null;
let signalControlPort: number | null = null;
let signalControlServerPromise: Promise<number> | null = null;
const gracefulQuitTimeoutMs = 8000;
const rendererReadyTimeoutMs = 5000;
let fatalStartupDialogShown = false;
const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedPlatforms = new Set<Platform>(['whatsapp', 'telegram-a', 'telegram-k', 'signal', 'opensms']);

// SIGNAL_CACHE_PROTOCOL_PURE_START
const signalCacheProtocolMaxBatchSize = 100;
const signalCacheProtocolMaxBusinessJsonBytes = 768 * 1024;
const signalCacheProtocolMaxTextBytes = 64 * 1024;
const signalCacheProtocolUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const signalCacheProtocolSourceHashPattern = /^(?:0|[1-9a-z][0-9a-z]{0,6})$/;
const signalCacheProtocolDirections = new Set(['incoming', 'outgoing'] as const);

type SignalConversationChangedMessage = {
  type: 'conversation.changed';
  conversationId: string;
};

type SignalVisibleMessage = {
  conversationId: string;
  messageId: string;
  sourceHash: string;
  sourceText: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
};

type SignalVisibleMessageBatch = {
  type: 'message.visibleBatch';
  requestId: string;
  conversationId: string;
  messages: SignalVisibleMessage[];
};

type SignalMessageAdded = SignalVisibleMessage & {
  type: 'message.added';
};

type SignalTranslationRefreshRequest = SignalVisibleMessage & {
  type: 'translation.refresh.request';
  requestId: string;
};

const signalSmartReplyContextVersion = 'df.signal.smart-reply-context.v1' as const;
const signalSmartReplyMaxMessages = 18;
const signalSmartReplyMaxTranscriptBytes = 72 * 1024;

type SignalSmartReplyRequest = {
  type: 'smartReply.request';
  requestId: string;
  contextVersion: typeof signalSmartReplyContextVersion;
  conversationId: string;
  triggerMessageId: string;
  messages: SignalVisibleMessage[];
};

type SignalSmartReplyErrorCode =
  | 'unavailable'
  | 'rate-limited'
  | 'timeout'
  | 'invalid-response'
  | 'request-failed';

type SignalCacheResult = {
  conversationId: string;
  messageId: string;
  sourceHash: string;
  sourceText: string;
  translatedText: string;
};

type SignalCacheResultBatch = {
  type: 'translation.cacheResultBatch';
  requestId: string;
  conversationId: string;
  results: SignalCacheResult[];
};

type SignalCacheResultAppliedMessage = {
  type: 'translation.cacheResultApplied';
  requestId: string;
  appliedCount: number;
};

type SignalMessageSnapshotRequest = {
  type: 'message.snapshot.request';
  requestId: string;
};

function signalProtocolRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Signal cache protocol object is invalid.');
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error('Signal cache protocol fields are invalid.');
  }
  return record;
}

function stripSignalControlTransportMetadata(
  value: unknown,
  expectedAppId: string
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { appId, at, ...businessPayload } = value as Record<string, unknown>;
  if (
    appId !== expectedAppId ||
    !Number.isSafeInteger(at) ||
    Number(at) < 0 ||
    typeof businessPayload.type !== 'string'
  ) {
    return null;
  }
  return businessPayload;
}

function assertSignalProtocolBusinessJson(value: unknown) {
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Signal cache protocol object is not serializable.');
  }
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(serialized, 'utf8') > signalCacheProtocolMaxBusinessJsonBytes
  ) {
    throw new Error('Signal cache protocol object is too large.');
  }
}

function assertSignalProtocolUuid(value: unknown) {
  if (typeof value !== 'string' || !signalCacheProtocolUuidPattern.test(value)) {
    throw new Error('Signal cache protocol UUID is invalid.');
  }
  return value;
}

function assertSignalProtocolText(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > signalCacheProtocolMaxTextBytes
  ) {
    throw new Error('Signal cache protocol text is invalid.');
  }
  return value;
}

function assertSignalProtocolSourceHash(value: unknown) {
  if (typeof value !== 'string' || !signalCacheProtocolSourceHashPattern.test(value)) {
    throw new Error('Signal cache protocol source hash is invalid.');
  }
  return value;
}

function validateSignalConversationChangedMessage(value: unknown): SignalConversationChangedMessage {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, ['type', 'conversationId']);
  if (record.type !== 'conversation.changed') {
    throw new Error('Signal conversation change type is invalid.');
  }
  return {
    type: 'conversation.changed',
    conversationId: assertSignalProtocolUuid(record.conversationId)
  };
}

function validateSignalMessageSnapshotRequest(value: unknown): SignalMessageSnapshotRequest {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, ['type', 'requestId']);
  if (record.type !== 'message.snapshot.request') {
    throw new Error('Signal snapshot request type is invalid.');
  }
  return {
    type: 'message.snapshot.request',
    requestId: assertSignalProtocolUuid(record.requestId)
  };
}

function validateSignalVisibleMessageBatch(value: unknown): SignalVisibleMessageBatch {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, ['type', 'requestId', 'conversationId', 'messages']);
  if (record.type !== 'message.visibleBatch' || !Array.isArray(record.messages)) {
    throw new Error('Signal visible message batch is invalid.');
  }
  if (record.messages.length > signalCacheProtocolMaxBatchSize) {
    throw new Error('Signal visible message batch is too large.');
  }
  const requestId = assertSignalProtocolUuid(record.requestId);
  const conversationId = assertSignalProtocolUuid(record.conversationId);
  const messageIds = new Set<string>();
  const messages = record.messages.map((value) => {
    const message = signalProtocolRecord(value, [
      'conversationId',
      'messageId',
      'sourceHash',
      'sourceText',
      'direction',
      'timestamp'
    ]);
    const itemConversationId = assertSignalProtocolUuid(message.conversationId);
    const messageId = assertSignalProtocolUuid(message.messageId);
    if (itemConversationId !== conversationId) {
      throw new Error('Signal visible message conversation is invalid.');
    }
    const comparableMessageId = messageId.toLowerCase();
    if (messageIds.has(comparableMessageId)) {
      throw new Error('Signal visible message ID is duplicated.');
    }
    messageIds.add(comparableMessageId);
    if (!signalCacheProtocolDirections.has(message.direction as 'incoming' | 'outgoing')) {
      throw new Error('Signal visible message direction is invalid.');
    }
    if (!Number.isSafeInteger(message.timestamp) || Number(message.timestamp) < 0) {
      throw new Error('Signal visible message timestamp is invalid.');
    }
    return {
      conversationId: itemConversationId,
      messageId,
      sourceHash: assertSignalProtocolSourceHash(message.sourceHash),
      sourceText: assertSignalProtocolText(message.sourceText),
      direction: message.direction as 'incoming' | 'outgoing',
      timestamp: Number(message.timestamp)
    };
  });
  return { type: 'message.visibleBatch', requestId, conversationId, messages };
}

function validateSignalMessageAdded(value: unknown): SignalMessageAdded {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, [
    'type',
    'conversationId',
    'messageId',
    'sourceHash',
    'sourceText',
    'direction',
    'timestamp'
  ]);
  if (record.type !== 'message.added') {
    throw new Error('Signal added message type is invalid.');
  }
  const conversationId = assertSignalProtocolUuid(record.conversationId);
  const validated = validateSignalVisibleMessageBatch({
    type: 'message.visibleBatch',
    requestId: '00000000-0000-4000-8000-000000000000',
    conversationId,
    messages: [{
      conversationId,
      messageId: record.messageId,
      sourceHash: record.sourceHash,
      sourceText: record.sourceText,
      direction: record.direction,
      timestamp: record.timestamp
    }]
  });
  const [message] = validated.messages;
  if (!message) throw new Error('Signal added message is missing.');
  if (!isValidSignalTranslationProjection(message)) {
    throw new Error('Signal added message projection is invalid.');
  }
  return {
    type: 'message.added',
    ...message
  };
}

function validateSignalTranslationRefreshRequest(
  value: unknown
): SignalTranslationRefreshRequest {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, [
    'type',
    'requestId',
    'conversationId',
    'messageId',
    'sourceHash',
    'sourceText',
    'direction',
    'timestamp'
  ]);
  if (record.type !== 'translation.refresh.request') {
    throw new Error('Signal translation refresh request type is invalid.');
  }
  const requestId = assertSignalProtocolUuid(record.requestId);
  const conversationId = assertSignalProtocolUuid(record.conversationId);
  const validated = validateSignalVisibleMessageBatch({
    type: 'message.visibleBatch',
    requestId,
    conversationId,
    messages: [{
      conversationId,
      messageId: record.messageId,
      sourceHash: record.sourceHash,
      sourceText: record.sourceText,
      direction: record.direction,
      timestamp: record.timestamp
    }]
  });
  const [message] = validated.messages;
  if (!message || !isValidSignalTranslationProjection(message)) {
    throw new Error('Signal translation refresh projection is invalid.');
  }
  return {
    type: 'translation.refresh.request',
    requestId,
    ...message
  };
}

function validateSignalSmartReplyRequest(value: unknown): SignalSmartReplyRequest {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, [
    'type',
    'requestId',
    'contextVersion',
    'conversationId',
    'triggerMessageId',
    'messages'
  ]);
  if (
    record.type !== 'smartReply.request' ||
    record.contextVersion !== signalSmartReplyContextVersion ||
    !Array.isArray(record.messages) ||
    record.messages.length < 1 ||
    record.messages.length > signalSmartReplyMaxMessages
  ) {
    throw new Error('Signal smart reply request is invalid.');
  }
  const requestId = assertSignalProtocolUuid(record.requestId);
  const conversationId = assertSignalProtocolUuid(record.conversationId);
  const triggerMessageId = assertSignalProtocolUuid(record.triggerMessageId);
  const validated = validateSignalVisibleMessageBatch({
    type: 'message.visibleBatch',
    requestId,
    conversationId,
    messages: record.messages
  });
  let transcriptBytes = 0;
  let previousTimestamp = -1;
  for (const message of validated.messages) {
    if (!isValidSignalTranslationProjection(message)) {
      throw new Error('Signal smart reply message projection is invalid.');
    }
    transcriptBytes += Buffer.byteLength(message.sourceText, 'utf8');
    if (message.timestamp < previousTimestamp) {
      throw new Error('Signal smart reply message order is invalid.');
    }
    previousTimestamp = message.timestamp;
  }
  const trigger = validated.messages.at(-1);
  if (
    transcriptBytes > signalSmartReplyMaxTranscriptBytes ||
    !trigger ||
    trigger.direction !== 'incoming' ||
    trigger.messageId !== triggerMessageId
  ) {
    throw new Error('Signal smart reply trigger is invalid.');
  }
  return {
    type: 'smartReply.request',
    requestId,
    contextVersion: signalSmartReplyContextVersion,
    conversationId,
    triggerMessageId,
    messages: validated.messages
  };
}

function validateSignalCacheResultBatch(value: unknown): SignalCacheResultBatch {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, ['type', 'requestId', 'conversationId', 'results']);
  if (record.type !== 'translation.cacheResultBatch' || !Array.isArray(record.results)) {
    throw new Error('Signal cache result batch is invalid.');
  }
  if (record.results.length > signalCacheProtocolMaxBatchSize) {
    throw new Error('Signal cache result batch is too large.');
  }
  const requestId = assertSignalProtocolUuid(record.requestId);
  const conversationId = assertSignalProtocolUuid(record.conversationId);
  const messageIds = new Set<string>();
  const results = record.results.map((value) => {
    const result = signalProtocolRecord(value, [
      'conversationId',
      'messageId',
      'sourceHash',
      'sourceText',
      'translatedText'
    ]);
    const itemConversationId = assertSignalProtocolUuid(result.conversationId);
    const messageId = assertSignalProtocolUuid(result.messageId);
    if (itemConversationId !== conversationId) {
      throw new Error('Signal cache result conversation is invalid.');
    }
    const comparableMessageId = messageId.toLowerCase();
    if (messageIds.has(comparableMessageId)) {
      throw new Error('Signal cache result message ID is duplicated.');
    }
    messageIds.add(comparableMessageId);
    return {
      conversationId: itemConversationId,
      messageId,
      sourceHash: assertSignalProtocolSourceHash(result.sourceHash),
      sourceText: assertSignalProtocolText(result.sourceText),
      translatedText: assertSignalProtocolText(result.translatedText)
    };
  });
  return { type: 'translation.cacheResultBatch', requestId, conversationId, results };
}

function validateSignalCacheResultAppliedMessage(value: unknown): SignalCacheResultAppliedMessage {
  assertSignalProtocolBusinessJson(value);
  const record = signalProtocolRecord(value, ['type', 'requestId', 'appliedCount']);
  if (
    record.type !== 'translation.cacheResultApplied' ||
    !Number.isSafeInteger(record.appliedCount) ||
    Number(record.appliedCount) < 0 ||
    Number(record.appliedCount) > signalCacheProtocolMaxBatchSize
  ) {
    throw new Error('Signal cache result acknowledgement is invalid.');
  }
  return {
    type: 'translation.cacheResultApplied',
    requestId: assertSignalProtocolUuid(record.requestId),
    appliedCount: Number(record.appliedCount)
  };
}

function normalizeSignalCacheSourceText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function recordSignalOutgoingIntegrityObservation(appId: string, message: SignalVisibleMessage) {
  if (message.direction !== 'outgoing') return;
  const now = Date.now();
  const retained = (signalOutgoingIntegrityObservations.get(appId) || []).filter(observation =>
    observation.observedAt >= now - signalOutgoingIntegrityObservationTtlMs &&
    observation.messageId !== message.messageId
  );
  retained.push({
    conversationId: message.conversationId,
    messageId: message.messageId,
    sourceText: message.sourceText,
    messageTimestamp: message.timestamp,
    observedAt: now
  });
  signalOutgoingIntegrityObservations.set(
    appId,
    retained.slice(-signalOutgoingIntegrityObservationLimit)
  );
}

async function verifySignalSentIntegrity(request: SignalSentIntegrityRequest) {
  const profile = (await readConfig()).profiles.find(item =>
    item.id === request.profileId && item.platform === 'signal'
  );
  if (!profile) throw new Error('Signal profile was not found.');
  const appId = signalAppId(profile.id);
  const expected = canonicalRenderedSendIntegrityText(request.expectedText);
  const deadline = Date.now() + 5_000;
  let candidates: SignalOutgoingIntegrityObservation[] = [];
  while (true) {
    const now = Date.now();
    const activeConversationId = activeSignalCacheConversations.get(appId)?.conversationId;
    candidates = (signalOutgoingIntegrityObservations.get(appId) || []).filter(observation =>
      observation.observedAt >= request.notBefore &&
      observation.observedAt >= now - signalOutgoingIntegrityObservationTtlMs &&
      (!activeConversationId || observation.conversationId === activeConversationId)
    );
    if (candidates.some(observation =>
      canonicalRenderedSendIntegrityText(observation.sourceText) === expected
    )) {
      return { status: 'match' as const, candidateCount: candidates.length };
    }
    if (now >= deadline) {
      return {
        status: candidates.length ? 'mismatch' as const : 'unavailable' as const,
        candidateCount: candidates.length
      };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function legacySignalSourceHash(value: string) {
  let hash = 2166136261;
  for (const char of normalizeSignalCacheSourceText(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isValidSignalTranslationProjection(message: SignalVisibleMessage) {
  const sourceText = normalizeSignalCacheSourceText(message.sourceText);
  return Boolean(
    sourceText === message.sourceText &&
      sourceText.length > 0 &&
      sourceText.length <= 4_000 &&
      /[A-Za-z]/.test(sourceText) &&
      !/[\u3400-\u9fff]/u.test(sourceText) &&
      legacySignalSourceHash(sourceText) === message.sourceHash
  );
}

function hasSignalCacheTranslationPromptLeak(value: string) {
  return /translate the following chat message|return only the translated message|keep\s+emojis?,?\s*urls|请将以下英文聊天信息翻译成中文|(?:保留|保持)\s*表情符号|你是一名(?:中译英|英译中)聊天翻译助手|只输出(?:英文|中文)译文|普通英文单词和短语必须翻译|保持原有换行和空行结构|敏感信息占位符必须原样保留|仅返回翻译后的信息|无需解释/i.test(value);
}

function isUsefulSignalCacheTranslation(sourceText: string, translatedText: string) {
  const source = normalizeSignalCacheSourceText(sourceText);
  const translated = normalizeSignalCacheSourceText(translatedText);
  if (!translated) return false;
  if (hasSignalCacheTranslationPromptLeak(translated)) return false;
  if (source && translated.toLowerCase() === source.toLowerCase()) return false;
  if ((!source || /[A-Za-z]{2,}/.test(source)) && !/[\u4e00-\u9fff]/.test(translated)) {
    return false;
  }
  return true;
}
// SIGNAL_CACHE_PROTOCOL_PURE_END

function assertProfileId(value: string) {
  if (!profileIdPattern.test(value)) throw new Error('Profile ID is invalid.');
  return value;
}

function containedPath(root: string, ...parts: string[]) {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, ...parts);
  const child = relative(resolvedRoot, candidate);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Resolved path escaped its authorized data root.');
  }
  return candidate;
}

function startupErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.message}\n\n${error.stack || ''}`.trim();
  }
  return String(error || '未知错误');
}

function showFatalStartupError(error: unknown) {
  const windowVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  if (fatalStartupDialogShown || windowVisible) return;
  fatalStartupDialogShown = true;
  dialog.showErrorBox(
    '皮卡丘翻译器启动失败',
    `程序启动时遇到错误，请截图发给供应商。\n\n${startupErrorMessage(error)}`
  );
  app.quit();
}

function isTrustedMainUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'app:' && url.hostname === 'bundle') return true;
    return !app.isPackaged && url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '5173';
  } catch {
    return false;
  }
}

function isAllowedPlatformUrl(platform: Platform, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (platform === 'opensms') return url.hostname === 'www.opensms.cc' || url.hostname === 'opensms.cc';
    if (platform === 'whatsapp') return url.hostname === 'web.whatsapp.com';
    if (platform === 'telegram-k') return url.hostname === 'web.telegram.org' && (url.pathname === '/k' || url.pathname.startsWith('/k/'));
    if (platform === 'telegram-a') return url.hostname === 'web.telegram.org' && (url.pathname === '/a' || url.pathname.startsWith('/a/'));
    return false;
  } catch {
    return false;
  }
}

function isAllowedPlatformPermissionOrigin(platform: Platform, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (platform === 'opensms') return url.hostname === 'www.opensms.cc' || url.hostname === 'opensms.cc';
    if (platform === 'whatsapp') return url.hostname === 'web.whatsapp.com';
    if (platform === 'telegram-k' || platform === 'telegram-a') return url.hostname === 'web.telegram.org';
    return false;
  } catch {
    return false;
  }
}

function sessionStoragePolicyKey(storagePath: string | null | undefined) {
  return storagePath ? resolve(storagePath).toLowerCase() : '';
}

function installWebContentsSecurityPolicy() {
  app.on('web-contents-created', (_event, contents) => {
    const storagePolicyKey = sessionStoragePolicyKey(contents.session.storagePath);
    const platform = sessionPolicies.get(contents.session) ||
      (storagePolicyKey ? sessionStoragePolicies.get(storagePolicyKey) : undefined);
    if (!platform) return;

    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, targetUrl) => {
      if (!isAllowedPlatformUrl(platform, targetUrl)) event.preventDefault();
    });

    // Temporary developer-only inspector for identifying WhatsApp layout seams.
    if (platform === 'whatsapp' && !app.isPackaged) {
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.key !== 'F12' || input.isAutoRepeat) return;
        event.preventDefault();
        if (contents.isDevToolsOpened()) contents.closeDevTools();
        else contents.openDevTools({ mode: 'detach' });
      });
    }

    if ((platform === 'telegram-k' || platform === 'telegram-a') && runtimeLoggingEnabled) {
      let enterSequence = 0;
      contents.on('before-input-event', (_event, input) => {
        const physicalEnter = input.key === 'Enter' ||
          input.key === 'Return' ||
          input.code === 'Enter' ||
          input.code === 'NumpadEnter';
        if (
          !physicalEnter ||
          input.type !== 'keyDown' ||
          input.isAutoRepeat ||
          input.shift ||
          input.control ||
          input.alt ||
          input.meta
        ) {
          return;
        }
        enterSequence += 1;
        void appendSignalTranslationDebugLog({
          type: 'telegram-enter-keydown',
          platform,
          webContentsId: contents.id,
          sequence: enterSequence,
          key: input.key,
          code: input.code,
          composing: input.isComposing
        });
      });
    }
  });
}

function registerLocalAppProtocol() {
  const bundleRoot = resolve(__dirname, '../dist');
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'assistant-media') {
        assertClientRuntimeAllowed();
        if (workspaceVisibilityGate.locked) return new Response('Locked', { status: 403 });
        const media = await assistantMediaPath(decodeURIComponent(url.pathname.slice(1)));
        return net.fetch(pathToFileURL(media).toString(), { headers: request.headers });
      }
      if (url.hostname !== 'bundle') return new Response('Not found', { status: 404 });
      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = containedPath(bundleRoot, relativePath);
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

function assertClientRuntimeAllowed() {
  if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
  clientLicenseManager.assertRuntimeAllowed();
}

process.on('uncaughtException', showFatalStartupError);
process.on('unhandledRejection', showFatalStartupError);

const gotSingleInstanceLock = backgroundWorkerMode || app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (!backgroundWorkerMode) queueSignalNotificationProtocolArguments(process.argv);

if (!backgroundWorkerMode) app.on('second-instance', (_event, commandLine) => {
  queueSignalNotificationProtocolArguments(commandLine);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  requestSignalWorkspaceSyncBurst();
  void dispatchPendingSignalNotificationActivation();
});

function storageBootstrapPath() {
  return join(app.getPath('appData'), storageBootstrapDirName, 'storage.json');
}

function applyUserDataPath(dataPath: string) {
  app.setPath('userData', dataPath);
  app.setPath('sessionData', dataPath);
}

async function saveStorageBootstrap(dataPath: string) {
  const bootstrapPath = storageBootstrapPath();
  await mkdir(dirname(bootstrapPath), { recursive: true });
  await writeFile(bootstrapPath, `${JSON.stringify({ dataPath }, null, 2)}\n`, 'utf8');
}

async function initializeUserDataPath() {
  if (userDataOverride) {
    await mkdir(userDataOverride, { recursive: true });
    applyUserDataPath(userDataOverride);
    return true;
  }

  if (!app.isPackaged) {
    try {
      const raw = (await readFile(storageBootstrapPath(), 'utf8')).replace(/^\uFEFF/, '');
      const parsed = JSON.parse(raw) as { dataPath?: unknown };
      if (typeof parsed.dataPath === 'string' && parsed.dataPath.trim()) {
        const dataPath = parsed.dataPath.trim();
        await mkdir(dataPath, { recursive: true });
        applyUserDataPath(dataPath);
        return true;
      }
    } catch {
      // A fresh developer client receives its own data root below.
    }
    await mkdir(defaultUserDataPath, { recursive: true });
    await saveStorageBootstrap(defaultUserDataPath);
    applyUserDataPath(defaultUserDataPath);
    return true;
  }

  try {
    const raw = (await readFile(storageBootstrapPath(), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as { dataPath?: unknown };
    if (typeof parsed.dataPath === 'string' && parsed.dataPath.trim()) {
      const dataPath = parsed.dataPath.trim();
      await mkdir(dataPath, { recursive: true });
      applyUserDataPath(dataPath);
      return true;
    }
  } catch {
    // First launch continues to existing-data detection or storage selection.
  }

  const existingDataMarkers = ['config.json', 'profiles.json', 'Partitions', 'SignalInstances'];
  for (const marker of existingDataMarkers) {
    if (await pathExists(join(defaultUserDataPath, marker))) {
      await saveStorageBootstrap(defaultUserDataPath);
      applyUserDataPath(defaultUserDataPath);
      return true;
    }
  }

  const selection = await dialog.showOpenDialog({
    title: '选择皮卡丘翻译器数据保存位置',
    buttonLabel: '选择并创建数据目录',
    properties: ['openDirectory', 'createDirectory']
  });
  if (selection.canceled || !selection.filePaths[0]) {
    await dialog.showMessageBox({
      type: 'warning',
      title: '皮卡丘翻译器',
      message: '未选择数据保存位置，程序未启动。',
      detail: '请重新打开程序，并选择一个可写入的磁盘文件夹。'
    });
    return false;
  }

  const dataPath = join(selection.filePaths[0], appDataFolderName);
  await mkdir(dataPath, { recursive: true });
  await saveStorageBootstrap(dataPath);
  applyUserDataPath(dataPath);
  return true;
}

function signalNotificationRoutesPath() {
  return join(app.getPath('userData'), 'signal-notification-routes.bin');
}

function currentSignalNotificationRoutes(now = Date.now()) {
  const records = [...signalNotificationRoutes.values()].filter(record => record.expiresAt > now);
  signalNotificationRoutes = new Map(records.map(record => [record.activationId, record]));
  return records;
}

function persistSignalNotificationRoutes() {
  signalNotificationRouteWriteQueue = signalNotificationRouteWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (!safeStorage.isEncryptionAvailable()) return;
      const payload = JSON.stringify({
        schemaVersion: 1,
        records: currentSignalNotificationRoutes()
      });
      const encrypted = safeStorage.encryptString(payload);
      await writeFile(signalNotificationRoutesPath(), encrypted);
    })
    .catch(() => undefined);
  return signalNotificationRouteWriteQueue;
}

async function loadSignalNotificationRoutes() {
  signalNotificationRoutesLoaded = false;
  signalNotificationRoutes.clear();
  if (!safeStorage.isEncryptionAvailable()) {
    signalNotificationRoutesLoaded = true;
    return;
  }
  try {
    const encrypted = await readFile(signalNotificationRoutesPath());
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
    const records = normalizeStoredSignalNotificationRoutes(parsed);
    signalNotificationRoutes = new Map(records.map(record => [record.activationId, record]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // Notification routes are transient and never justify retaining a corrupt
      // file. The encrypted file contains no message body or contact metadata.
      await rm(signalNotificationRoutesPath(), { force: true }).catch(() => undefined);
    }
  } finally {
    signalNotificationRoutesLoaded = true;
  }
}

function registerSignalNotificationRoute(appId: string, message: Record<string, unknown>) {
  if (profilesBeingRemoved.has(profileIdFromSignalAppId(appId))) return false;
  const record = validateSignalNotificationRegistration(message, appId);
  if (!record) return false;
  const records = insertSignalNotificationRoute(currentSignalNotificationRoutes(), record);
  signalNotificationRoutes = new Map(records.map(candidate => [candidate.activationId, candidate]));
  void persistSignalNotificationRoutes();
  return true;
}

function queueSignalNotificationProtocolArguments(argumentsList: ReadonlyArray<string>) {
  for (const argument of argumentsList) {
    const activationId = parseSignalNotificationActivationUrl(argument);
    if (!activationId || pendingSignalNotificationActivationIds.includes(activationId)) continue;
    pendingSignalNotificationActivationIds.push(activationId);
  }
  if (pendingSignalNotificationActivationIds.length > 8) {
    pendingSignalNotificationActivationIds.splice(0, pendingSignalNotificationActivationIds.length - 8);
  }
}

async function pendingSignalNotificationActivation() {
  if (
    !signalNotificationRoutesLoaded ||
    workspaceVisibilityGate.locked ||
    !clientLicenseManager?.isRuntimeAllowed()
  ) {
    return null;
  }
  const now = Date.now();
  currentSignalNotificationRoutes(now);
  while (pendingSignalNotificationActivationIds.length > 0) {
    const activationId = pendingSignalNotificationActivationIds[0];
    const record = signalNotificationRoutes.get(activationId);
    if (!record || record.expiresAt <= now) {
      pendingSignalNotificationActivationIds.shift();
      continue;
    }
    const profileId = profileIdFromSignalAppId(record.appId);
    const config = await readConfig();
    const profile = config.profiles.find(candidate =>
      candidate.id === profileId && candidate.platform === 'signal'
    );
    if (!profile || signalAppId(profile.id) !== record.appId) {
      pendingSignalNotificationActivationIds.shift();
      signalNotificationRoutes.delete(activationId);
      void persistSignalNotificationRoutes();
      continue;
    }
    return { activationId, profileId };
  }
  return null;
}

async function dispatchPendingSignalNotificationActivation() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const activation = await pendingSignalNotificationActivation();
  if (!activation) return false;
  mainWindow.webContents.send(
    'signal:notification-activate',
    activation.profileId,
    activation.activationId
  );
  return true;
}

async function completeSignalNotificationActivation(profileId: unknown, activationId: unknown) {
  if (typeof profileId !== 'string') return false;
  assertProfileId(profileId);
  if (typeof activationId !== 'string') return false;
  const parsedActivationId = parseSignalNotificationActivationUrl(
    `${signalNotificationProtocol}://signal-notification/v1/${activationId}`
  );
  if (
    parsedActivationId !== activationId ||
    workspaceVisibilityGate.locked ||
    !clientLicenseManager?.isRuntimeAllowed()
  ) {
    return false;
  }
  const record = signalNotificationRoutes.get(activationId);
  if (
    !record ||
    record.expiresAt <= Date.now() ||
    record.appId !== signalAppId(profileId)
  ) {
    return false;
  }
  const sent = sendSignalControlMessage(record.appId, {
    type: 'protocol.open',
    url: record.route,
    requestId: randomUUID()
  });
  if (!sent) return false;
  signalNotificationRoutes.delete(activationId);
  const pendingIndex = pendingSignalNotificationActivationIds.indexOf(activationId);
  if (pendingIndex >= 0) pendingSignalNotificationActivationIds.splice(pendingIndex, 1);
  void persistSignalNotificationRoutes();
  return true;
}

function configPath() {
  return join(app.getPath('userData'), 'config.json');
}

const validAppThemes = new Set<AppTheme>(['pink', 'blackGold', 'murongPurple', 'clearWaterBlue']);

function normalizeAppTheme(value: unknown): AppTheme {
  return validAppThemes.has(value as AppTheme) ? value as AppTheme : 'blackGold';
}

async function readInitialAppTheme(): Promise<AppTheme> {
  try {
    const raw = (await readFile(configPath(), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as { activeTheme?: unknown };
    return normalizeAppTheme(parsed.activeTheme);
  } catch {
    return 'blackGold';
  }
}

function legacyUserDataDirCandidates() {
  if (userDataOverride) return [];
  return [
    join(app.getPath('appData'), 'maoyi'),
    join(app.getPath('appData'), 'maoyi maoyi')
  ].filter((path, index, paths) => path !== app.getPath('userData') && paths.indexOf(path) === index);
}

function profilesPath() {
  return join(app.getPath('userData'), 'profiles.json');
}

function lockScreenPath() {
  return join(app.getPath('userData'), 'lock-screen.json');
}

function translateRequestLogPath() {
  return join(app.getPath('userData'), 'translate-requests.jsonl');
}

function signalTranslationDebugLogPath() {
  return join(app.getPath('userData'), 'signal-translation-debug.jsonl');
}

function signalSourceOnlyAcceptanceSummaryPath() {
  return join(app.getPath('userData'), 'signal-source-only-acceptance-summary.json');
}

function partitionStoragePath(partition: string) {
  const match = /^persist:chat-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(partition);
  if (!match) return null;
  return containedPath(join(app.getPath('userData'), 'Partitions'), `chat-${match[1]}`);
}

function signalInstancesRoot() {
  return join(app.getPath('userData'), 'SignalInstances');
}

function signalInstancePath(id: string) {
  assertProfileId(id);
  return containedPath(signalInstancesRoot(), `Signal-${id}`);
}

function signalAppId(id: string) {
  return `Signal-${id}`;
}

function profileIdFromSignalAppId(appId: string) {
  return appId.startsWith('Signal-') ? appId.slice('Signal-'.length) : appId;
}

function signalControlStatusPath() {
  return join(app.getPath('userData'), 'signal-control-status.json');
}

let signalExecutableCandidatesCache: string[] | null = null;

function signalExecutableCandidates() {
  if (signalExecutableCandidatesCache) return signalExecutableCandidatesCache;
  const developmentExecutable = translationDiagnosticsEnabled
    ? join(initialDiagnosticsRoot(), 'signal-runtime', 'Signal.exe')
    : join(developmentProjectRoot, '.runtime', 'signal-desktop', 'Signal.exe');
  const packagedExecutable = join(process.resourcesPath || '', 'signal', 'Signal.exe');
  if (app.isPackaged) {
    signalExecutableCandidatesCache = [packagedExecutable];
    return signalExecutableCandidatesCache;
  }
  if (!signalSourceExperimentValue) {
    signalExecutableCandidatesCache = [developmentExecutable];
    return signalExecutableCandidatesCache;
  }
  if (!isAbsolute(signalSourceExperimentValue)) {
    throw new Error('MAOYI_SIGNAL_SOURCE_EXE must be an absolute path.');
  }

  const experimentRoot = canonicalRealDirectory(
    join(developmentProjectRoot, '.tmp', 'signal-source'),
    'Signal source experiment root'
  );
  const isolatedRuntimeRoot = canonicalRealDirectory(
    join(developmentProjectRoot, '.tmp', 'signal-source-ui'),
    'Signal source isolated runtime root'
  );
  const requestedExecutable = resolve(signalSourceExperimentValue);
  const experimentExecutable = realpathSync.native(requestedExecutable);
  if (
    lstatSync(requestedExecutable).isSymbolicLink() ||
    !statSync(experimentExecutable).isFile() ||
    basename(experimentExecutable).toLowerCase() !== 'signal.exe'
  ) {
    throw new Error('Signal source experiment executable must be a real Signal.exe file.');
  }
  const isPreparedBuild = isCanonicalChildPath(experimentRoot, experimentExecutable);
  const isIsolatedRuntimeCopy = isCanonicalChildPath(isolatedRuntimeRoot, experimentExecutable);
  if (!isPreparedBuild && !isIsolatedRuntimeCopy) {
    throw new Error('Signal source experiment executable escaped its prepared or isolated root.');
  }
  const executableRoot = isPreparedBuild ? experimentRoot : isolatedRuntimeRoot;

  const unpackedRoot = dirname(experimentExecutable);
  const releaseRoot = dirname(unpackedRoot);
  if (basename(unpackedRoot).toLowerCase() !== 'win-unpacked' || basename(releaseRoot).toLowerCase() !== 'release') {
    throw new Error('Signal source experiment executable must come from release/win-unpacked.');
  }
  const resourcesPath = realpathSync.native(join(unpackedRoot, 'resources'));
  if (lstatSync(join(unpackedRoot, 'resources')).isSymbolicLink() || !statSync(resourcesPath).isDirectory()) {
    throw new Error('Signal source experiment resources directory is missing.');
  }
  assertCanonicalChildPath(executableRoot, resourcesPath, 'Signal source experiment resources');

  const preparedRoot = isPreparedBuild ? dirname(dirname(releaseRoot)) : dirname(releaseRoot);
  const markerFileName = isPreparedBuild
    ? '.df-source-experiment.json'
    : '.df-signal-source-runtime-copy.json';
  const marker = JSON.parse(readFileSync(join(preparedRoot, markerFileName), 'utf8')) as {
    schemaVersion?: unknown;
    version?: unknown;
    patchSetSha256?: unknown;
    executableRelativePath?: unknown;
    sourceExecutableSha256?: unknown;
  };
  const expectedPatchSetSha256 = typeof marker.version === 'string'
    ? supportedSignalSourcePatchSets[marker.version]
    : undefined;
  if (
    marker.schemaVersion !== 1 ||
    typeof marker.version !== 'string' ||
    typeof marker.patchSetSha256 !== 'string' ||
    !expectedPatchSetSha256 ||
    marker.patchSetSha256.toUpperCase() !== expectedPatchSetSha256 ||
    (isPreparedBuild && (
      basename(preparedRoot) !== `v${marker.version}` ||
      basename(dirname(releaseRoot)) !== `Signal-Desktop-${marker.version}`
    )) ||
    (isIsolatedRuntimeCopy && (
      marker.executableRelativePath !== 'release/win-unpacked/Signal.exe' ||
      resolve(preparedRoot, marker.executableRelativePath) !== experimentExecutable
    ))
  ) {
    throw new Error('Signal source experiment marker does not match the release layout.');
  }

  const expectedSha256 = process.env.MAOYI_SIGNAL_SOURCE_SHA256?.trim();
  if (!expectedSha256 || !/^[0-9A-F]{64}$/i.test(expectedSha256)) {
    throw new Error('Signal source experiments require MAOYI_SIGNAL_SOURCE_SHA256.');
  }
  if (
    isIsolatedRuntimeCopy &&
    (typeof marker.sourceExecutableSha256 !== 'string' ||
      marker.sourceExecutableSha256.toUpperCase() !== expectedSha256.toUpperCase())
  ) {
    throw new Error('Signal source isolated runtime marker does not match the requested SHA-256.');
  }

  signalSourceExperimentMetadata = {
    version: marker.version,
    patchSetSha256: marker.patchSetSha256.toUpperCase(),
    isolatedRuntimeCopy: isIsolatedRuntimeCopy
  };
  signalExecutableCandidatesCache = [experimentExecutable];
  return signalExecutableCandidatesCache;
}

function signalRuntimeBindingPath(executablePath: string) {
  return join(dirname(executablePath), 'resources', 'df-runtime-binding.dat');
}

function translationCacheRoot() {
  return join(app.getPath('userData'), 'TranslationCache');
}

function translationCacheKeyPath() {
  return join(app.getPath('userData'), 'translation-cache-key.dat');
}

async function initializeTranslationCacheEncryption(binding: RuntimeBindingPayload) {
  if (translationCacheKey) return;
  if (translationCacheInitialization) return translationCacheInitialization;
  translationCacheInitialization = (async () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows DPAPI 当前不可用，无法加密翻译缓存');
    try {
      const file = JSON.parse(await readFile(translationCacheKeyPath(), 'utf8')) as TranslationCacheKeyFile;
      if (
        file.schemaVersion !== 3 ||
        file.suiteId !== binding.suiteId ||
        file.dataRootId !== binding.dataRootId ||
        !file.protectedKey
      ) throw new Error('翻译缓存密钥与当前授权数据根不匹配');
      const key = Buffer.from(safeStorage.decryptString(Buffer.from(file.protectedKey, 'base64')), 'base64');
      if (key.length !== 32) throw new Error('翻译缓存密钥长度无效');
      translationCacheKey = key;
      await cleanupLegacyTranslationCacheArtifacts();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
    }

    await rm(translationCacheRoot(), { recursive: true, force: true });
    const key = randomBytes(32);
    const file: TranslationCacheKeyFile = {
      schemaVersion: 3,
      suiteId: binding.suiteId,
      dataRootId: binding.dataRootId,
      protectedKey: safeStorage.encryptString(key.toString('base64')).toString('base64'),
      createdAt: new Date().toISOString()
    };
    await writeJsonAtomic(translationCacheKeyPath(), file);
    translationCacheKey = key;
  })().finally(() => {
    translationCacheInitialization = null;
  });
  return translationCacheInitialization;
}

async function migrateTranslationCacheSuiteBinding(
  sourceSuiteId: string,
  targetSuiteId: string,
  dataRootId: string
) {
  let file: TranslationCacheKeyFile;
  try {
    file = JSON.parse(await readFile(translationCacheKeyPath(), 'utf8')) as TranslationCacheKeyFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
  if (
    file.schemaVersion !== 3 ||
    file.dataRootId !== dataRootId ||
    !file.protectedKey ||
    (file.suiteId !== sourceSuiteId && file.suiteId !== targetSuiteId)
  ) throw new Error('翻译缓存不属于本次合法升级的数据根');
  const key = Buffer.from(safeStorage.decryptString(Buffer.from(file.protectedKey, 'base64')), 'base64');
  if (key.length !== 32) throw new Error('翻译缓存密钥长度无效');
  key.fill(0);
  if (file.suiteId === targetSuiteId) return;
  await writeJsonAtomic(translationCacheKeyPath(), {
    ...file,
    suiteId: targetSuiteId
  });
}

async function cleanupLegacyTranslationCacheArtifacts() {
  let entries: Dirent[];
  try {
    entries = await readdir(translationCacheRoot(), { withFileTypes: true });
  } catch {
    return;
  }
  const removable = entries.filter((entry) =>
    (entry.isDirectory() && (entry.name === 'v2' || supportedPlatforms.has(entry.name as Platform))) ||
    (entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
  );
  await Promise.all(removable.map((entry) => removePathWithRetry(containedPath(translationCacheRoot(), entry.name))));
}

function requireTranslationCacheKey() {
  if (!translationCacheKey || !activeRuntimeSecurity) throw new Error('翻译缓存加密尚未初始化');
  return translationCacheKey;
}

function translationCacheRecordAad(cacheDir: string, chunkFile: string) {
  if (!activeRuntimeSecurity) throw new Error('翻译缓存运行时绑定尚未建立');
  const relativeDir = relative(resolve(translationCacheRoot()), resolve(cacheDir));
  if (!relativeDir || relativeDir.startsWith('..') || isAbsolute(relativeDir)) {
    throw new Error('翻译缓存目录越过授权数据根');
  }
  return Buffer.from(JSON.stringify([
    'maoyi-translation-cache-v3',
    activeRuntimeSecurity.payload.suiteId,
    activeRuntimeSecurity.payload.dataRootId,
    relativeDir.replace(/\\/g, '/'),
    chunkFile
  ]));
}

function encryptTranslationCacheEntry(cacheDir: string, chunkFile: string, entry: TranslationCacheEntry) {
  return encryptTranslationCacheRecord(
    requireTranslationCacheKey(),
    translationCacheRecordAad(cacheDir, chunkFile),
    entry
  );
}

function decryptTranslationCacheEntry(cacheDir: string, chunkFile: string, record: EncryptedTranslationCacheRecord) {
  return decryptTranslationCacheRecord<TranslationCacheEntry>(
    requireTranslationCacheKey(),
    translationCacheRecordAad(cacheDir, chunkFile),
    record
  );
}

type LockCredentialFormat = 'legacy-6-digit' | 'digits6-letters2' | 'digits8';

type ProtectedLockCredential = {
  schemaVersion: 1;
  format: LockCredentialFormat;
  salt: string;
  pinHash: string;
};

type LockScreenStateBase = {
  version: number;
  enabled: boolean;
  failedAttempts: number;
  lockedUntil: number;
  createdAt: number;
  updatedAt: number;
};

type LegacyLockScreenState = LockScreenStateBase & {
  version: 1;
  salt: string;
  pinHash: string;
};

type ProtectedLockScreenState = LockScreenStateBase & {
  version: 2;
  credentialFormat: LockCredentialFormat;
  protectedCredential: string;
};

type UnreadableLockScreenState = LockScreenStateBase & {
  version: 0;
  credentialError: string;
};

type LockScreenState = LegacyLockScreenState | ProtectedLockScreenState | UnreadableLockScreenState;

type LockPinChangeAuthorization = {
  senderId: number;
  mode: LockScreenPinChangeMode;
  stateVersion: number;
  stateUpdatedAt: number;
  expiresAt: number;
};

const lockScreenMaxAttempts = 3;
const networkOfflineSampleDelayMs = 250;
const localRouteCheckTimeoutMs = 2_000;
const lockPinChangeAuthorizationTtlMs = 15 * 60 * 1000;
const legacyUpgradeAuthorizationTtlMs = 15 * 60 * 1000;
const lockPinChangeAuthorizations = new Map<string, LockPinChangeAuthorization>();
let legacyUpgradeAuthorizedUntil = 0;

function defaultLockScreenStatus(): LockScreenStatus {
  return {
    enabled: false,
    lockedUntil: 0,
    failedAttempts: 0,
    maxAttempts: lockScreenMaxAttempts,
    requiresUpgrade: false
  };
}

function lockScreenStateRequiresUpgrade(state: LockScreenState | null) {
  return Boolean(
    state?.enabled &&
    (state.version === 1 || (state.version === 2 && state.credentialFormat !== 'digits8'))
  );
}

function lockScreenStatusFromState(state: LockScreenState | null): LockScreenStatus {
  if (!state?.enabled) return defaultLockScreenStatus();
  return {
    enabled: true,
    lockedUntil: state.lockedUntil || 0,
    failedAttempts: state.failedAttempts || 0,
    maxAttempts: lockScreenMaxAttempts,
    requiresUpgrade: lockScreenStateRequiresUpgrade(state),
    credentialFormat: state.version === 1
      ? 'legacy-6-digit'
      : state.version === 2
        ? state.credentialFormat
        : undefined
  };
}

function unreadableLockScreenState(reason: string): UnreadableLockScreenState {
  return {
    version: 0,
    enabled: true,
    failedAttempts: lockScreenMaxAttempts,
    lockedUntil: 0,
    createdAt: 0,
    updatedAt: 0,
    credentialError: reason
  };
}

function lockStateNumbers(value: Record<string, unknown>) {
  return {
    failedAttempts: Number.isInteger(value.failedAttempts) ? Math.max(0, Number(value.failedAttempts)) : 0,
    lockedUntil: Number.isFinite(value.lockedUntil) ? Math.max(0, Number(value.lockedUntil)) : 0,
    createdAt: Number.isFinite(value.createdAt) ? Math.max(0, Number(value.createdAt)) : Date.now(),
    updatedAt: Number.isFinite(value.updatedAt) ? Math.max(0, Number(value.updatedAt)) : Date.now()
  };
}

function assertSafeStorageAvailable(action: string) {
  if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) {
    throw new Error(`Windows 安全存储不可用，无法${action}锁屏凭据`);
  }
}

function protectLockCredential(credential: ProtectedLockCredential) {
  assertSafeStorageAvailable('安全保存');
  return safeStorage.encryptString(JSON.stringify(credential)).toString('base64');
}

function unprotectLockCredential(state: ProtectedLockScreenState): ProtectedLockCredential {
  assertSafeStorageAvailable('读取');
  try {
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(state.protectedCredential, 'base64'))) as ProtectedLockCredential;
    if (
      parsed?.schemaVersion !== 1 ||
      (parsed.format !== 'legacy-6-digit' && parsed.format !== 'digits6-letters2' && parsed.format !== 'digits8') ||
      parsed.format !== state.credentialFormat ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.pinHash !== 'string'
    ) {
      throw new Error('invalid protected credential');
    }
    return parsed;
  } catch {
    throw new Error('锁屏凭据无法由本机 Windows 安全存储解密；锁屏保持启用，请离线重置凭据');
  }
}

async function migrateLegacyLockScreenState(state: LegacyLockScreenState): Promise<ProtectedLockScreenState> {
  const migrated: ProtectedLockScreenState = {
    version: 2,
    enabled: true,
    credentialFormat: 'legacy-6-digit',
    protectedCredential: protectLockCredential({
      schemaVersion: 1,
      format: 'legacy-6-digit',
      salt: state.salt,
      pinHash: state.pinHash
    }),
    failedAttempts: state.failedAttempts,
    lockedUntil: state.lockedUntil,
    createdAt: state.createdAt,
    updatedAt: Date.now()
  };
  await writeLockScreenState(migrated);
  return migrated;
}

async function readLockScreenState(): Promise<LockScreenState | null> {
  let raw = '';
  try {
    raw = await readFile(lockScreenPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return unreadableLockScreenState('锁屏状态文件无法读取');
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || parsed.enabled !== true) return unreadableLockScreenState('锁屏状态文件格式无效');
    const numbers = lockStateNumbers(parsed);
    if (parsed.version === 2) {
      if (
        (parsed.credentialFormat !== 'legacy-6-digit' && parsed.credentialFormat !== 'digits6-letters2' && parsed.credentialFormat !== 'digits8') ||
        typeof parsed.protectedCredential !== 'string' ||
        !parsed.protectedCredential
      ) {
        return unreadableLockScreenState('锁屏凭据密文格式无效');
      }
      const protectedState: ProtectedLockScreenState = {
        version: 2,
        enabled: true,
        credentialFormat: parsed.credentialFormat,
        protectedCredential: parsed.protectedCredential,
        ...numbers
      };
      try {
        unprotectLockCredential(protectedState);
        return protectedState;
      } catch (error) {
        return unreadableLockScreenState(error instanceof Error ? error.message : '锁屏凭据密文无法读取');
      }
    }
    if (
      (parsed.version === 1 || parsed.version === undefined) &&
      typeof parsed.salt === 'string' &&
      typeof parsed.pinHash === 'string' &&
      parsed.salt &&
      parsed.pinHash
    ) {
      const legacy: LegacyLockScreenState = {
        version: 1,
        enabled: true,
        salt: parsed.salt,
        pinHash: parsed.pinHash,
        ...numbers
      };
      if (process.platform === 'win32' && safeStorage.isEncryptionAvailable()) {
        try {
          return await migrateLegacyLockScreenState(legacy);
        } catch {
          return legacy;
        }
      }
      return legacy;
    }
    return unreadableLockScreenState('锁屏状态文件格式无效');
  } catch {
    return unreadableLockScreenState('锁屏状态文件格式无效');
  }
}

async function writeLockScreenState(state: LockScreenState) {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeJsonAtomic(lockScreenPath(), state);
}

function normalizeNewLockCredential(value: string) {
  if (!/^\d{8}$/.test(value)) {
    throw new Error('锁屏凭据必须为 8 位数字');
  }
  return value;
}

function normalizeCredentialForFormat(value: string, format: LockCredentialFormat) {
  if (format === 'legacy-6-digit') {
    if (!/^\d{6}$/.test(value)) throw new Error('旧版锁屏凭据必须为 6 位数字');
    return value;
  }
  if (format === 'digits6-letters2') {
    const credential = value.toUpperCase();
    if (!/^\d{6}[A-Z]{2}$/.test(credential)) throw new Error('旧版锁屏凭据必须为前 6 位数字加后 2 位英文字母');
    return credential;
  }
  return normalizeNewLockCredential(value);
}

function hashLockPin(pin: string, salt: string) {
  return scryptSync(pin, Buffer.from(salt, 'base64'), 64).toString('base64');
}

function readRouteTable(args: string[]) {
  return new Promise<string>((resolvePromise, reject) => {
    execFile(
      'route.exe',
      args,
      { windowsHide: true, timeout: localRouteCheckTimeoutMs, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(stdout);
      }
    );
  });
}

async function sampleNetworkOffline() {
  if (process.platform !== 'win32') return { offline: false, uncertain: true };
  let hasNonLoopbackInterface = false;
  try {
    hasNonLoopbackInterface = Object.values(networkInterfaces()).some((addresses) =>
      (addresses || []).some((address) => !address.internal && Boolean(address.address))
    );
  } catch {
    return { offline: false, uncertain: true };
  }

  try {
    const [ipv4Routes, ipv6Routes] = await Promise.all([
      readRouteTable(['PRINT', '0.0.0.0']),
      readRouteTable(['PRINT', '-6', '::/0'])
    ]);
    const hasIpv4DefaultRoute = /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+/m.test(ipv4Routes);
    const hasIpv6DefaultRoute = /^\s*(?:\d+\s+\d+\s+)?::\/0\s+/m.test(ipv6Routes);
    return {
      offline: !hasNonLoopbackInterface && !hasIpv4DefaultRoute && !hasIpv6DefaultRoute,
      uncertain: false
    };
  } catch {
    return { offline: false, uncertain: true };
  }
}

async function inspectNetworkOfflineTwice(): Promise<NetworkOfflineCheckResult> {
  const first = await sampleNetworkOffline();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, networkOfflineSampleDelayMs));
  const second = await sampleNetworkOffline();
  const checkedAt = Date.now();
  if (first.uncertain || second.uncertain) {
    return { offline: false, checkedAt, reason: '无法确认本机已断网，已拒绝设置或重置锁屏凭据' };
  }
  if (!first.offline || !second.offline) {
    return { offline: false, checkedAt, reason: '检测到本机仍有活动网络连接，请断开网络后重试' };
  }
  return { offline: true, checkedAt };
}

async function checkNetworkOffline(): Promise<NetworkOfflineCheckResult> {
  return inspectNetworkOfflineTwice();
}

function lockPinChangeModeAllowed(
  state: LockScreenState | null,
  mode: LockScreenPinChangeMode,
  now = Date.now()
) {
  if (mode === 'setup') return !state?.enabled;
  if (mode === 'reset') return Boolean(state?.enabled && state.failedAttempts >= lockScreenMaxAttempts);
  return Boolean(state?.enabled && lockScreenStateRequiresUpgrade(state) && legacyUpgradeAuthorizedUntil >= now);
}

function lockPinChangeModeError(state: LockScreenState | null, mode: LockScreenPinChangeMode) {
  if (mode === 'setup') return state?.enabled ? '锁屏凭据已存在，不能重复执行首次设置' : '当前状态不能首次设置锁屏凭据';
  if (mode === 'reset') return '当前尚未达到锁屏凭据重置条件';
  if (!lockScreenStateRequiresUpgrade(state)) return '当前锁屏凭据不需要升级';
  return '请先使用旧版凭据成功解锁，再升级锁屏凭据';
}

async function authorizeLockScreenPinChange(
  senderId: number,
  mode: LockScreenPinChangeMode
): Promise<LockScreenPinChangeAuthorizationResult> {
  const state = await readLockScreenState();
  if (!lockPinChangeModeAllowed(state, mode)) {
    return { ok: false, reason: lockPinChangeModeError(state, mode), status: lockScreenStatusFromState(state) };
  }
  const networkResult = await inspectNetworkOfflineTwice();
  if (!networkResult.offline) {
    return { ok: false, reason: networkResult.reason, status: lockScreenStatusFromState(state) };
  }
  const now = Date.now();
  for (const [existingToken, authorization] of lockPinChangeAuthorizations) {
    if (authorization.expiresAt <= now || authorization.senderId === senderId) {
      lockPinChangeAuthorizations.delete(existingToken);
    }
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + lockPinChangeAuthorizationTtlMs;
  lockPinChangeAuthorizations.set(token, {
    senderId,
    mode,
    stateVersion: state?.version ?? -1,
    stateUpdatedAt: state?.updatedAt ?? 0,
    expiresAt
  });
  return { ok: true, token, expiresAt, status: lockScreenStatusFromState(state) };
}

function consumeLockPinChangeAuthorization(senderId: number, token: string) {
  const authorization = lockPinChangeAuthorizations.get(token);
  lockPinChangeAuthorizations.delete(token);
  if (!authorization || authorization.senderId !== senderId || authorization.expiresAt <= Date.now()) {
    throw new Error('锁屏凭据设置授权无效或已过期，请重新断网检查');
  }
  return authorization;
}

async function getLockScreenStatus(): Promise<LockScreenStatus> {
  return lockScreenStatusFromState(await readLockScreenState());
}

async function setLockScreenPin(senderId: number, pin: string, token: string): Promise<LockScreenSetPinResult> {
  try {
    const credential = normalizeNewLockCredential(pin);
    const authorization = consumeLockPinChangeAuthorization(senderId, token);
    const currentState = await readLockScreenState();
    if (
      authorization.stateVersion !== (currentState?.version ?? -1) ||
      authorization.stateUpdatedAt !== (currentState?.updatedAt ?? 0) ||
      !lockPinChangeModeAllowed(currentState, authorization.mode)
    ) {
      throw new Error('锁屏状态已变化，请重新断网检查并申请设置授权');
    }
    const networkResult = await inspectNetworkOfflineTwice();
    if (!networkResult.offline) {
      throw new Error(networkResult.reason || '无法确认本机已断网，已拒绝设置或重置锁屏凭据');
    }
    const now = Date.now();
    const salt = randomBytes(16).toString('base64');
    const state: ProtectedLockScreenState = {
      version: 2,
      enabled: true,
      credentialFormat: 'digits8',
      protectedCredential: protectLockCredential({
        schemaVersion: 1,
        format: 'digits8',
        salt,
        pinHash: hashLockPin(credential, salt)
      }),
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: currentState?.createdAt || now,
      updatedAt: now
    };
    await writeLockScreenState(state);
    legacyUpgradeAuthorizedUntil = 0;
    if (remoteGuardIncidentLatched && !remoteGuardThreatActive) clearRemoteGuardIncident();
    releaseWorkspaceVisibilityLock();
    return { ok: true, status: lockScreenStatusFromState(state) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '设置或重置锁屏凭据失败', status: await getLockScreenStatus() };
  }
}

async function unlockLockScreen(pin: string): Promise<LockScreenUnlockResult> {
  let state = await readLockScreenState();
  if (!state?.enabled) return { ok: false, reason: '请先设置锁屏凭据', status: defaultLockScreenStatus() };
  if (remoteGuardThreatActive) {
    return { ok: false, reason: '十万伏特仍检测到远控，工作区保持锁定', status: lockScreenStatusFromState(state) };
  }
  if (state.version === 0) {
    return { ok: false, reason: `${state.credentialError}；请断网重置锁屏凭据`, status: lockScreenStatusFromState(state) };
  }
  if (state.version === 1) {
    try {
      state = await migrateLegacyLockScreenState(state);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : '旧版锁屏凭据无法安全迁移；锁屏保持启用',
        status: lockScreenStatusFromState(state)
      };
    }
  }

  let protectedCredential: ProtectedLockCredential;
  try {
    protectedCredential = unprotectLockCredential(state);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '锁屏凭据无法读取；锁屏保持启用',
      status: lockScreenStatusFromState(state)
    };
  }

  const now = Date.now();
  let normalized = '';
  try {
    normalized = normalizeCredentialForFormat(pin, protectedCredential.format);
  } catch {
    normalized = '';
  }
  const expected = Buffer.from(protectedCredential.pinHash, 'base64');
  const actual = normalized
    ? Buffer.from(hashLockPin(normalized, protectedCredential.salt), 'base64')
    : Buffer.alloc(0);
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (ok) {
    state.failedAttempts = 0;
    state.lockedUntil = 0;
    state.updatedAt = now;
    await writeLockScreenState(state);
    if (protectedCredential.format !== 'digits8') {
      legacyUpgradeAuthorizedUntil = now + legacyUpgradeAuthorizationTtlMs;
    } else {
      if (remoteGuardIncidentLatched) clearRemoteGuardIncident();
      releaseWorkspaceVisibilityLock();
    }
    return { ok: true, status: lockScreenStatusFromState(state) };
  }

  state.failedAttempts = (state.failedAttempts || 0) + 1;
  let reason = `锁屏凭据错误，还可尝试 ${Math.max(0, lockScreenMaxAttempts - state.failedAttempts)} 次`;
  if (state.failedAttempts >= lockScreenMaxAttempts) {
    state.failedAttempts = lockScreenMaxAttempts;
    state.lockedUntil = 0;
    reason = '锁屏凭据错误次数已达上限，请断网后重置';
  }
  state.updatedAt = now;
  await writeLockScreenState(state);
  return { ok: false, reason, status: lockScreenStatusFromState(state) };
}

function isEnglishChatSource(value: string | undefined) {
  const text = (value || '').trim();
  if (!/[A-Za-z]/.test(text)) return false;
  return !/[\u3400-\u9fff]/u.test(text);
}

function nonEnglishContactMarkerPath(request: NonEnglishContactRequest) {
  const identity = request.contactId || request.contactTitle || 'unknown-contact';
  return join(
    translationCacheRoot(),
    'excluded-contacts',
    safePathPart(request.platform || 'unknown'),
    safeProfileFileName(request.profileId),
    `${safePathPart(request.contactIdType || 'unknown')}-${hashForLog(identity)}.json`
  );
}

async function isMarkedNonEnglishContact(request: NonEnglishContactRequest) {
  if (!request.profileId || (!request.contactId && !request.contactTitle)) return false;
  return pathExists(nonEnglishContactMarkerPath(request));
}

async function markNonEnglishContact(request: NonEnglishContactRequest) {
  if (!request.profileId || (!request.contactId && !request.contactTitle)) return;
  const markerPath = nonEnglishContactMarkerPath(request);
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify({ schemaVersion: 1, markedAt: new Date().toISOString() })}\n`, 'utf8');
  await rm(chunkedTranslationCacheDir(request), { recursive: true, force: true });
}

function safeProfileFileName(profileId: string) {
  return assertProfileId(profileId);
}

function safePathPart(value: string) {
  return (value || 'unknown')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'unknown';
}

function translationCacheContactKey(request: TranslationCacheLoadRequest | TranslationCacheSetRequest) {
  if (request.contactId) {
    return safePathPart(`${request.contactIdType || 'unknown'}-${request.contactId}`);
  }
  return 'unknown-contact';
}

function chunkedTranslationCacheDir(request: TranslationCacheLoadRequest | TranslationCacheSetRequest) {
  return join(
    translationCacheRoot(),
    'v3',
    safePathPart(request.platform || 'unknown-platform'),
    safeProfileFileName(request.profileId),
    translationCacheContactKey(request)
  );
}

function chunkedTranslationCacheIndexPath(request: TranslationCacheLoadRequest | TranslationCacheSetRequest) {
  return join(chunkedTranslationCacheDir(request), 'index.json');
}

function defaultTranslationCacheIndex(): TranslationCacheIndex {
  return {
    schemaVersion: 3,
    updatedAt: Date.now(),
    chunks: []
  };
}

function defaultConfig(): AppConfig {
  return {
    profiles: [],
    activeProfileId: null,
    profileTabOrder: [],
    lastActiveProfileIds: {
      whatsapp: null,
      telegram: null,
      signal: null,
      opensms: null
    },
    activeTheme: 'blackGold',
    eyeCareTranslationEnabled: false,
    deepseekModel: defaultModel
  };
}

function getMemoryStatus() {
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return {
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
  };
}

async function readConfig(): Promise<AppConfig> {
  assertClientRuntimeAllowed();
  await migrateLegacyUserDataDir();
  const fallbackProfiles = await readProfileBackup();
  try {
    const raw = (await readFile(configPath(), 'utf8')).replace(/^\uFEFF/, '');
    const config = sanitizeConfig({ ...defaultConfig(), ...JSON.parse(raw) });
    if (!config.profiles.length && fallbackProfiles.length) {
      return sanitizeConfig({ ...config, profiles: fallbackProfiles, activeProfileId: fallbackProfiles[0]?.id ?? null });
    }
    return config;
  } catch {
    return sanitizeConfig({
      ...defaultConfig(),
      profiles: fallbackProfiles,
      activeProfileId: fallbackProfiles[0]?.id ?? null
    });
  }
}

async function readDevelopmentServiceSecret() {
  if (app.isPackaged) return '';
  if (translationDiagnosticsEnabled) return diagnosticServiceSecret;
  const environmentSecret = process.env.MAOYI_SERVICE_SECRET?.trim();
  if (environmentSecret) return environmentSecret;
  try {
    const raw = (await readFile(join(process.cwd(), '.package-secrets', 'trial-config.json'), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as { deepseekApiKey?: unknown };
    return typeof parsed.deepseekApiKey === 'string' ? parsed.deepseekApiKey.trim() : '';
  } catch {
    return '';
  }
}

let translationPromptsCache: TranslationPrompts | null = null;
let customChineseToEnglishPromptCache: string | null | undefined;
let smartReplyPromptCache: SmartReplyPrompt | null = null;
let promptSigningPublicCache: {
  translation: PromptSigningPublicIdentity;
  smartReply: PromptSigningPublicIdentity;
} | null = null;

function publicPromptSigningIdentity(value: Record<string, unknown>): PromptSigningPublicIdentity {
  return {
    suiteId: String(value.suiteId || ''),
    keyId: String(value.keyId || ''),
    publicKeyPem: String(value.publicKeyPem || ''),
    publicKeySha256: String(value.publicKeySha256 || '')
  };
}

async function loadPromptSigningPublicIdentities() {
  if (promptSigningPublicCache) return promptSigningPublicCache;
  if (app.isPackaged) {
    promptSigningPublicCache = clientLicenseManager!.getPromptSigningPublicIdentities();
    return promptSigningPublicCache;
  }
  const path = join(developmentProjectRoot, '.package-secrets', 'developer-prompt-signing.json');
  const parsed = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as Record<string, Record<string, unknown>>;
  promptSigningPublicCache = {
    translation: publicPromptSigningIdentity(parsed.translation || {}),
    smartReply: publicPromptSigningIdentity(parsed.smartReply || {})
  };
  return promptSigningPublicCache;
}

function packagedTranslationPromptPath() {
  return join(process.resourcesPath, translationPromptBundleFileName);
}

function activeTranslationPromptPath() {
  return join(app.getPath('userData'), 'security', translationPromptBundleFileName);
}

function pendingTranslationPromptPath() {
  return `${activeTranslationPromptPath()}.pending`;
}

function translationPromptStatePath() {
  return join(app.getPath('userData'), 'security', 'translation-prompts-state.json');
}

function translationCustomizationPath() {
  return join(app.getPath('userData'), 'security', 'translation-customization.json');
}

async function loadCustomChineseToEnglishPrompt() {
  if (customChineseToEnglishPromptCache !== undefined) return customChineseToEnglishPromptCache;
  const raw = await readOptionalText(translationCustomizationPath());
  if (!raw) {
    customChineseToEnglishPromptCache = null;
    return null;
  }
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 本机加密不可用');
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    if (envelope.schemaVersion !== 1 || typeof envelope.protectedPayload !== 'string') {
      throw new Error('自定义提示词存储格式无效');
    }
    const decrypted = safeStorage.decryptString(Buffer.from(envelope.protectedPayload, 'base64'));
    const payload = JSON.parse(decrypted) as Record<string, unknown>;
    const editable = normalizeChineseToEnglishEditablePrompt(payload.editableChineseToEnglish);
    customChineseToEnglishPromptCache = editable === defaultChineseToEnglishEditablePrompt ? null : editable;
    return customChineseToEnglishPromptCache;
  } catch {
    // Tampering or corruption must never weaken the fixed rules. Revert to the signed default.
    await rm(translationCustomizationPath(), { force: true }).catch(() => undefined);
    customChineseToEnglishPromptCache = null;
    return null;
  }
}

async function getTranslationCustomization(): Promise<TranslationCustomizationStatus> {
  const editable = await loadCustomChineseToEnglishPrompt();
  return {
    editableChineseToEnglish: editable ?? defaultChineseToEnglishEditablePrompt,
    customized: editable !== null
  };
}

async function saveTranslationCustomization(value: unknown): Promise<TranslationCustomizationStatus> {
  const editable = normalizeChineseToEnglishEditablePrompt(value);
  if (editable === defaultChineseToEnglishEditablePrompt) {
    await rm(translationCustomizationPath(), { force: true });
    customChineseToEnglishPromptCache = null;
    return getTranslationCustomization();
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 本机加密不可用，无法安全保存自定义内容');
  const protectedPayload = safeStorage.encryptString(JSON.stringify({
    schemaVersion: 1,
    editableChineseToEnglish: editable,
    updatedAt: new Date().toISOString()
  })).toString('base64');
  await writeTextAtomic(translationCustomizationPath(), JSON.stringify({
    schemaVersion: 1,
    protectedPayload
  }));
  customChineseToEnglishPromptCache = editable;
  return getTranslationCustomization();
}

async function resetTranslationCustomization(): Promise<TranslationCustomizationStatus> {
  await rm(translationCustomizationPath(), { force: true });
  customChineseToEnglishPromptCache = null;
  return getTranslationCustomization();
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return '';
    throw error;
  }
}

// ATOMIC_FILE_WRITES_START
const atomicFileWriteQueues = new Map<string, Promise<void>>();

async function writeTextAtomic(path: string, value: string) {
  const queueKey = resolve(path);
  const previous = atomicFileWriteQueues.get(queueKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tempPath, value, 'utf8');
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(tempPath, path);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(code || '')) throw error;
          await new Promise(resolvePromise => setTimeout(resolvePromise, 25 * 2 ** attempt));
        }
      }
    } finally {
      // Never remove the last valid destination to work around a file lock.
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  });
  atomicFileWriteQueues.set(queueKey, next);
  try { await next; }
  finally {
    if (atomicFileWriteQueues.get(queueKey) === next) atomicFileWriteQueues.delete(queueKey);
  }
}
// ATOMIC_FILE_WRITES_END

async function recordPackagedTranslationPromptHash(hash: string) {
  await mkdir(dirname(translationPromptStatePath()), { recursive: true });
  await writeJsonAtomic(translationPromptStatePath(), { schemaVersion: 1, packagedHash: hash });
}

async function readRecordedPackagedTranslationPromptHash() {
  try {
    const parsed = JSON.parse(await readFile(translationPromptStatePath(), 'utf8')) as Record<string, unknown>;
    return parsed.schemaVersion === 1 && typeof parsed.packagedHash === 'string' ? parsed.packagedHash : '';
  } catch {
    return '';
  }
}

async function loadTranslationPrompts() {
  if (translationPromptsCache) return translationPromptsCache;
  const signing = await loadPromptSigningPublicIdentities();
  if (!app.isPackaged) {
    const raw = await readOptionalText(join(developmentProjectRoot, '.package-secrets', 'development', translationPromptBundleFileName));
    if (!raw) throw new Error(`缺少加密提示词文件：${translationPromptBundleFileName}`);
    translationPromptsCache = verifyTranslationPromptBundle(signing.translation, raw);
    return translationPromptsCache;
  }

  const packagedRaw = await readOptionalText(packagedTranslationPromptPath());
  const packagedHash = packagedRaw ? createHash('sha256').update(packagedRaw).digest('hex') : '';
  const recordedHash = await readRecordedPackagedTranslationPromptHash();
  if (packagedRaw && packagedHash !== recordedHash) {
    try {
      const imported = verifyTranslationPromptBundle(signing.translation, packagedRaw);
      await writeTextAtomic(activeTranslationPromptPath(), packagedRaw);
      await recordPackagedTranslationPromptHash(packagedHash);
      translationPromptsCache = imported;
      return imported;
    } catch {
      // A packaged file encrypted with the previous authorization must not block a valid active copy.
    }
  }

  const pendingRaw = await readOptionalText(pendingTranslationPromptPath());
  if (pendingRaw) {
    try {
      const recovered = verifyTranslationPromptBundle(signing.translation, pendingRaw);
      await writeTextAtomic(activeTranslationPromptPath(), pendingRaw);
      await rm(pendingTranslationPromptPath(), { force: true });
      translationPromptsCache = recovered;
      return recovered;
    } catch {
      // A pending file for an uncommitted authorization is ignored.
    }
  }

  const activeRaw = await readOptionalText(activeTranslationPromptPath());
  if (activeRaw) {
    translationPromptsCache = verifyTranslationPromptBundle(signing.translation, activeRaw);
    return translationPromptsCache;
  }
  if (!packagedRaw) throw new Error(`缺少加密提示词文件：${translationPromptBundleFileName}`);
  translationPromptsCache = verifyTranslationPromptBundle(signing.translation, packagedRaw);
  await writeTextAtomic(activeTranslationPromptPath(), packagedRaw);
  await recordPackagedTranslationPromptHash(packagedHash);
  return translationPromptsCache;
}

function packagedSmartReplyPromptPath() {
  return join(process.resourcesPath, smartReplyPromptBundleFileName);
}

function activeSmartReplyPromptPath() {
  return join(app.getPath('userData'), 'security', smartReplyPromptBundleFileName);
}

function pendingSmartReplyPromptPath() {
  return `${activeSmartReplyPromptPath()}.pending`;
}

function smartReplyPromptStatePath() {
  return join(app.getPath('userData'), 'security', 'smart-reply-prompt-state.json');
}

async function recordPackagedSmartReplyPromptHash(hash: string) {
  await mkdir(dirname(smartReplyPromptStatePath()), { recursive: true });
  await writeJsonAtomic(smartReplyPromptStatePath(), { schemaVersion: 1, packagedHash: hash });
}

async function readRecordedPackagedSmartReplyPromptHash() {
  try {
    const parsed = JSON.parse(await readFile(smartReplyPromptStatePath(), 'utf8')) as Record<string, unknown>;
    return parsed.schemaVersion === 1 && typeof parsed.packagedHash === 'string' ? parsed.packagedHash : '';
  } catch {
    return '';
  }
}

async function smartReplyPromptBundleExists() {
  const candidates = app.isPackaged
    ? [packagedSmartReplyPromptPath(), pendingSmartReplyPromptPath(), activeSmartReplyPromptPath()]
    : [join(developmentProjectRoot, '.package-secrets', 'development', smartReplyPromptBundleFileName)];
  for (const path of candidates) {
    if (await readOptionalText(path)) return true;
  }
  return false;
}

async function loadSmartReplyPrompt() {
  if (smartReplyPromptCache) return smartReplyPromptCache;
  const signing = await loadPromptSigningPublicIdentities();
  if (!app.isPackaged) {
    const raw = await readOptionalText(join(developmentProjectRoot, '.package-secrets', 'development', smartReplyPromptBundleFileName));
    if (!raw) throw new Error(`Missing encrypted smart reply prompt file: ${smartReplyPromptBundleFileName}`);
    smartReplyPromptCache = verifySmartReplyPromptBundle(signing.smartReply, raw);
    return smartReplyPromptCache;
  }

  const packagedRaw = await readOptionalText(packagedSmartReplyPromptPath());
  const packagedHash = packagedRaw ? createHash('sha256').update(packagedRaw).digest('hex') : '';
  const recordedHash = await readRecordedPackagedSmartReplyPromptHash();
  if (packagedRaw && packagedHash !== recordedHash) {
    try {
      const imported = verifySmartReplyPromptBundle(signing.smartReply, packagedRaw);
      await writeTextAtomic(activeSmartReplyPromptPath(), packagedRaw);
      await recordPackagedSmartReplyPromptHash(packagedHash);
      smartReplyPromptCache = imported;
      return imported;
    } catch {
      // A newly installed bundle may belong to the previous authorization. A
      // valid active copy remains authoritative in that case.
    }
  }

  const pendingRaw = await readOptionalText(pendingSmartReplyPromptPath());
  if (pendingRaw) {
    try {
      const recovered = verifySmartReplyPromptBundle(signing.smartReply, pendingRaw);
      await writeTextAtomic(activeSmartReplyPromptPath(), pendingRaw);
      await rm(pendingSmartReplyPromptPath(), { force: true });
      smartReplyPromptCache = recovered;
      return recovered;
    } catch {
      // Ignore data staged for an authorization that never committed.
    }
  }

  const activeRaw = await readOptionalText(activeSmartReplyPromptPath());
  if (activeRaw) {
    smartReplyPromptCache = verifySmartReplyPromptBundle(signing.smartReply, activeRaw);
    return smartReplyPromptCache;
  }
  if (!packagedRaw) throw new Error(`Missing encrypted smart reply prompt file: ${smartReplyPromptBundleFileName}`);
  smartReplyPromptCache = verifySmartReplyPromptBundle(signing.smartReply, packagedRaw);
  await writeTextAtomic(activeSmartReplyPromptPath(), packagedRaw);
  await recordPackagedSmartReplyPromptHash(packagedHash);
  return smartReplyPromptCache;
}

async function migrateLegacyUserDataDir() {
  if (await pathExists(configPath())) return;

  for (const sourceDir of legacyUserDataDirCandidates()) {
    if (!(await pathExists(join(sourceDir, 'config.json'))) && !(await pathExists(join(sourceDir, 'profiles.json')))) {
      continue;
    }
    await mkdir(app.getPath('userData'), { recursive: true });
    await copyLegacyConfigFile(sourceDir, 'config.json');
    await copyLegacyConfigFile(sourceDir, 'profiles.json');
    return;
  }
}

async function copyLegacyConfigFile(sourceDir: string, fileName: string) {
  const sourcePath = join(sourceDir, fileName);
  const targetPath = join(app.getPath('userData'), fileName);
  if (!(await pathExists(sourcePath)) || (await pathExists(targetPath))) return;
  await cp(sourcePath, targetPath, { force: false });
}

async function readProfileBackup(): Promise<ChatProfile[]> {
  try {
    const raw = await readFile(profilesPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTranslationModel(model: unknown, flashDefaultApplied: boolean) {
  if (typeof model !== 'string' || !/^[a-z0-9._-]{1,64}$/i.test(model)) return defaultModel;
  if (model === 'deepseek-v4-flash') return 'deepseek-flash';
  // Migrate the temporary Pro default once; later explicit selections remain valid.
  if (!flashDefaultApplied && model === 'deepseek-v4-pro') return defaultModel;
  return model;
}

function sanitizeConfig(config: AppConfig): AppConfig {
  const rawProfiles = Array.isArray(config.profiles) ? config.profiles : [];
  const profiles = rawProfiles.filter((profile) => Boolean(
    profile &&
    profileIdPattern.test(profile.id) &&
    supportedPlatforms.has(profile.platform)
  )).map((profile, index) => {
    const fallbackFingerprint = buildFingerprint(index);
    const expectedSignalDataDir = profile.platform === 'signal' ? signalInstancePath(profile.id) : undefined;
    return {
      ...profile,
      name: String(profile.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || platformDefaults[profile.platform].label,
      group: String(profile.group || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || '本组',
      partition: `persist:chat-${profile.id}`,
      signalDataDir: expectedSignalDataDir,
      fingerprint: {
        ...fallbackFingerprint,
        ...profile.fingerprint,
        userAgent: resolveProfileUserAgent(
          profile.platform,
          profile.fingerprint?.userAgent,
          userAgentForPlatform(profile.platform)
        )
      }
    };
  });
  const activeProfileId = profiles.some((profile) => profile.id === config.activeProfileId)
    ? config.activeProfileId
    : profiles[0]?.id ?? null;
  const profileTabOrder = sanitizeProfileTabOrder(profiles, config.profileTabOrder);
  const lastActiveProfileIds = sanitizeLastActiveProfileIds(
    profiles,
    config.lastActiveProfileIds,
    activeProfileId,
    profileTabOrder
  );

  return {
    profiles,
    activeProfileId,
    profileTabOrder,
    lastActiveProfileIds,
    activeTheme: normalizeAppTheme(config.activeTheme),
    eyeCareTranslationEnabled: config.eyeCareTranslationEnabled === true,
    deepseekModel: normalizeTranslationModel(config.deepseekModel, config.flashDefaultApplied === true),
    flashDefaultApplied: true
  };
}

function userAgentForPlatform(platform: Platform) {
  if (platform === 'signal' || platform === 'opensms') return whatsappUserAgent;
  return platform === 'whatsapp' ? whatsappUserAgent : telegramUserAgent;
}

async function saveConfig(config: AppConfig): Promise<AppConfig> {
  assertClientRuntimeAllowed();
  const sanitizedConfig = sanitizeConfig(config);
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeJsonAtomic(configPath(), sanitizedConfig);
  await writeJsonAtomic(profilesPath(), sanitizedConfig.profiles);
  return sanitizedConfig;
}

async function writeJsonAtomic(path: string, value: unknown) {
  await writeTextAtomic(path, JSON.stringify(value, null, 2));
}

function hashForLog(text: string) {
  let hash = 2166136261;
  for (const char of text.replace(/\s+/g, ' ').trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function appendTranslateRequestLog(event: Record<string, unknown>) {
  if (profileLogEventIsBeingRemoved(event)) return;
  if (translationDiagnosticsEnabled) {
    recordTranslationDiagnostic(`api:${String(event.status || 'event')}`, event);
    return;
  }
  if (!runtimeLoggingEnabled) return;
  await enqueueProfileLogOperation(async () => {
    if (profileLogEventIsBeingRemoved(event)) return;
    try {
      await mkdir(app.getPath('userData'), { recursive: true });
      await appendFile(
        translateRequestLogPath(),
        `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
        'utf8'
      );
    } catch {
      // Logging must never block translation.
    }
  });
}

async function appendSignalTranslationDebugLog(event: Record<string, unknown>) {
  if (profileLogEventIsBeingRemoved(event)) return;
  if (translationDiagnosticsEnabled) {
    recordTranslationDiagnostic(`renderer:${String(event.type || 'event')}`, event);
    return;
  }
  if (!runtimeLoggingEnabled) return;
  await enqueueProfileLogOperation(async () => {
    if (profileLogEventIsBeingRemoved(event)) return;
    try {
      await mkdir(app.getPath('userData'), { recursive: true });
      await appendFile(
        signalTranslationDebugLogPath(),
        `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
        'utf8'
      );
    } catch {
      // Diagnostics must never block Signal translation.
    }
  });
}

function profileLogEventIsBeingRemoved(event: Record<string, unknown>) {
  return Array.from(profilesBeingRemoved).some(profileId =>
    event.profileId === profileId || event.userId === `df-${profileId}` ||
    event.appId === `signal:${profileId}` || event.appId === signalAppId(profileId)
  );
}

function enqueueProfileLogOperation(operation: () => Promise<void>) {
  const next = profileLogWriteQueue.catch(() => undefined).then(operation);
  profileLogWriteQueue = next.catch(() => undefined);
  return next;
}

function randomId() {
  return randomUUID();
}

function buildFingerprint(index: number): FingerprintProfile {
  const renderers = [
    ['Google Inc. (Intel)', 'ANGLE (Intel, Intel UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
    ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)'],
    ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)']
  ];
  const renderer = renderers[index % renderers.length];
  const primaryDisplay = screen.getPrimaryDisplay();
  const memoryGb = Math.max(1, Math.round(totalmem() / 1024 / 1024 / 1024));

  return {
    fingerprintId: randomId(),
    userAgent: whatsappUserAgent,
    languageSource: 'ip',
    languages: [],
    timezoneSource: 'ip',
    timezone: '',
    webglVendor: renderer[0],
    webglRenderer: renderer[1],
    hardwareSource: 'match',
    hardwareConcurrency: cpus().length || 4,
    deviceMemory: memoryGb,
    canvasSeed: crypto.getRandomValues(new Uint32Array(1))[0],
    screenSource: 'match',
    width: primaryDisplay.workAreaSize.width,
    height: primaryDisplay.workAreaSize.height
  };
}

let creatingOpenSms: Promise<ChatProfile> | null = null;
async function createProfile(platform: Platform, name: string, group: string): Promise<ChatProfile> {
  if(platform!=='opensms')return createProfileRecord(platform,name,group);
  if(creatingOpenSms)return creatingOpenSms;
  creatingOpenSms=createProfileRecord(platform,name,group);
  try{return await creatingOpenSms;}finally{creatingOpenSms=null;}
}
async function createProfileRecord(platform: Platform, name: string, group: string): Promise<ChatProfile> {
  const config = await readConfig();
  const nextName = name.trim();
  const nextGroup = group.trim();
  if (!nextName) throw new Error('Profile name is required.');
  if (!nextGroup) throw new Error('Profile group is required.');
  const id = randomId();
  const label = platformDefaults[platform].label;
  const samePlatformCount = config.profiles.filter((profile) => profile.platform === platform).length;
  const profile: ChatProfile = {
    id,
    name: nextName || `${label} ${samePlatformCount + 1}`,
    group: nextGroup,
    platform,
    partition: `persist:chat-${id}`,
    signalDataDir: platform === 'signal' ? signalInstancePath(id) : undefined,
    createdAt: Date.now(),
    fingerprint: { ...buildFingerprint(config.profiles.length), userAgent: userAgentForPlatform(platform) }
  };

  if (profile.signalDataDir) {
    await mkdir(profile.signalDataDir, { recursive: true });
    if (activeRuntimeSecurity) {
      await ensureSignalInstanceBinding(
        profile.signalDataDir,
        profile.id,
        activeRuntimeSecurity.payload,
        activeRuntimeSecurity.devicePrivateKeyPem
      );
    }
  }
  config.profiles.push(profile);
  config.activeProfileId = profile.id;
  config.profileTabOrder = [...config.profileTabOrder.filter((profileId) => profileId !== profile.id), profile.id];
  config.lastActiveProfileIds[workspaceAppForPlatform(profile.platform)] = profile.id;
  configureSession(profile);
  await saveConfig(config);
  return profile;
}

async function pathExists(path: string) {
  try {
    await readFile(path);
    return true;
  } catch {
    try {
      await readdir(path);
      return true;
    } catch {
      return false;
    }
  }
}

async function hashFileSha256(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex').toUpperCase();
}

async function resolveSignalExecutable() {
  for (const candidate of signalExecutableCandidates()) {
    try {
      if (!(await stat(candidate)).isFile()) continue;
      if (signalSourceExperimentValue) {
        const expectedSha256 = process.env.MAOYI_SIGNAL_SOURCE_SHA256?.trim().toUpperCase();
        const actualSha256 = await hashFileSha256(candidate);
        if (!expectedSha256 || actualSha256 !== expectedSha256) {
          throw new Error('Signal source experiment executable SHA-256 changed before launch.');
        }
      }
      return candidate;
    } catch (error) {
      if (signalSourceExperimentValue) throw error;
      // Keep checking the explicitly allowed candidates.
    }
  }
  throw new Error(`Signal.exe was not found. Checked: ${signalExecutableCandidates().join('; ')}`);
}

async function containsCloneSensitiveData(dataRoot: string) {
  const markers = [
    'license.dat',
    'client-account.json',
    'config.json',
    'profiles.json',
    'lock-screen.json',
    'Partitions',
    'SignalInstances',
    'TranslationCache',
    'EnterpriseChatAssets'
  ];
  for (const marker of markers) {
    if (await pathExists(join(dataRoot, marker))) return true;
  }
  return false;
}

async function spawnCloneResetWorker(planPath: string) {
  const args = app.isPackaged
    ? [`${cloneResetArgument}${planPath}`]
    : [process.cwd(), `${cloneResetArgument}${planPath}`];
  await new Promise<void>((resolvePromise, reject) => {
    const worker = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    const onError = (error: Error) => reject(error);
    worker.once('error', onError);
    worker.once('spawn', () => {
      worker.off('error', onError);
      worker.unref();
      resolvePromise();
    });
  });
}

let storageMigrationScheduled = false;

async function spawnStorageMigrationWorker(planPath: string) {
  const args = app.isPackaged
    ? [`${storageMigrationArgument}${planPath}`]
    : [process.cwd(), `${storageMigrationArgument}${planPath}`];
  await new Promise<void>((resolvePromise, reject) => {
    const worker = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    const onError = (error: Error) => reject(error);
    worker.once('error', onError);
    worker.once('spawn', () => {
      worker.off('error', onError);
      worker.unref();
      resolvePromise();
    });
  });
}

async function openCurrentStorageLocation() {
  const dataPath = app.getPath('userData');
  const error = await shell.openPath(dataPath);
  return error ? { ok: false, reason: error, dataPath } : { ok: true, dataPath };
}

async function beginStorageLocationChange() {
  const currentDataPath = app.getPath('userData');
  if (storageMigrationScheduled) {
    return { ok: false, reason: '数据迁移已经开始，请等待客户端自动关闭', dataPath: currentDataPath };
  }
  if (userDataOverride) {
    return {
      ok: false,
      reason: '当前数据目录由启动参数固定，不能在客户端内更改',
      dataPath: currentDataPath
    };
  }

  const selection = await dialog.showOpenDialog({
    title: '选择新的数据存储位置',
    buttonLabel: '选择此文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (selection.canceled || !selection.filePaths[0]) {
    return { ok: false, canceled: true, dataPath: currentDataPath };
  }

  let prepared;
  try {
    prepared = await createStorageMigrationPlan({
      sourceRoot: currentDataPath,
      targetParent: selection.filePaths[0],
      bootstrapPath: storageBootstrapPath(),
      parentProcessId: process.pid,
      restartPackagedClient: app.isPackaged
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '新数据目录不可用',
      dataPath: currentDataPath
    };
  }

  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    title: '更改数据目录',
    message: '客户端将关闭并迁移全部数据',
    detail: [
      `当前目录：${currentDataPath}`,
      `新目录：${prepared.plan.targetRoot}`,
      '',
      '迁移成功后将切换到新目录，原目录会保留为备份，不会自动删除。'
    ].join('\n'),
    buttons: ['开始迁移', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (confirmation.response !== 0) {
    await rm(prepared.planPath, { force: true });
    return { ok: false, canceled: true, dataPath: currentDataPath };
  }

  try {
    await spawnStorageMigrationWorker(prepared.planPath);
    storageMigrationScheduled = true;
    setTimeout(() => app.quit(), 300);
    return {
      ok: true,
      migrationStarted: true,
      dataPath: currentDataPath,
      targetPath: prepared.plan.targetRoot
    };
  } catch (error) {
    await rm(prepared.planPath, { force: true });
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '数据迁移进程启动失败',
      dataPath: currentDataPath
    };
  }
}

async function beginForeignCloneReset(bindingFile?: { dataRootId?: string; suiteId?: string }) {
  if (userDataOverride && process.env.MAOYI_ALLOW_CLONE_RESET_FOR_OVERRIDE !== '1') {
    throw new Error('隔离数据目录被识别为外来克隆；开发环境未启用自动初始化');
  }
  if (!(runtimeLoggingEnabled && process.env.MAOYI_CLONE_RESET_TEST_AUTOCONFIRM === '1')) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: appDisplayName,
      message: '缺少启动器，正在初始化',
      detail: '检测到来自其他电脑的应用数据。本机复制数据将被清除，程序随后退出。',
      buttons: ['确定'],
      defaultId: 0,
      noLink: true
    });
  }
  const { planPath } = await createCloneResetPlan({
    targetRoot: app.getPath('userData'),
    bootstrapPath: userDataOverride ? undefined : storageBootstrapPath(),
    runtimeBindingPaths: signalExecutableCandidates().map(signalRuntimeBindingPath),
    expectedDataRootId: bindingFile?.dataRootId,
    expectedSuiteId: bindingFile?.suiteId,
    parentProcessId: process.pid
  });
  await spawnCloneResetWorker(planPath);
  signalShutdownBeforeQuitDone = true;
  app.exit(0);
}

async function beginAuthorizationSelfDestruct() {
  hideAllSignalWindows();
  dialog.showMessageBoxSync({
    type: 'error',
    title: appDisplayName,
    message: '授权错误次数已达上限',
    detail: '本机客户端已永久锁死，正在清除应用数据并卸载程序。',
    buttons: ['确定'],
    defaultId: 0,
    noLink: true
  });
  const uninstallerPath = app.isPackaged
    ? join(dirname(process.execPath), 'Uninstall 皮卡丘翻译器.exe')
    : undefined;
  const { planPath } = await createCloneResetPlan({
    targetRoot: app.getPath('userData'),
    bootstrapPath: userDataOverride ? undefined : storageBootstrapPath(),
    runtimeBindingPaths: signalExecutableCandidates().map(signalRuntimeBindingPath),
    parentProcessId: process.pid,
    uninstallerPath
  });
  await spawnCloneResetWorker(planPath);
  signalShutdownBeforeQuitDone = true;
  app.exit(0);
}

async function verifyRuntimeCloneState() {
  if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
  const expected = clientLicenseManager.getRuntimeSecurityExpectation();
  const inspection = await inspectRuntimeBinding(defaultRuntimeBindingPath(), {
    suiteId: expected.suiteId || undefined,
    keyId: expected.keyId || undefined,
    machineCodeHash: expected.machineCodeHash || undefined,
    hardwareHash: expected.hardwareHash || undefined,
    devicePublicKeyPem: expected.devicePublicKeyPem || undefined
  });
  if (inspection.state === 'local') {
    runtimeSuiteUpgradePending = null;
    return true;
  }
  if (inspection.state === 'foreign') {
    const upgradeSources = clientLicenseManager.getRuntimeUpgradeSources();
    if (upgradeSources.length) {
      const localUpgradeSource = await inspectRuntimeBinding(defaultRuntimeBindingPath(), {
        hardwareHash: expected.hardwareHash || undefined,
        devicePublicKeyPem: expected.devicePublicKeyPem || undefined
      });
      if (
        localUpgradeSource.state === 'local' &&
        upgradeSources.some((source) =>
          source.suiteId === localUpgradeSource.payload.suiteId &&
          source.keyId === localUpgradeSource.payload.keyId
        )
      ) {
        runtimeSuiteUpgradePending = localUpgradeSource.payload;
        return true;
      }
    }
    await beginForeignCloneReset(inspection.file);
    return false;
  }
  const authorization = clientLicenseManager.getStatus();
  const containsExistingData = await containsCloneSensitiveData(app.getPath('userData'));
  if (
    containsExistingData &&
    (authorization.state === 'device-error' || clientLicenseManager.wasDeviceIdentityCreatedThisRun())
  ) {
    await beginForeignCloneReset();
    return false;
  }
  return true;
}

async function hasSignalStartupCorruption(dataDir: string) {
  const logPath = join(dataDir, 'logs', 'main.log');
  try {
    const raw = await readFile(logPath, 'utf8');
    return /Database startup error|safeStorage\.decryptString|SQLITE_NOTADB|hmac check failed|error decrypting page/i.test(raw);
  } catch {
    return false;
  }
}

async function quarantineSignalDataDir(dataDir: string) {
  if (!(await pathExists(dataDir))) return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = `${dataDir}.broken-${stamp}`;
  await renamePathWithRetry(dataDir, targetPath);
  await mkdir(dataDir, { recursive: true });
  return true;
}

async function renamePathWithRetry(sourcePath: string, targetPath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      await wait(250 + attempt * 250);
    }
  }
  throw lastError;
}

async function ensureSignalRuntimePreferences(dataDir: string) {
  const ephemeralPath = join(dataDir, 'ephemeral.json');
  let preferences: Record<string, unknown> = {};
  try {
    preferences = JSON.parse((await readFile(ephemeralPath, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    preferences = {};
  }

  preferences['system-tray-setting'] = 'DoNotUseSystemTray';
  preferences['theme-setting'] = preferences['theme-setting'] || 'system';
  preferences['spell-check'] = preferences['spell-check'] ?? true;
  await writeJsonAtomic(ephemeralPath, preferences);
}

async function cleanupSignalUpdateArtifacts(dataDir: string) {
  const updateCachePath = join(dataDir, 'update-cache');
  await removePathWithRetry(updateCachePath);

  try {
    const entries = await readdir(dataDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^signal-desktop.*\.(exe|blockmap)$/i.test(entry.name))
        .map((entry) => removePathWithRetry(join(dataDir, entry.name)))
    );
  } catch {
    // Best-effort cleanup only; Signal launch should not fail because an update cache is locked.
  }
}

async function ensureSignalControlServer() {
  if (signalControlPort) return signalControlPort;
  if (signalControlServerPromise) return signalControlServerPromise;

  signalControlServerPromise = new Promise<number>((resolve, reject) => {
    const server = createServer();
    const sockets = new Set<Socket>();
    let settled = false;

    const listen = (port: number) => {
      server.listen(port, '127.0.0.1');
    };

    const settleResolve = () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      if (!port) {
        reject(new Error('Signal control server did not expose a port.'));
        return;
      }
      settled = true;
      signalControlServer = server;
      signalControlPort = port;
      resolve(port);
    };

    server.on('upgrade', (request, socket) => {
      const signalSocket = socket as Socket;
      if (sockets.size >= signalControlMaxSockets) {
        signalSocket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        return;
      }
      sockets.add(signalSocket);
      signalSocket.once('close', () => sockets.delete(signalSocket));
      handleSignalControlUpgrade(request, signalSocket);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (!settled && error.code === 'EADDRINUSE') {
        server.close(() => listen(0));
        return;
      }
      if (!settled) {
        reject(error);
      }
    });

    server.on('listening', settleResolve);
    server.on('close', () => {
      for (const socket of sockets) socket.destroy();
      signalControlServer = null;
      signalControlPort = null;
      signalControlServerPromise = null;
      signalControlClients.clear();
    });

    listen(0);
  });

  return signalControlServerPromise;
}

function handleSignalControlUpgrade(request: IncomingMessage, socket: Socket) {
  const appId = new URL(request.url || '/', 'ws://127.0.0.1').searchParams.get('appId') || '';
  const key = request.headers['sec-websocket-key'];
  const profileId = profileIdFromSignalAppId(appId);
  const controlSession = signalControlSessions.get(appId);
  if (!profileIdPattern.test(profileId) || typeof key !== 'string' || !controlSession) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }

  const acceptKey = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ].join('\r\n'));

  const challenge = randomBytes(32).toString('base64url');
  let authenticated = false;
  const handshakeTimer = setTimeout(() => socket.destroy(), signalControlHandshakeTimeoutMs);
  writeSignalWebSocketText(socket, JSON.stringify({ type: 'auth.challenge', appId, challenge }));

  let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > signalControlMaxFrameBytes * 2) {
      socket.destroy();
      return;
    }
    try {
      const parsed = readSignalWebSocketFrames(buffered);
      buffered = parsed.remaining;
      for (const frame of parsed.frames) {
        if (!authenticated) {
          const response = JSON.parse(frame) as { type?: string; processId?: number; mac?: string };
          const expectedMac = signalControlMac(controlSession.key, [
            'maoyi-signal-control-auth-v1',
            appId,
            controlSession.processId,
            challenge
          ]);
          if (
            response.type !== 'auth.response' ||
            response.processId !== controlSession.processId ||
            !constantTimeBase64UrlEqual(response.mac, expectedMac)
          ) {
            socket.destroy();
            return;
          }
          authenticated = true;
          clearTimeout(handshakeTimer);
          const existing = signalControlClients.get(appId);
          existing?.socket.destroy();
          clearSignalCacheRequestState(appId);
          signalControlClients.set(appId, {
            ...controlSession,
            socket,
            connectedAt: Date.now(),
            lastSeenAt: Date.now(),
            sendSequence: 0,
            receiveSequence: 0,
            ready: false
          });
          void persistSignalControlStatus();
          sendSignalOwner(appId);
          sendSignalVisibilityState(appId);
          sendSignalControlMessage(appId, { type: 'hello', appId, at: Date.now() });
          continue;
        }
        const payload = verifySignalControlEnvelope(appId, frame);
        if (!payload) {
          socket.destroy();
          return;
        }
        handleSignalControlMessage(appId, payload);
      }
    } catch {
      socket.destroy();
    }
  });
  socket.on('error', () => undefined);
  socket.once('close', () => {
    clearTimeout(handshakeTimer);
    const current = signalControlClients.get(appId);
    if (current?.socket === socket) {
      failSignalPresentationForApp(appId, 'Signal 控制通道已断开，请点击“打开 Signal”重试');
      signalControlClients.delete(appId);
      clearSignalCacheRequestState(appId);
      settleSignalVisibilityApplied(appId, workspaceVisibilityGate.revision, false);
      void persistSignalControlStatus();
    }
  });
}

function readSignalWebSocketFrames(buffer: Buffer) {
  const frames: string[] = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let length = secondByte & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(signalControlMaxFrameBytes)) throw new Error('Signal control frame is too large.');
      length = Number(bigLength);
      headerLength = 10;
    }
    if (length > signalControlMaxFrameBytes) throw new Error('Signal control frame is too large.');
    if (!masked) throw new Error('Signal control client frames must be masked.');

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    if (opcode === 0x8) {
      offset += frameLength;
      continue;
    }

    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      const decoded = Buffer.alloc(payload.length);
      for (let index = 0; index < payload.length; index += 1) {
        decoded[index] = payload[index] ^ mask[index % 4];
      }
      payload = decoded;
    }
    if (opcode === 0x1) {
      frames.push(payload.toString('utf8'));
    }
    offset += frameLength;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

function writeSignalWebSocketText(socket: Socket, value: string) {
  const message = Buffer.from(value, 'utf8');
  if (message.length > signalControlMaxFrameBytes) throw new Error('Signal control message is too large.');
  let header: Buffer;
  if (message.length < 126) {
    header = Buffer.from([0x81, message.length]);
  } else if (message.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(message.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(message.length), 2);
  }
  socket.write(Buffer.concat([header, message]));
}

function signalControlMac(key: Buffer, values: unknown[]) {
  return createHmac('sha256', key).update(JSON.stringify(values)).digest('base64url');
}

function constantTimeBase64UrlEqual(actual: unknown, expected: string) {
  if (typeof actual !== 'string') return false;
  try {
    const actualBuffer = Buffer.from(actual, 'base64url');
    const expectedBuffer = Buffer.from(expected, 'base64url');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function verifySignalControlEnvelope(appId: string, rawMessage: string) {
  const client = signalControlClients.get(appId);
  if (!client) return null;
  const envelope = JSON.parse(rawMessage) as {
    version?: number;
    sequence?: number;
    payload?: Record<string, unknown>;
    mac?: string;
  };
  const expectedSequence = client.receiveSequence + 1;
  if (envelope.version !== 1 || envelope.sequence !== expectedSequence || !envelope.payload) return null;
  const expectedMac = signalControlMac(client.key, [
    'maoyi-signal-control-message-v1',
    'signal-to-main',
    appId,
    client.processId,
    envelope.sequence,
    envelope.payload
  ]);
  if (!constantTimeBase64UrlEqual(envelope.mac, expectedMac)) return null;
  const businessPayload = stripSignalControlTransportMetadata(envelope.payload, appId);
  if (!businessPayload) return null;
  client.receiveSequence = expectedSequence;
  client.lastSeenAt = Date.now();
  return businessPayload;
}

function sendSignalControlMessage(appId: string, payload: Record<string, unknown>) {
  const client = signalControlClients.get(appId);
  if (!client || client.socket.destroyed) return false;
  const sequence = client.sendSequence + 1;
  const envelope = {
    version: 1,
    sequence,
    payload,
    mac: signalControlMac(client.key, [
      'maoyi-signal-control-message-v1',
      'main-to-signal',
      appId,
      client.processId,
      sequence,
      payload
    ])
  };
  writeSignalWebSocketText(client.socket, JSON.stringify(envelope));
  client.sendSequence = sequence;
  return true;
}

function sendSignalWindowHide(appId: string, reason: string) {
  if (!app.isPackaged && process.env.MAOYI_SIGNAL_WINDOW_TRACE === '1') {
    console.error(`[signal-window-hide] ${appId} ${reason}`);
  }
  return sendSignalControlMessage(appId, { type: 'window.hide' });
}

function getSignalOwnerDescriptor() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return null;
  try {
    const handle = mainWindow.getNativeWindowHandle();
    if (handle.length !== 8) return null;
    return {
      type: 'window.owner',
      handle: handle.toString('base64url'),
      ownerProcessId: process.pid
    };
  } catch {
    return null;
  }
}

function sendSignalOwner(appId: string) {
  const owner = getSignalOwnerDescriptor();
  return owner ? sendSignalControlMessage(appId, owner) : false;
}

function sendSignalVisibilityState(appId: string) {
  return sendSignalControlMessage(appId, {
    type: 'security.visibility',
    locked: workspaceVisibilityGate.locked,
    revision: workspaceVisibilityGate.revision
  });
}

function advanceWorkspaceVisibilityGate(locked: boolean) {
  workspaceVisibilityGate = {
    locked,
    revision: workspaceVisibilityGate.revision + 1
  };
  if (locked) {
    visibleSignalProfileId = null;
    clearAllSignalCacheRequestState();
    hideAllSignalWindows();
    for (const [requestId, request] of signalScriptRequests) {
      clearTimeout(request.timer);
      request.reject(new Error('Workspace locked before Signal script completion.'));
      signalScriptRequests.delete(requestId);
    }
  }
  return workspaceVisibilityGate.revision;
}

function broadcastSignalVisibilityState() {
  for (const appId of signalControlClients.keys()) {
    sendSignalVisibilityState(appId);
  }
}

function waitForSignalVisibilityApplied(appId: string, revision: number) {
  const existing = signalVisibilityAckWaiters.get(appId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      const current = signalVisibilityAckWaiters.get(appId);
      if (current?.revision === revision) signalVisibilityAckWaiters.delete(appId);
      resolve(false);
    }, signalVisibilityAckTimeoutMs);
    signalVisibilityAckWaiters.set(appId, { revision, resolve, timer });
  });
}

function settleSignalVisibilityApplied(appId: string, revision: number, applied: boolean) {
  const waiter = signalVisibilityAckWaiters.get(appId);
  if (!waiter || waiter.revision !== revision) return;
  signalVisibilityAckWaiters.delete(appId);
  clearTimeout(waiter.timer);
  waiter.resolve(applied);
}

function isSignalProcessIdAlive(processId: number) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function waitForSignalProcessExit(child: ChildProcess | undefined, processId: number, timeoutMs: number) {
  if (child && child.exitCode !== null) return Promise.resolve(true);
  if (!isSignalProcessIdAlive(processId)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child?.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const deadline = Date.now() + timeoutMs;
    const checkExit = () => {
      if ((child && child.exitCode !== null) || !isSignalProcessIdAlive(processId)) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(false);
        return;
      }
      timer = setTimeout(checkExit, 25);
    };
    child?.once('exit', onExit);
    checkExit();
  });
}

async function forceTerminateSignalProcess(
  processId: number,
  child: ChildProcess | undefined
) {
  if (!isSignalProcessIdAlive(processId)) return true;
  try {
    process.kill(processId, 'SIGKILL');
  } catch {
    if (isSignalProcessIdAlive(processId)) return false;
  }
  return waitForSignalProcessExit(child, processId, signalVisibilityShutdownGraceMs);
}

async function terminateSignalInstanceFailClosed(appId: string) {
  const profileId = profileIdFromSignalAppId(appId);
  const child = signalProcesses.get(profileId);
  const client = signalControlClients.get(appId);
  const authenticatedProcessId = client?.processId;
  const trackedProcessId = child?.pid;
  const failedProcessIds = new Set<number>();

  try {
    sendSignalControlMessage(appId, { type: 'shutdown' });
    if (authenticatedProcessId) {
      const authenticatedChild = child?.pid === authenticatedProcessId ? child : undefined;
      const exitedGracefully = await waitForSignalProcessExit(
        authenticatedChild,
        authenticatedProcessId,
        signalVisibilityShutdownGraceMs
      );
      if (
        !exitedGracefully &&
        !(await forceTerminateSignalProcess(authenticatedProcessId, authenticatedChild))
      ) {
        failedProcessIds.add(authenticatedProcessId);
      }
    }

    if (
      trackedProcessId &&
      trackedProcessId !== authenticatedProcessId &&
      child?.exitCode === null &&
      !(await forceTerminateSignalProcess(trackedProcessId, child))
    ) {
      failedProcessIds.add(trackedProcessId);
    }
  } finally {
    failSignalPresentationForApp(appId, 'Signal 进程正在关闭，窗口显示请求已取消');
    client?.socket.destroy();
    signalControlClients.delete(appId);
    signalControlSessions.delete(appId);
  }

  if (failedProcessIds.size > 0) {
    throw new Error(
      `Workspace remains locked because Signal termination could not be confirmed for ${appId} ` +
        `(PID ${Array.from(failedProcessIds).join(', ')}).`
    );
  }
}

async function engageWorkspaceVisibilityLock() {
  const revision = advanceWorkspaceVisibilityGate(true);
  const liveAppIds = new Set<string>();
  for (const [profileId, child] of signalProcesses) {
    if (child.exitCode === null) liveAppIds.add(signalAppId(profileId));
  }
  for (const appId of signalControlClients.keys()) liveAppIds.add(appId);

  const acknowledgements = new Map<string, Promise<boolean>>();
  for (const appId of liveAppIds) {
    if (signalControlClients.has(appId)) {
      acknowledgements.set(appId, waitForSignalVisibilityApplied(appId, revision));
    }
  }
  broadcastSignalVisibilityState();
  hideAllSignalWindows();

  const failed = new Set<string>();
  const captureTerminationFailure = async (appId: string) => {
    try {
      await terminateSignalInstanceFailClosed(appId);
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };
  const immediateTerminations = Array.from(liveAppIds)
    .filter((appId) => !acknowledgements.has(appId))
    .map((appId) => captureTerminationFailure(appId));
  for (const appId of liveAppIds) {
    const acknowledgement = acknowledgements.get(appId);
    if (acknowledgement && !(await acknowledgement)) failed.add(appId);
  }
  const terminationFailures = (await Promise.all([
    ...immediateTerminations,
    ...Array.from(failed, (appId) => captureTerminationFailure(appId))
  ])).filter((error): error is Error => Boolean(error));
  hideAllSignalWindows();
  if (terminationFailures.length > 0) {
    throw new Error(terminationFailures.map((error) => error.message).join(' '));
  }
}

function releaseWorkspaceVisibilityLock() {
  if (remoteGuardIncidentLatched) {
    if (!workspaceVisibilityGate.locked) advanceWorkspaceVisibilityGate(true);
    broadcastSignalVisibilityState();
    hideAllSignalWindows();
    return false;
  }
  advanceWorkspaceVisibilityGate(false);
  broadcastSignalVisibilityState();
  return true;
}

function notifyRemoteGuardStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('remote-guard:status-changed', remoteGuardStatus);
}

function remoteGuardAlarmDocument() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>十万伏特安全警报</title>
  <style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#160408;color:#fff;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif}
    body{display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,rgba(255,67,83,.28),transparent 34%),linear-gradient(145deg,#26040a,#090104 72%)}
    main{width:min(820px,88vw);border:2px solid rgba(255,99,109,.88);border-radius:28px;padding:54px 58px;text-align:center;background:rgba(44,4,11,.92);box-shadow:0 0 0 10px rgba(255,61,76,.08),0 32px 100px rgba(0,0,0,.72);animation:pulse 1s ease-in-out infinite alternate}
    .crest{display:grid;width:108px;height:108px;margin:0 auto 26px;place-items:center;border:4px solid #ff6570;border-radius:50%;color:#fff2d0;font-size:50px;font-weight:900;box-shadow:0 0 44px rgba(255,68,82,.55)}
    h1{margin:0;color:#ff737c;font-size:52px;letter-spacing:8px}h2{margin:18px 0 0;color:#fff;font-size:30px}p{margin:25px 0 0;color:rgba(255,255,255,.8);font-size:20px;line-height:1.8}
    strong{color:#ffd9a0}@keyframes pulse{from{transform:scale(.994);box-shadow:0 0 0 8px rgba(255,61,76,.07),0 32px 100px rgba(0,0,0,.72)}to{transform:scale(1);box-shadow:0 0 0 16px rgba(255,61,76,.14),0 32px 120px rgba(126,0,18,.62)}}
  </style>
</head>
<body><main><div class="crest">⚡️</div><h1>安全警报</h1><h2>十万伏特发现远程连接</h2><p>聊天窗口已经隐藏，系统将在 <strong>3 秒后锁定 Windows</strong><br>请在本机确认远控来源并断开可疑连接</p></main></body>
</html>`;
}

function destroyRemoteGuardAlarmWindows() {
  for (const alarmWindow of remoteGuardAlarmWindows) {
    if (!alarmWindow.isDestroyed()) alarmWindow.destroy();
  }
  remoteGuardAlarmWindows.clear();
}

function showRemoteGuardAlarmWindows() {
  if (!app.isReady() || remoteGuardAlarmWindows.size > 0) return;
  const alarmUrl = `data:text/html;charset=utf-8,${encodeURIComponent(remoteGuardAlarmDocument())}`;
  for (const display of screen.getAllDisplays()) {
    const alarmWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      show: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      backgroundColor: '#160408',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    remoteGuardAlarmWindows.add(alarmWindow);
    alarmWindow.on('closed', () => remoteGuardAlarmWindows.delete(alarmWindow));
    alarmWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    void alarmWindow.loadURL(alarmUrl).then(() => {
      if (alarmWindow.isDestroyed()) return;
      alarmWindow.setAlwaysOnTop(true, 'screen-saver');
      alarmWindow.showInactive();
      alarmWindow.moveTop();
    }).catch(() => {
      if (!alarmWindow.isDestroyed()) alarmWindow.destroy();
    });
  }
}

function startRemoteGuardAlarmSound() {
  if (remoteGuardBeepTimer) return;
  shell.beep();
  remoteGuardBeepTimer = setInterval(() => shell.beep(), 850);
}

function stopRemoteGuardAlarmSound() {
  if (!remoteGuardBeepTimer) return;
  clearInterval(remoteGuardBeepTimer);
  remoteGuardBeepTimer = null;
}

function focusMainWindowForRemoteGuardRecovery() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
}

function scheduleRemoteGuardWindowsLock() {
  if (
    remoteGuardWindowsLockTimer ||
    remoteGuardStatus.windowsSessionLocked ||
    !remoteGuardThreatActive ||
    !remoteGuardIncidentLatched
  ) return;
  const windowsLockScheduledAt = Date.now() + remoteGuardWindowsLockDelayMs;
  remoteGuardStatus = {
    ...remoteGuardStatus,
    windowsLockState: 'scheduled',
    windowsLockScheduledAt
  };
  notifyRemoteGuardStatus();
  remoteGuardWindowsLockTimer = setTimeout(() => {
    remoteGuardWindowsLockTimer = null;
    if (!remoteGuardThreatActive || !remoteGuardIncidentLatched || remoteGuardStatus.windowsSessionLocked) return;
    const windowsLockAttemptedAt = Date.now();
    remoteGuardStatus = {
      ...remoteGuardStatus,
      windowsLockState: 'requested',
      windowsLockScheduledAt: undefined,
      windowsLockAttemptedAt
    };
    notifyRemoteGuardStatus();
    void requestWindowsWorkstationLock().then((requested) => {
      if (!requested && !remoteGuardStatus.windowsSessionLocked) {
        remoteGuardRuntimeReason = 'Windows 锁屏请求失败，安全警报保持显示';
        remoteGuardStatus = {
          ...remoteGuardStatus,
          windowsLockState: 'failed',
          reason: remoteGuardRuntimeReason
        };
        notifyRemoteGuardStatus();
      }
    });
  }, remoteGuardWindowsLockDelayMs);
}

function beginRemoteGuardIncident() {
  remoteGuardIncidentLatched = true;
  showRemoteGuardAlarmWindows();
  startRemoteGuardAlarmSound();
  focusMainWindowForRemoteGuardRecovery();
  scheduleRemoteGuardWindowsLock();
  remoteGuardVisibilityLockPromise ??= engageWorkspaceVisibilityLock()
    .catch(() => {
      remoteGuardRuntimeReason = '聊天窗口隐藏确认未完整返回，Windows 锁屏仍将执行';
    })
    .finally(() => {
      remoteGuardVisibilityLockPromise = null;
      if (remoteGuardRuntimeReason) {
        remoteGuardStatus = { ...remoteGuardStatus, reason: remoteGuardRuntimeReason };
        notifyRemoteGuardStatus();
      }
    });
}

function clearRemoteGuardIncident() {
  if (remoteGuardThreatActive) return false;
  const previousRuntimeReason = remoteGuardRuntimeReason;
  remoteGuardIncidentLatched = false;
  remoteGuardRuntimeReason = '';
  if (remoteGuardWindowsLockTimer) {
    clearTimeout(remoteGuardWindowsLockTimer);
    remoteGuardWindowsLockTimer = null;
  }
  destroyRemoteGuardAlarmWindows();
  stopRemoteGuardAlarmSound();
  remoteGuardStatus = {
    ...remoteGuardStatus,
    state: remoteGuardLastClearState,
    threatActive: false,
    incidentLatched: false,
    windowsLockState: remoteGuardStatus.windowsSessionLocked ? 'confirmed' : 'idle',
    windowsLockScheduledAt: undefined,
    reason: remoteGuardStatus.reason === previousRuntimeReason ? undefined : remoteGuardStatus.reason
  };
  notifyRemoteGuardStatus();
  return true;
}

async function runRemoteGuardScan(forceProcessRefresh = false) {
  if (remoteGuardScanPromise) return remoteGuardScanPromise;
  remoteGuardScanPromise = (async () => {
    const startedAt = Date.now();
    const evaluation = await inspectWindowsRemoteAccess(process.pid, { forceProcessRefresh });
    const checkedAt = Date.now();
    remoteGuardThreatActive = evaluation.threatActive;
    remoteGuardLastClearState = evaluation.state;

    if (evaluation.threatActive) {
      if (!remoteGuardIncidentLatched) beginRemoteGuardIncident();
      else {
        showRemoteGuardAlarmWindows();
        startRemoteGuardAlarmSound();
        scheduleRemoteGuardWindowsLock();
      }
    } else {
      if (remoteGuardWindowsLockTimer) {
        clearTimeout(remoteGuardWindowsLockTimer);
        remoteGuardWindowsLockTimer = null;
      }
      if (remoteGuardIncidentLatched) {
        destroyRemoteGuardAlarmWindows();
        focusMainWindowForRemoteGuardRecovery();
      }
    }

    remoteGuardStatus = {
      ...remoteGuardStatus,
      enabled: process.platform === 'win32',
      state: evaluation.threatActive ? 'alarm' : remoteGuardIncidentLatched ? 'recovery' : evaluation.state,
      checkedAt,
      nextScanAt: checkedAt + remoteGuardScanIntervalMs,
      scanDurationMs: Math.max(0, checkedAt - startedAt),
      processScanIntervalMs: remoteGuardProcessScanIntervalMs,
      threatActive: evaluation.threatActive,
      incidentLatched: remoteGuardIncidentLatched,
      windowsLockState: evaluation.threatActive
        ? remoteGuardStatus.windowsLockState
        : remoteGuardStatus.windowsSessionLocked
          ? 'confirmed'
          : 'idle',
      windowsLockScheduledAt: evaluation.threatActive ? remoteGuardStatus.windowsLockScheduledAt : undefined,
      findings: evaluation.findings,
      coverage: evaluation.coverage,
      reason: remoteGuardRuntimeReason || evaluation.reason
    };
    notifyRemoteGuardStatus();
    return remoteGuardStatus;
  })().finally(() => {
    remoteGuardScanPromise = null;
  });
  return remoteGuardScanPromise;
}

async function acknowledgeRemoteGuardIncident(): Promise<RemoteGuardActionResult> {
  if (remoteGuardThreatActive) {
    return { ok: false, reason: '远控迹象仍然存在，工作区保持锁定', status: remoteGuardStatus };
  }
  if (!remoteGuardIncidentLatched) return { ok: true, status: remoteGuardStatus };
  const lockStatus = await getLockScreenStatus();
  if (lockStatus.enabled) {
    return { ok: false, reason: '请使用客户端锁屏密码恢复工作区', status: remoteGuardStatus };
  }
  clearRemoteGuardIncident();
  releaseWorkspaceVisibilityLock();
  return { ok: true, status: remoteGuardStatus };
}

async function startRemoteGuard() {
  if (remoteGuardStarted) return remoteGuardStatus;
  remoteGuardStarted = true;
  powerMonitor.on('lock-screen', () => {
    if (remoteGuardWindowsLockTimer) {
      clearTimeout(remoteGuardWindowsLockTimer);
      remoteGuardWindowsLockTimer = null;
    }
    remoteGuardStatus = {
      ...remoteGuardStatus,
      windowsSessionLocked: true,
      windowsLockState: remoteGuardIncidentLatched ? 'confirmed' : 'idle',
      windowsLockScheduledAt: undefined
    };
    notifyRemoteGuardStatus();
  });
  powerMonitor.on('unlock-screen', () => {
    remoteGuardStatus = {
      ...remoteGuardStatus,
      windowsSessionLocked: false,
      windowsLockState: 'idle',
      windowsLockScheduledAt: undefined
    };
    if (remoteGuardThreatActive && remoteGuardIncidentLatched) {
      showRemoteGuardAlarmWindows();
      scheduleRemoteGuardWindowsLock();
    }
    notifyRemoteGuardStatus();
    void runRemoteGuardScan();
  });
  powerMonitor.on('resume', () => void runRemoteGuardScan());
  const status = await runRemoteGuardScan();
  remoteGuardScanTimer = setInterval(() => void runRemoteGuardScan(), remoteGuardScanIntervalMs);
  return status;
}

function stopRemoteGuard() {
  if (remoteGuardScanTimer) {
    clearInterval(remoteGuardScanTimer);
    remoteGuardScanTimer = null;
  }
  if (remoteGuardWindowsLockTimer) {
    clearTimeout(remoteGuardWindowsLockTimer);
    remoteGuardWindowsLockTimer = null;
  }
  destroyRemoteGuardAlarmWindows();
  stopRemoteGuardAlarmSound();
}

function canShowSignalWindows() {
  return Boolean(
    !workspaceVisibilityGate.locked &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized()
  );
}

async function executeSignalScript(profileId: string, script: string) {
  if (workspaceVisibilityGate.locked) throw new Error('Workspace is locked.');
  const appId = signalAppId(profileId);
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) throw new Error(`Signal profile ${profileId} was not found.`);
  if (!signalControlClients.has(appId)) {
    await launchSignalProfile(profileId);
  }

  return new Promise<unknown>((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      signalScriptRequests.delete(requestId);
      reject(new Error(`Signal script timed out for ${profile.name}.`));
    }, 8000);
    signalScriptRequests.set(requestId, { resolve, reject, timer });
    const sent = sendSignalControlMessage(appId, { type: 'script.execute', requestId, script });
    if (!sent) {
      clearTimeout(timer);
      signalScriptRequests.delete(requestId);
      reject(new Error(`Signal control channel is not connected for ${profile.name}.`));
    }
  });
}

function settleSignalPresentation(
  requestId: string,
  result: SignalWindowPresentationResult
) {
  const request = signalPresentationRequests.get(requestId);
  if (!request) return;
  clearTimeout(request.readyTimer);
  if (request.acknowledgementTimer) clearTimeout(request.acknowledgementTimer);
  signalPresentationRequests.delete(requestId);
  if (signalPresentationRequestIdsByApp.get(request.appId) === requestId) {
    signalPresentationRequestIdsByApp.delete(request.appId);
  }
  if (!result.presented) {
    sendSignalWindowHide(
      request.appId,
      `presentation-rejected:${result.message || 'no-message'}`
    );
  }
  request.resolve(result);
}

function failSignalPresentationForApp(appId: string, message: string) {
  const requestId = signalPresentationRequestIdsByApp.get(appId);
  if (!requestId) return;
  settleSignalPresentation(requestId, { presented: false, message });
}

function sendPendingSignalPresentation(appId: string) {
  const requestId = signalPresentationRequestIdsByApp.get(appId);
  if (!requestId) return false;
  const request = signalPresentationRequests.get(requestId);
  const client = signalControlClients.get(appId);
  if (!request || request.sent || !client?.ready || client.socket.destroyed) return false;

  clearTimeout(request.readyTimer);
  request.sent = true;
  request.acknowledgementTimer = setTimeout(() => {
    settleSignalPresentation(requestId, {
      presented: false,
      message: 'Signal 窗口未成功显示，请点击“打开 Signal”重试'
    });
  }, signalPresentationAckTimeoutMs);
  const sent = sendSignalControlMessage(appId, {
    type: 'window.present',
    requestId,
    bounds: request.bounds
  });
  if (!sent) {
    settleSignalPresentation(requestId, {
      presented: false,
      message: 'Signal 控制通道未连接，请点击“打开 Signal”重试'
    });
  }
  return sent;
}

function requestSignalWindowPresentation(
  profileId: string,
  bounds: { x: number; y: number; width: number; height: number }
) {
  const appId = signalAppId(profileId);
  failSignalPresentationForApp(appId, 'Signal 窗口显示请求已由新的操作替换');

  const requestId = randomUUID();
  const promise = new Promise<SignalWindowPresentationResult>((resolvePresentation) => {
    const readyTimer = setTimeout(() => {
      settleSignalPresentation(requestId, {
        presented: false,
        message: 'Signal 尚未完成启动，请点击“打开 Signal”重试'
      });
    }, signalPresentationReadyTimeoutMs);
    signalPresentationRequests.set(requestId, {
      appId,
      profileId,
      requestId,
      bounds,
      resolve: resolvePresentation,
      readyTimer,
      acknowledgementTimer: null,
      sent: false
    });
    signalPresentationRequestIdsByApp.set(appId, requestId);
  });
  sendPendingSignalPresentation(appId);
  return promise;
}

function sendSignalWorkspaceBounds(profileId: string, bounds: SignalWorkspaceBounds) {
  pendingSignalWorkspaceBounds.set(profileId, bounds);
  const appId = signalAppId(profileId);
  const effectiveBounds = { ...bounds, visible: bounds.visible && canShowSignalWindows() };
  const screenBounds = signalBoundsToScreen(effectiveBounds);
  lastSignalScreenBounds.set(profileId, screenBounds);
  const sentBounds = sendSignalControlMessage(appId, {
    type: 'window.bounds-changed',
    bounds: screenBounds
  });
  const sentVisibility = effectiveBounds.visible
    ? false
    : sendSignalWindowHide(appId, 'workspace-bounds-not-visible');
  return sentBounds || sentVisibility;
}

function sameSignalScreenBounds(
  left: { x: number; y: number; width: number; height: number } | undefined,
  right: { x: number; y: number; width: number; height: number }
) {
  return Boolean(
    left &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height
  );
}

function matchesSignalPresentationBounds(
  expected: { x: number; y: number; width: number; height: number },
  actual: Record<string, unknown>
) {
  const withinTolerance = (value: unknown, target: number, tolerance: number) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value - target) <= tolerance;
  return Boolean(
    withinTolerance(actual.x, expected.x, signalPresentationPositionTolerancePx) &&
      withinTolerance(actual.y, expected.y, signalPresentationPositionTolerancePx) &&
      withinTolerance(actual.width, expected.width, signalPresentationSizeTolerancePx) &&
      withinTolerance(actual.height, expected.height, signalPresentationSizeTolerancePx)
  );
}

function syncVisibleSignalPosition(force = false) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return;
  const profileId = visibleSignalProfileId;
  if (!profileId) return;
  const bounds = pendingSignalWorkspaceBounds.get(profileId);
  if (!bounds?.visible) return;
  const screenBounds = signalBoundsToScreen(bounds);
  if (!force && sameSignalScreenBounds(lastSignalScreenBounds.get(profileId), screenBounds)) return;
  lastSignalScreenBounds.set(profileId, screenBounds);
  sendSignalControlMessage(signalAppId(profileId), {
    type: 'window.bounds-changed',
    bounds: screenBounds
  });
}

function scheduleVisibleSignalMoveSync() {
  if (!signalMoveSyncTimer) {
    signalMoveSyncTimer = setTimeout(() => {
      signalMoveSyncTimer = null;
      syncVisibleSignalPosition();
    }, signalMoveSyncIntervalMs);
  }
  if (signalMoveFinalTimer) clearTimeout(signalMoveFinalTimer);
  signalMoveFinalTimer = setTimeout(() => {
    signalMoveFinalTimer = null;
    syncVisibleSignalPosition(true);
  }, signalMoveFinalDelayMs);
}

function scheduleSignalWorkspaceBounds(profileId: string, bounds: SignalWorkspaceBounds) {
  for (const delay of [0]) {
    setTimeout(() => {
      sendSignalWorkspaceBounds(profileId, bounds);
    }, delay);
  }
}

function signalBoundsToScreen(bounds: SignalWorkspaceBounds) {
  const contentBounds = mainWindow?.getContentBounds();
  const x = Math.max(0, Math.round((contentBounds?.x ?? 0) + bounds.x));
  const y = Math.max(0, Math.round((contentBounds?.y ?? 0) + bounds.y));
  const width = Math.max(320, Math.round(bounds.width));
  const height = Math.max(320, Math.round(bounds.height));
  return { x, y, width, height };
}

async function setSignalWorkspaceBounds(profileId: string, bounds: SignalWorkspaceBounds) {
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) throw new Error(`Signal profile ${profileId} was not found.`);
  const previousBounds = pendingSignalWorkspaceBounds.get(profileId);
  pendingSignalWorkspaceBounds.set(profileId, bounds);
  if (bounds.visible) {
    if (visibleSignalProfileId !== profileId) clearAllSignalCacheRequestState();
    visibleSignalProfileId = profileId;
  } else {
    clearSignalCacheRequestState(signalAppId(profileId));
    if (visibleSignalProfileId === profileId) visibleSignalProfileId = null;
  }
  if (bounds.visible && !canShowSignalWindows()) {
    sendSignalWindowHide(signalAppId(profileId), 'workspace-visibility-gate-closed');
    return;
  }
  if (bounds.visible) {
    await launchSignalProfile(profileId);
  }
  scheduleSignalWorkspaceBounds(profileId, bounds);
  if (bounds.visible && (previousBounds?.width !== bounds.width || previousBounds?.height !== bounds.height)) {
    scheduleSignalLayoutCacheReplay();
  }
}

async function presentSignalWorkspace(
  profileId: string,
  bounds: SignalWorkspaceBounds
): Promise<SignalWindowPresentationResult> {
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) throw new Error(`Signal profile ${profileId} was not found.`);
  const appId = signalAppId(profileId);
  const invocationId = randomUUID();
  signalPresentationInvocationIdsByApp.set(appId, invocationId);
  const isLatestInvocation = () => signalPresentationInvocationIdsByApp.get(appId) === invocationId;
  const finishInvocation = () => {
    if (isLatestInvocation()) signalPresentationInvocationIdsByApp.delete(appId);
  };
  if (!bounds.visible) {
    await hideSignalProfile(profileId);
    finishInvocation();
    return { presented: false, message: 'Signal 窗口当前不需要显示' };
  }

  pendingSignalWorkspaceBounds.set(profileId, bounds);
  if (visibleSignalProfileId !== profileId) {
    clearAllSignalCacheRequestState();
  }
  visibleSignalProfileId = profileId;
  if (!canShowSignalWindows()) {
    sendSignalWindowHide(appId, 'presentation-gate-closed');
    finishInvocation();
    return { presented: false, message: '皮卡丘翻译器当前不可显示 Signal 窗口' };
  }

  try {
    await launchSignalProfile(profileId);
  } catch (error) {
    if (
      isLatestInvocation() &&
      visibleSignalProfileId === profileId &&
      pendingSignalWorkspaceBounds.get(profileId)?.visible === true
    ) {
      hideAllSignalWindows();
    }
    finishInvocation();
    throw error;
  }
  const latestBounds = pendingSignalWorkspaceBounds.get(profileId);
  if (
    !isLatestInvocation() ||
    visibleSignalProfileId !== profileId ||
    latestBounds?.visible !== true ||
    !canShowSignalWindows()
  ) {
    if (visibleSignalProfileId !== profileId) {
      sendSignalWindowHide(appId, 'presentation-profile-became-inactive');
    }
    finishInvocation();
    return { presented: false, message: 'Signal 工作区状态已变化，旧窗口未显示' };
  }
  const screenBounds = signalBoundsToScreen(latestBounds);
  lastSignalScreenBounds.set(profileId, screenBounds);
  const result = await requestSignalWindowPresentation(profileId, screenBounds);
  if (
    isLatestInvocation() &&
    result.presented &&
    visibleSignalProfileId === profileId &&
    pendingSignalWorkspaceBounds.get(profileId)?.visible === true
  ) {
    hideSignalWindowsAfterTargetVisible(profileId);
    finishInvocation();
    return result;
  }
  if (result.presented) {
    sendSignalWindowHide(appId, 'presentation-acknowledged-after-profile-switch');
    finishInvocation();
    return { presented: false, message: 'Signal 多开已切换，旧窗口未显示' };
  }
  if (
    isLatestInvocation() &&
    visibleSignalProfileId === profileId &&
    pendingSignalWorkspaceBounds.get(profileId)?.visible === true
  ) {
    hideAllSignalWindows();
  }
  finishInvocation();
  return result;
}

async function hideSignalProfile(profileId: string) {
  pendingSignalWorkspaceBounds.delete(profileId);
  lastSignalScreenBounds.delete(profileId);
  if (visibleSignalProfileId === profileId) visibleSignalProfileId = null;
  signalPresentationInvocationIdsByApp.delete(signalAppId(profileId));
  clearSignalCacheRequestState(signalAppId(profileId));
  failSignalPresentationForApp(signalAppId(profileId), 'Signal 窗口显示请求已取消');
  sendSignalWindowHide(signalAppId(profileId), 'profile-hidden');
}

function hideAllSignalWindows() {
  signalPresentationInvocationIdsByApp.clear();
  clearAllSignalCacheRequestState();
  for (const appId of Array.from(signalPresentationRequestIdsByApp.keys())) {
    failSignalPresentationForApp(appId, 'Signal 窗口显示请求已取消');
  }
  for (const appId of signalControlClients.keys()) {
    sendSignalWindowHide(appId, 'all-signal-windows-hidden');
  }
}

async function hideAllConfiguredSignalProfiles() {
  hideAllSignalWindows();
  const config = await readConfig();
  await Promise.all(
    config.profiles
      .filter((profile) => profile.platform === 'signal')
      .map((profile) => hideSignalProfile(profile.id))
  );
  hideAllSignalWindows();
}

function requestSignalWorkspaceSyncBurst() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (signalMainWindowSuspended) return;
  mainWindow.webContents.send('signal:sync-workspace');
}

function scheduleSignalLayoutCacheReplay() {
  signalLayoutReplayTimers.forEach(timer => clearTimeout(timer));
  signalLayoutReplayTimers = [];
  const profileId = visibleSignalProfileId;
  if (!profileId) return;
  const appId = signalAppId(profileId);
  const context = getSignalCacheControlContext(appId);
  const active = activeSignalCacheConversations.get(appId);
  if (!context || active?.client !== context.client) return;
  const conversationId = active.conversationId;
  const client = context.client;
  // Native DPI/layout changes settle asynchronously. Keep the original identity
  // so delayed work cannot follow the user into another contact or account.
  signalLayoutReplayTimers = [180, 650, 1500, 3000].map(delay => setTimeout(() => {
    const current = activeSignalCacheConversations.get(appId);
    if (visibleSignalProfileId !== profileId ||
        !getSignalCacheControlContext(appId, client) ||
        current?.client !== client || current.conversationId !== conversationId) return;
    const request = validateSignalMessageSnapshotRequest({ type: 'message.snapshot.request', requestId: randomUUID() });
    if (!setPendingSignalCacheRequest(appId, {
      requestId: request.requestId, conversationId, client, state: 'pending', cacheOnly: true
    })) return;
    if (!sendSignalControlMessage(appId, request)) deletePendingSignalCacheRequest(appId, request.requestId);
  }, delay));
}

function refreshSignalAfterLayoutChange() {
  requestSignalWorkspaceSyncBurst();
  scheduleSignalLayoutCacheReplay();
}

function requestSignalProfilePresentation(profileId: string | null) {
  if (
    profileId &&
    pendingSignalWorkspaceBounds.get(profileId)?.visible &&
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.webContents.send('signal:restore-profile', profileId);
    return true;
  }
  requestSignalWorkspaceSyncBurst();
  return false;
}

function rememberSignalProfileForMainWindowResume() {
  if (signalMainWindowSuspended) return;
  signalMainWindowSuspended = true;
  const profileId = visibleSignalProfileId;
  signalProfileToRestoreAfterMainWindow = profileId && pendingSignalWorkspaceBounds.get(profileId)?.visible
    ? profileId
    : null;
}

function prepareSignalWindowsForMainMinimize() {
  rememberSignalProfileForMainWindowResume();
  // Signal is a verified Win32 owned window. Windows therefore hides and
  // restores it atomically with the minimized owner. Sending window.hide here
  // would clear Signal's desired-visible state and break that native restore.
}

function prepareSignalWindowsForMainHide() {
  rememberSignalProfileForMainWindowResume();
  hideAllSignalWindows();
}

function requestSignalWorkspaceRestoreOnce() {
  const preparedForRestore = signalMainWindowSuspended;
  signalMainWindowSuspended = false;
  if (!preparedForRestore) {
    requestSignalWorkspaceSyncBurst();
    return;
  }
  const profileId = signalProfileToRestoreAfterMainWindow;
  signalProfileToRestoreAfterMainWindow = null;
  requestSignalProfilePresentation(profileId);
}

function hideSignalWindowsAfterTargetVisible(profileId: string) {
  for (const appId of signalControlClients.keys()) {
    const otherProfileId = profileIdFromSignalAppId(appId);
    if (otherProfileId === profileId) continue;
    failSignalPresentationForApp(appId, 'Signal 多开已切换，旧窗口显示请求已取消');
    pendingSignalWorkspaceBounds.delete(otherProfileId);
    lastSignalScreenBounds.delete(otherProfileId);
    clearSignalCacheRequestState(appId);
    sendSignalWindowHide(appId, 'inactive-profile-hidden-after-target-visible');
  }
}

type SignalCacheControlContext = {
  profileId: string;
  client: SignalControlClient;
};

function getSignalCacheControlContext(
  appId: string,
  expectedClient?: SignalControlClient
): SignalCacheControlContext | null {
  const profileId = profileIdFromSignalAppId(appId);
  const client = signalControlClients.get(appId);
  const bounds = pendingSignalWorkspaceBounds.get(profileId);
  if (
    appId !== signalAppId(profileId) ||
    !client ||
    client.socket.destroyed ||
    (expectedClient && client !== expectedClient) ||
    !profileIdPattern.test(profileId) ||
    workspaceVisibilityGate.locked ||
    visibleSignalProfileId !== profileId ||
    bounds?.visible !== true ||
    !canShowSignalWindows()
  ) {
    return null;
  }
  return { profileId, client };
}

function appendSignalCacheResultWithinProtocolLimit(
  payload: SignalCacheResultBatch,
  result: SignalCacheResult
) {
  if (payload.results.length >= signalCacheProtocolMaxBatchSize) return;
  const candidate = { ...payload, results: [...payload.results, result] };
  try {
    validateSignalCacheResultBatch(candidate);
    payload.results.push(result);
  } catch {
    // An invalid or oversized legacy cache entry is a miss, never a reason to expose its contents.
  }
}

function sendEmptySignalCacheResultBatch(
  appId: string,
  requestId: string,
  conversationId: string
) {
  const response = validateSignalCacheResultBatch({
    type: 'translation.cacheResultBatch',
    requestId,
    conversationId,
    results: []
  });
  return sendSignalControlMessage(appId, response);
}

function signalSmartReplyErrorCode(error: unknown): SignalSmartReplyErrorCode {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (/429|busy|already running/i.test(message)) return 'rate-limited';
  if (/timeout|timed out|abort/i.test(`${name} ${message}`)) return 'timeout';
  if (/response|json|reply english|reply chinese|schema|placeholder|punctuation/i.test(message)) {
    return 'invalid-response';
  }
  if (/not configured|missing encrypted|authorization|license|unavailable/i.test(message)) {
    return 'unavailable';
  }
  return 'request-failed';
}

function signalSmartReplyPendingIsCurrent(
  appId: string,
  pending: PendingSignalSmartReplyRequest
) {
  const context = getSignalCacheControlContext(appId, pending.client);
  const activeConversation = activeSignalCacheConversations.get(appId);
  return Boolean(
    context &&
      activeConversation?.client === pending.client &&
      activeConversation.conversationId === pending.conversationId &&
      getPendingSignalSmartReplyRequest(appId, pending.requestId) === pending
  );
}

async function respondToSignalSmartReplyRequest(
  appId: string,
  profileId: string,
  pending: PendingSignalSmartReplyRequest,
  request: SignalSmartReplyRequest
) {
  try {
    if (!signalSmartReplyPendingIsCurrent(appId, pending)) return;
    await copyChatToGpt({
      requestId: request.requestId,
      profileId,
      platform: 'signal',
      messages: request.messages.map(message => ({
        speaker: message.direction === 'incoming' ? 'other' : 'self',
        text: message.sourceText
      })),
      latestSpeaker: 'other',
      replyCount: 3,
      outputLanguage: 'en-US',
      allowSensitiveEcho: false
    });
    void appendSignalTranslationDebugLog({
      event: 'smart-reply-request', stage: 'copied-to-gpt', appId,
      requestId: request.requestId, messageCount: request.messages.length
    });
  } catch (error) {
    void appendSignalTranslationDebugLog({
      event: 'smart-reply-request', stage: 'copy-to-gpt-failed', appId,
      requestId: request.requestId, code: signalSmartReplyErrorCode(error)
    });
  } finally {
    // The existing native protocol clears its pending button on this command;
    // it does not display an error or need a generated reply payload.
    if (signalSmartReplyPendingIsCurrent(appId, pending)) {
      sendSignalControlMessage(appId, {
        type: 'smartReply.error', requestId: request.requestId,
        contextVersion: signalSmartReplyContextVersion,
        conversationId: request.conversationId, trigger: pending.trigger,
        code: 'unavailable'
      });
    }
    removePendingSignalSmartReplyRequest(appId, pending);
  }
}

async function respondToSignalVisibleMessageBatch(
  appId: string,
  profileId: string,
  pending: PendingSignalCacheSnapshotRequest,
  batch: SignalVisibleMessageBatch
) {
  try {
    const refreshObservations = new Map(
      batch.messages.map(message => [
        message.messageId,
        observeSignalTranslationRefresh(
          profileId,
          message.conversationId,
          message.messageId
        )
      ])
    );
    if (!isSignalTranslationRefreshTriggerCurrent(profileId, pending)) {
      sendEmptySignalCacheResultBatch(appId, batch.requestId, batch.conversationId);
      return;
    }
    const cacheRequest: TranslationCacheLookupRequest = {
      profileId,
      platform: 'signal',
      contactId: batch.conversationId,
      contactIdType: 'platform',
      sourceHashes: Array.from(new Set(batch.messages.map((message) => message.sourceHash)))
    };
    const markedNonEnglish = pending.acceptanceTrigger?.forceCacheResult === true
      ? false
      : await isMarkedNonEnglishContact(cacheRequest);
    const cachedEntries = markedNonEnglish
      ? []
      : await lookupTranslationCache(cacheRequest);
    if (
      getPendingSignalCacheRequest(appId, batch.requestId) !== pending ||
      !getSignalCacheControlContext(appId, pending.client)
    ) {
      return;
    }
    if (!isSignalTranslationRefreshTriggerCurrent(profileId, pending)) {
      sendEmptySignalCacheResultBatch(appId, batch.requestId, batch.conversationId);
      return;
    }
    const cachedByHash = new Map(cachedEntries.map((entry) => [entry.sourceHash, entry]));
    const response: SignalCacheResultBatch = {
      type: 'translation.cacheResultBatch',
      requestId: batch.requestId,
      conversationId: batch.conversationId,
      results: []
    };
    const visibleCacheMisses: SignalVisibleMessage[] = [];

    const acceptanceTrigger = pending.acceptanceTrigger;
    const messagesToProject = batch.messages.filter(message => {
      if (
        acceptanceTrigger &&
        (
          message.messageId !== acceptanceTrigger.messageId ||
          message.sourceHash !== acceptanceTrigger.sourceHash
        )
      ) {
        return false;
      }
      if (acceptanceTrigger?.refreshTaskKey) return true;
      const observed = refreshObservations.get(message.messageId);
      return Boolean(
        observed &&
          isSignalTranslationRefreshObservationSettled(
            profileId,
            message.conversationId,
            message.messageId,
            observed
          )
      );
    });
    for (const message of messagesToProject) {
      const cached = cachedByHash.get(message.sourceHash);
      if (
        !cached ||
        typeof cached.sourceText !== 'string' ||
        typeof cached.translatedText !== 'string' ||
        normalizeSignalCacheSourceText(message.sourceText) !== normalizeSignalCacheSourceText(cached.sourceText) ||
        !isUsefulSignalCacheTranslation(message.sourceText, cached.translatedText)
      ) {
        if (!acceptanceTrigger && !markedNonEnglish) {
          visibleCacheMisses.push(message);
        }
        continue;
      }
      appendSignalCacheResultWithinProtocolLimit(response, {
        conversationId: message.conversationId,
        messageId: message.messageId,
        sourceHash: message.sourceHash,
        sourceText: message.sourceText,
        translatedText: cached.translatedText
      });
    }

    validateSignalCacheResultBatch(response);
    if (
      getPendingSignalCacheRequest(appId, batch.requestId) !== pending ||
      !getSignalCacheControlContext(appId, pending.client)
    ) {
      return;
    }
    const sent = sendSignalControlMessage(appId, response);
    if (sent && !acceptanceTrigger && !pending.cacheOnly) {
      for (const message of visibleCacheMisses) {
        if (
          enqueueSignalLiveTranslation(
            appId,
            profileId,
            pending.client,
            message,
            'history'
          )
        ) {
          appendSignalSourceOnlyAcceptanceStage('queue-accepted');
        }
      }
    }
    const triggerResult = response.results[0];
    if (
      sent &&
      pending.acceptanceTrigger &&
      response.results.length === 1 &&
      triggerResult?.messageId === pending.acceptanceTrigger.messageId &&
      triggerResult.sourceHash === pending.acceptanceTrigger.sourceHash
    ) {
      pending.acceptanceTrigger.resultSent = true;
      appendSignalSourceOnlyAcceptanceStage('trigger-result-sent');
    }
  } catch {
    if (
      getPendingSignalCacheRequest(appId, batch.requestId) === pending &&
      getSignalCacheControlContext(appId, pending.client)
    ) {
      try {
        sendEmptySignalCacheResultBatch(appId, batch.requestId, batch.conversationId);
      } catch {
        // The authenticated socket closed while the request-scoped cache miss was sent.
      }
    }
  } finally {
    // Keep the bounded request marker after completion so the same requestId cannot
    // be replayed. Conversation switch, hide, lock, transport lifecycle, or bounded
    // eviction clears it without retaining any message body.
    pending.state = 'completed';
    releaseSignalCacheLookupSlot(appId);
  }
}

function handleSignalControlMessage(appId: string, message: Record<string, unknown>) {
  const client = signalControlClients.get(appId);
  if (client) client.lastSeenAt = Date.now();

  try {
    const cacheContext = getSignalCacheControlContext(appId, client);
    if (client && message.type === 'notification.route.register') {
      registerSignalNotificationRoute(appId, message);
    }
    if (client && message.type === 'conversation.changed') {
      appendSignalSourceOnlyAcceptanceStage('conversation-envelope-received');
      let changed: ReturnType<typeof validateSignalConversationChangedMessage> | null = null;
      try {
        changed = validateSignalConversationChangedMessage(message);
      } catch {
        appendSignalSourceOnlyAcceptanceStage('conversation-invalid');
      }
      if (changed && !cacheContext) {
        appendSignalSourceOnlyAcceptanceStage('conversation-rejected-cache-context');
      } else if (changed && cacheContext) {
        const snapshotRequest = validateSignalMessageSnapshotRequest({
          type: 'message.snapshot.request',
          requestId: randomUUID()
        });
        const previous = activeSignalCacheConversations.get(appId);
        if (previous?.client !== cacheContext.client || previous.conversationId !== changed.conversationId) {
          clearSignalCacheRequestState(appId);
        }
        activeSignalCacheConversations.set(appId, {
          conversationId: changed.conversationId,
          client: cacheContext.client
        });
        appendSignalSourceOnlyAcceptanceStage('conversation-active');
        const pendingStored = (previous?.client !== cacheContext.client || previous.conversationId !== changed.conversationId) && setPendingSignalCacheRequest(appId, {
          requestId: snapshotRequest.requestId,
          conversationId: changed.conversationId,
          client: cacheContext.client,
          state: 'pending'
        });
        if (pendingStored && !sendSignalControlMessage(appId, snapshotRequest)) {
          deletePendingSignalCacheRequest(appId, snapshotRequest.requestId);
        }
      }
    }
    if (client && message.type === 'message.added') {
      appendSignalSourceOnlyAcceptanceStage('message-envelope-received');
      let added: ReturnType<typeof validateSignalMessageAdded> | null = null;
      try {
        added = validateSignalMessageAdded(message);
        appendSignalSourceOnlyAcceptanceStage('message-received');
      } catch {
        appendSignalSourceOnlyAcceptanceStage('message-invalid');
      }
      const activeConversation = activeSignalCacheConversations.get(appId);
      if (added && !cacheContext) {
        appendSignalSourceOnlyAcceptanceStage('message-rejected-cache-context');
      } else if (
        added &&
        cacheContext &&
        (
          activeConversation?.client !== cacheContext.client ||
          activeConversation.conversationId !== added.conversationId
        )
      ) {
        appendSignalSourceOnlyAcceptanceStage('message-rejected-active-conversation');
      } else if (added && cacheContext) {
        appendSignalSourceOnlyAcceptanceStage('message-accepted');
        recordSignalOutgoingIntegrityObservation(appId, added);
        const queued = enqueueSignalLiveTranslation(
          appId,
          cacheContext.profileId,
          cacheContext.client,
          added
        );
        appendSignalSourceOnlyAcceptanceStage(queued ? 'queue-accepted' : 'queue-rejected');
      }
    }
    if (
      client &&
      message.type === 'translation.refresh.request'
    ) {
      let refresh: ReturnType<typeof validateSignalTranslationRefreshRequest> | null = null;
      try {
        refresh = validateSignalTranslationRefreshRequest(message);
      } catch {
        // Strictly reject malformed or non-canonical refresh requests without logging payload data.
      }
      const activeConversation = activeSignalCacheConversations.get(appId);
      if (
        refresh &&
        cacheContext &&
        activeConversation?.client === cacheContext.client &&
        activeConversation.conversationId === refresh.conversationId
      ) {
        const queued = enqueueSignalTranslationRefresh(
          appId,
          cacheContext.profileId,
          cacheContext.client,
          refresh
        );
        if (!queued) sendSignalControlMessage(appId, {
          type: 'translation.refresh.status', requestId: refresh.requestId,
          conversationId: refresh.conversationId, messageId: refresh.messageId, state: 'idle', error: 'busy'
        });
      }
    }
    if (client && message.type === 'smartReply.request') {
      let request: SignalSmartReplyRequest | null = null;
      try {
        request = validateSignalSmartReplyRequest(message);
      } catch {
        // Reject malformed or non-canonical smart reply requests without logging message bodies.
      }
      const activeConversation = activeSignalCacheConversations.get(appId);
      if (
        request &&
        cacheContext &&
        activeConversation?.client === cacheContext.client &&
        activeConversation.conversationId === request.conversationId
      ) {
        const trigger = request.messages.at(-1);
        if (trigger) {
          const pending: PendingSignalSmartReplyRequest = {
            requestId: request.requestId,
            conversationId: request.conversationId,
            trigger,
            client: cacheContext.client
          };
          if (setPendingSignalSmartReplyRequest(appId, pending)) {
            void appendSignalTranslationDebugLog({
              event: 'smart-reply-request',
              stage: 'accepted',
              appId,
              requestId: request.requestId
            });
            void respondToSignalSmartReplyRequest(
              appId,
              cacheContext.profileId,
              pending,
              request
            );
          }
        }
      }
    }
    if (cacheContext && message.type === 'message.visibleBatch') {
      const batch = validateSignalVisibleMessageBatch(message);
      const activeConversation = activeSignalCacheConversations.get(appId);
      let pending = getPendingSignalCacheRequest(appId, batch.requestId);
      if (
        activeConversation?.client === cacheContext.client &&
        activeConversation.conversationId === batch.conversationId &&
        (!pending || (
          pending.client === cacheContext.client &&
          pending.conversationId === batch.conversationId
        ))
      ) {
        if (!pending) {
          const candidate: PendingSignalCacheSnapshotRequest = {
            requestId: batch.requestId,
            conversationId: batch.conversationId,
            client: cacheContext.client,
            state: 'pending'
          };
          if (setPendingSignalCacheRequest(appId, candidate)) pending = candidate;
        }
        if (pending?.state === 'pending') {
          const acceptanceTrigger = pending.acceptanceTrigger;
          if (
            acceptanceTrigger &&
            batch.messages.some(message =>
              message.messageId === acceptanceTrigger.messageId &&
              message.sourceHash === acceptanceTrigger.sourceHash
            )
          ) {
            appendSignalSourceOnlyAcceptanceStage('visible-batch-accepted');
          }
          if (!tryAcquireSignalCacheLookupSlot(appId)) {
            pending.state = 'completed';
            try {
              sendEmptySignalCacheResultBatch(appId, batch.requestId, batch.conversationId);
            } catch {
              // The authenticated socket closed while the request-scoped cache miss was sent.
            }
          } else {
            pending.state = 'responding';
            void respondToSignalVisibleMessageBatch(
              appId,
              cacheContext.profileId,
              pending,
              batch
            );
          }
        }
      }
    }
    if (cacheContext && message.type === 'translation.cacheResultApplied') {
      const applied = validateSignalCacheResultAppliedMessage(message);
      const pending = getPendingSignalCacheRequest(appId, applied.requestId);
      if (
        pending?.client === cacheContext.client &&
        pending.acceptanceTrigger?.resultSent === true &&
        applied.appliedCount === 1
      ) {
        appendSignalSourceOnlyAcceptanceStage('result-applied');
        appendSignalSourceOnlyAcceptanceStage('completed');
        pending.acceptanceTrigger = undefined;
      }
    }
    if (message.type === 'heartbeat') {
      sendSignalControlMessage(appId, { type: 'heartbeat.ack', at: Date.now() });
    }
    if (
      message.type === 'security.visibility-applied' &&
      typeof message.locked === 'boolean' &&
      Number.isSafeInteger(message.revision) &&
      Number.isSafeInteger(message.visibleWindowCount)
    ) {
      const applied =
        message.locked === workspaceVisibilityGate.locked &&
        message.revision === workspaceVisibilityGate.revision &&
        (!message.locked || message.visibleWindowCount === 0);
      settleSignalVisibilityApplied(appId, Number(message.revision), applied);
    }
    if (message.type === 'ready') {
      const profileId = profileIdFromSignalAppId(appId);
      const bounds = pendingSignalWorkspaceBounds.get(profileId);
      if (client) client.ready = true;
      sendSignalOwner(appId);
      sendSignalVisibilityState(appId);
      if (bounds) sendSignalWorkspaceBounds(profileId, bounds);
      const sentPendingPresentation = sendPendingSignalPresentation(appId);
      if (
        !sentPendingPresentation &&
        !signalPresentationRequestIdsByApp.has(appId) &&
        !signalPresentationInvocationIdsByApp.has(appId) &&
        visibleSignalProfileId === profileId &&
        bounds?.visible &&
        canShowSignalWindows()
      ) {
        void presentSignalWorkspace(profileId, bounds);
      }
    }
    if (
      message.type === 'window.presentation-applied' &&
      typeof message.requestId === 'string' &&
      typeof message.visible === 'boolean' &&
      message.bounds &&
      typeof message.bounds === 'object'
    ) {
      const request = signalPresentationRequests.get(message.requestId);
      const eventBounds = message.bounds as Record<string, unknown>;
      const boundsMatch = Boolean(
        request &&
          request.appId === appId &&
          matchesSignalPresentationBounds(request.bounds, eventBounds)
      );
      if (!app.isPackaged && process.env.MAOYI_SIGNAL_WINDOW_TRACE === '1') {
        console.error(
          `[signal-window-presentation-ack] ${appId} request=${message.requestId} ` +
            `visible=${String(message.visible)} boundsMatch=${String(boundsMatch)} ` +
            `expected=${JSON.stringify(request?.bounds ?? null)} ` +
            `actual=${JSON.stringify(eventBounds)}`
        );
      }
      if (request?.appId === appId) {
        settleSignalPresentation(message.requestId, {
          presented: message.visible === true && boundsMatch,
          message: message.visible === true && boundsMatch
            ? 'Signal 窗口已显示'
            : 'Signal 原生窗口未确认显示，请点击“打开 Signal”重试'
        });
      }
    }
    if (message.type === 'script.result' && typeof message.requestId === 'string') {
      const request = signalScriptRequests.get(message.requestId);
      if (request) {
        clearTimeout(request.timer);
        signalScriptRequests.delete(message.requestId);
        request.resolve(message.result);
      }
    }
    if (message.type === 'error' && typeof message.requestId === 'string') {
      const presentationRequest = signalPresentationRequests.get(message.requestId);
      if (presentationRequest?.appId === appId) {
        settleSignalPresentation(message.requestId, {
          presented: false,
          message: typeof message.message === 'string'
            ? `Signal 窗口显示失败：${message.message}`
            : 'Signal 窗口显示失败，请点击“打开 Signal”重试'
        });
      } else {
        const request = signalScriptRequests.get(message.requestId);
        if (request) {
          clearTimeout(request.timer);
          signalScriptRequests.delete(message.requestId);
          request.reject(new Error(typeof message.message === 'string' ? message.message : 'Signal script failed.'));
        }
      }
    }
  } catch {
    // Ignore malformed child-process messages. The channel must keep running.
  }

  void persistSignalControlStatus();
}

async function persistSignalControlStatus() {
  if (!runtimeLoggingEnabled) return;
  const operation = signalControlStatusWriteQueue.catch(() => undefined).then(async () => {
    const entries = Array.from(signalControlClients.entries()).map(([appId, client]) => ({
      appId,
      processId: client.processId,
      connected: !client.socket.destroyed,
      connectedAt: client.connectedAt,
      lastSeenAt: client.lastSeenAt
    }));
    try {
      await mkdir(app.getPath('userData'), { recursive: true });
      await writeJsonAtomic(signalControlStatusPath(), { port: signalControlPort, entries, updatedAt: Date.now() });
    } catch {
      // Diagnostics must not block Signal runtime control.
    }
  });
  signalControlStatusWriteQueue = operation.catch(() => undefined);
  await operation;
}

async function cleanupPackagedRuntimeLogs() {
  if (runtimeLoggingEnabled) return;
  const userDataPath = app.getPath('userData');
  const directLogFiles = [
    translateRequestLogPath(),
    signalTranslationDebugLogPath(),
    signalSourceOnlyAcceptanceSummaryPath(),
    signalControlStatusPath(),
    join(userDataPath, 'protocol-handlers.log')
  ];
  await Promise.all(directLogFiles.map((path) => rm(path, { force: true }).catch(() => undefined)));

  try {
    const entries = await readdir(userDataPath, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^signal-control-status\..+\.tmp$/i.test(entry.name))
      .map((entry) => rm(join(userDataPath, entry.name), { force: true }).catch(() => undefined)));
  } catch {
    // The user data directory may not exist on first launch.
  }

  try {
    const instances = await readdir(signalInstancesRoot(), { withFileTypes: true });
    await Promise.all(instances
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const instanceDir = join(signalInstancesRoot(), entry.name);
        return [
          rm(join(instanceDir, 'logs'), { recursive: true, force: true }).catch(() => undefined),
          rm(join(instanceDir, 'protocol-handlers.log'), { force: true }).catch(() => undefined)
        ];
      }));
  } catch {
    // Signal instances are created lazily.
  }
}

async function launchSignalProfile(id: string) {
  const activeLaunch = signalLaunchPromises.get(id);
  if (activeLaunch) return activeLaunch;
  const launchPromise = launchSignalProfileNow(id).finally(() => {
    if (signalLaunchPromises.get(id) === launchPromise) {
      signalLaunchPromises.delete(id);
    }
  });
  signalLaunchPromises.set(id, launchPromise);
  return launchPromise;
}

type SignalCredentialPipe = {
  address: string;
  deliver: (credential: ReturnType<typeof createSignalLaunchCredential>, child: ChildProcess) => Promise<void>;
  close: () => Promise<void>;
};

async function closeNetServer(server: NetServer) {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

async function createSignalCredentialPipe(): Promise<SignalCredentialPipe> {
  if (process.platform !== 'win32') throw new Error('Signal launch credential pipes require Windows.');
  const address = `\\\\.\\pipe\\maoyi-signal-${process.pid}-${randomBytes(16).toString('hex')}`;
  let claimed = false;
  let credentialResolve: ((value: string) => void) | null = null;
  const credentialReady = new Promise<string>((resolvePromise) => {
    credentialResolve = resolvePromise;
  });
  let deliveryResolve: (() => void) | null = null;
  let deliveryReject: ((error: Error) => void) | null = null;
  const delivered = new Promise<void>((resolvePromise, reject) => {
    deliveryResolve = resolvePromise;
    deliveryReject = reject;
  });
  const server = createNetServer((socket) => {
    if (claimed) {
      socket.destroy();
      return;
    }
    claimed = true;
    socket.once('error', (error) => deliveryReject?.(error));
    void credentialReady.then((payload) => {
      socket.end(payload, () => deliveryResolve?.());
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(address, () => {
      server.off('error', onError);
      resolvePromise();
    });
  });
  return {
    address,
    async deliver(credential, child) {
      credentialResolve?.(`${JSON.stringify(credential)}\n`);
      credentialResolve = null;
      let timer: NodeJS.Timeout | null = null;
      let onChildExit: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
      const childExited = new Promise<never>((_resolve, reject) => {
        const rejectForExit = (code: number | null, signal: NodeJS.Signals | null) => {
          reject(new Error(`Signal exited before accepting launch credentials (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`));
        };
        if (child.exitCode !== null || child.signalCode !== null) {
          rejectForExit(child.exitCode, child.signalCode);
          return;
        }
        onChildExit = rejectForExit;
        child.once('exit', rejectForExit);
      });
      try {
        await Promise.race([
          delivered,
          childExited,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(
              `Signal launch credential pipe timed out after 30 seconds (clientConnected=${claimed}, pid=${child.pid ?? 'unknown'}, exitCode=${child.exitCode ?? 'running'}, signal=${child.signalCode ?? 'none'}).`
            )), 30_000);
          })
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        if (onChildExit) child.off('exit', onChildExit);
      }
    },
    close: () => closeNetServer(server)
  };
}

async function launchSignalProfileNow(id: string) {
  assertClientRuntimeAllowed();
  const runtimeSecurity = activeRuntimeSecurity;
  if (!runtimeSecurity) throw new Error('Signal 运行时绑定尚未建立');
  const runtimeBinding = runtimeSecurity.payload;
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === id && item.platform === 'signal');
  if (!profile) throw new Error(`Signal profile ${id} was not found.`);
  const dataDir = profile.signalDataDir || signalInstancePath(profile.id);
  let recovered = false;
  if (await hasSignalStartupCorruption(dataDir)) {
    await killSignalProcessesByDataDir(dataDir);
    const existingCorruptProcess = signalProcesses.get(id);
    if (existingCorruptProcess) {
      signalProcesses.delete(id);
      if (existingCorruptProcess.exitCode === null && !existingCorruptProcess.killed) {
        existingCorruptProcess.kill();
      }
    }
    recovered = await quarantineSignalDataDir(dataDir);
  }

  const existingProcess = signalProcesses.get(id);
  if (existingProcess && existingProcess.exitCode === null && !existingProcess.killed) {
    scheduleHideSignalTaskbarButtons(dataDir);
    return { pid: existingProcess.pid ?? null, dataDir, recovered };
  }

  await mkdir(dataDir, { recursive: true });
  await ensureSignalInstanceBinding(
    dataDir,
    profile.id,
    runtimeBinding,
    runtimeSecurity.devicePrivateKeyPem
  );
  await ensureSignalRuntimePreferences(dataDir);
  await cleanupSignalUpdateArtifacts(dataDir);

  const wsPort = await ensureSignalControlServer();
  const credentialPipe = await createSignalCredentialPipe();
  const args = [
    '--df',
    `--user-data-dir=${dataDir}`,
    `--appId=${signalAppId(profile.id)}`,
    `--wsPort=${wsPort}`,
    `--dfLaunchPipe=${credentialPipe.address}`,
    '--windowMode=embed',
    `--title=${profile.name}`
  ];
  let executable: string;
  let child: ChildProcess;
  try {
    executable = await resolveSignalExecutable();
    child = spawn(executable, args, {
      stdio: 'ignore',
      windowsHide: false,
      env: runtimeLoggingEnabled
        ? {
            ...process.env,
            MAOYI_SIGNAL_GUARD_DIAGNOSTIC: join(dataDir, 'df-guard-debug.json')
          }
        : undefined
    });
  } catch (error) {
    await credentialPipe.close();
    throw error;
  }
  try {
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      const handleSpawn = () => {
        child.off('error', handleError);
        resolveSpawn();
      };
      const handleError = (error: Error) => {
        child.off('spawn', handleSpawn);
        rejectSpawn(error);
      };
      child.once('spawn', handleSpawn);
      child.once('error', handleError);
    });
  } catch (error) {
    await credentialPipe.close();
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Signal process failed to start: ${detail}`);
  }
  child.on('error', (error) => {
    if (runtimeLoggingEnabled) console.error('Signal child process error:', error.message);
  });
  child.once('exit', () => {
    if (signalProcesses.get(id) === child) {
      signalProcesses.delete(id);
    }
    const appId = signalAppId(id);
    const controlSession = signalControlSessions.get(appId);
    if (controlSession?.processId === child.pid) {
      failSignalPresentationForApp(appId, 'Signal 进程已退出，请点击“打开 Signal”重试');
      signalControlSessions.delete(appId);
      signalControlClients.get(appId)?.socket.destroy();
      signalControlClients.delete(appId);
    }
  });
  if (!child.pid) {
    child.kill();
    await credentialPipe.close();
    throw new Error('Signal process did not receive a process ID.');
  }
  const credential = createSignalLaunchCredential(
    runtimeBinding,
    profile.id,
    child.pid,
    runtimeSecurity.devicePrivateKeyPem
  );
  signalControlSessions.set(signalAppId(profile.id), {
    processId: child.pid,
    key: Buffer.from(credential.controlKey, 'base64url'),
    createdAt: Date.now()
  });
  try {
    await credentialPipe.deliver(credential, child);
  } catch (error) {
    signalControlSessions.delete(signalAppId(profile.id));
    child.kill();
    throw error;
  } finally {
    await credentialPipe.close();
  }
  signalProcesses.set(id, child);
  scheduleHideSignalTaskbarButtons(dataDir);
  scheduleSignalStartupRecovery(profile.id, dataDir);
  return { pid: child.pid ?? null, dataDir, wsPort, recovered };
}

function scheduleSignalStartupRecovery(profileId: string, dataDir: string) {
  for (const delay of [3500, 9000]) {
    setTimeout(() => {
      void recoverSignalStartupIfCorrupt(profileId, dataDir);
    }, delay);
  }
}

async function recoverSignalStartupIfCorrupt(profileId: string, dataDir: string) {
  if (signalStartupRecoveryAttempts.has(profileId)) return;
  if (!(await hasSignalStartupCorruption(dataDir))) return;

  signalStartupRecoveryAttempts.add(profileId);
  await killSignalProcessesByDataDir(dataDir);
  const child = signalProcesses.get(profileId);
  if (child) {
    signalProcesses.delete(profileId);
    if (child.exitCode === null && !child.killed) {
      child.kill();
    }
  }
  const recovered = await quarantineSignalDataDir(dataDir);
  if (!recovered) return;

  const bounds = pendingSignalWorkspaceBounds.get(profileId);
  if (bounds?.visible) {
    await launchSignalProfile(profileId);
    sendSignalWorkspaceBounds(profileId, bounds);
  }
}

function scheduleHideSignalTaskbarButtons(dataDir: string) {
  void dataDir;
}

function scheduleHideConfiguredSignalTaskbarButtons(config: AppConfig) {
  if (process.platform !== 'win32') return;
  const dataDirs = config.profiles
    .filter((profile) => profile.platform === 'signal')
    .map((profile) => profile.signalDataDir || signalInstancePath(profile.id));
  for (const dataDir of dataDirs) {
    scheduleHideSignalTaskbarButtons(dataDir);
  }
}

async function stopSignalProfile(id: string, signalDataDir?: string) {
  assertProfileId(id);
  const appId = signalAppId(id);
  failSignalPresentationForApp(appId, 'Signal 进程正在停止，窗口显示请求已取消');
  signalPresentationInvocationIdsByApp.delete(appId);
  signalControlSessions.delete(appId);
  signalControlClients.get(appId)?.socket.destroy();
  signalControlClients.delete(appId);
  const child = signalProcesses.get(id);
  if (child) {
    signalProcesses.delete(id);
  }
  if (child && child.exitCode === null && !child.killed) {
    child.kill();
  }

  let dataDir = signalDataDir;
  if (!dataDir) {
    const config = await readConfig();
    const profile = config.profiles.find((item) => item.id === id && item.platform === 'signal');
    dataDir = profile?.signalDataDir;
  }
  if (dataDir) {
    await killSignalProcessesByDataDir(dataDir);
  }
}

async function killSignalProcessesByDataDir(dataDir: string) {
  if (process.platform !== 'win32') return;
  const safeDataDir = resolve(dataDir);
  const child = relative(resolve(signalInstancesRoot()), safeDataDir);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Signal data directory escaped its authorized root.');
  }
  const escaped = safeDataDir.replace(/'/g, "''");
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$needle = '${escaped}'`,
    "Get-CimInstance Win32_Process -Filter \"Name = 'Signal.exe'\" |",
    '  Where-Object { $_.CommandLine -like "*$needle*" } |',
    '  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
  ].join('\n');
  await new Promise<void>((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true }, () => {
      resolve();
    });
  });
}

async function stopAllSignalProfilesForQuit() {
  for (const child of signalProcesses.values()) {
    if (child.exitCode === null && !child.killed) {
      child.kill();
    }
  }
  signalProcesses.clear();
  for (const client of signalControlClients.values()) client.socket.destroy();
  signalControlClients.clear();
  signalControlSessions.clear();

  const config = await readConfig();
  const dataDirs = config.profiles
    .filter((profile) => profile.platform === 'signal')
    .map((profile) => profile.signalDataDir || signalInstancePath(profile.id));

  await Promise.all(dataDirs.map((dataDir) => killSignalProcessesByDataDir(dataDir)));
}

async function renameProfile(id: string, name: string, group: string): Promise<AppConfig> {
  const nextName = name.trim();
  const nextGroup = group.trim();
  if (!id || !nextName) throw new Error('Profile name is required.');
  if (!nextGroup) throw new Error('Profile group is required.');
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === id);
  if (!profile) throw new Error(`Profile ${id} was not found.`);
  if (profile.name === nextName && profile.group === nextGroup) return config;
  const duplicate = config.profiles.some((item) => item.id !== id && item.platform === profile.platform && item.name === nextName);
  if (duplicate) throw new Error(`Profile name ${nextName} already exists.`);
  profile.name = nextName;
  profile.group = nextGroup;
  return saveConfig(config);
}

async function removeProfile(id: string): Promise<AppConfig> {
  const config = await readConfig();
  const profile = config.profiles.find((item) => item.id === id);
  config.profiles = config.profiles.filter((profile) => profile.id !== id);
  if (config.activeProfileId === id) {
    config.activeProfileId = config.profiles[0]?.id ?? null;
  }
  const savedConfig = await saveConfig(config);
  if (profile) {
    if (profile.platform === 'signal') {
      await stopSignalProfile(profile.id, profile.signalDataDir);
    }
    await destroyProfilePartition(profile.partition);
    if (profile.platform === 'opensms') removeOpenSmsLogin(profile.id);
    await removeProfileTranslationCache(profile.id);
    if (profile.signalDataDir) {
      await removePathWithRetry(profile.signalDataDir);
    }
  }
  await cleanupOrphanProfilePartitions(savedConfig);
  await cleanupOrphanSignalInstances(savedConfig);
  return savedConfig;
}

async function removeProfileTranslationCache(profileId: string) {
  const safeProfileId = safeProfileFileName(profileId);
  for (const platform of supportedPlatforms) {
    const platformRoot = containedPath(translationCacheRoot(), 'v3', safePathPart(platform));
    await removePathWithRetry(containedPath(platformRoot, safeProfileId));
  }
}

async function drainProfileTranslationCacheWrites(profileId: string) {
  const marker = `${sep}${safeProfileFileName(profileId)}${sep}`;
  const pending = Array.from(translationCacheWriteQueues.entries())
    .filter(([key]) => key.includes(marker))
    .map(([, promise]) => promise.catch(() => false));
  await Promise.all(pending);
}

async function removeProfileNonEnglishMarkers(profileId: string) {
  const excludedRoot = join(translationCacheRoot(), 'excluded-contacts');
  for (const platform of supportedPlatforms) {
    await removePathWithRetry(containedPath(excludedRoot, safePathPart(platform), safeProfileFileName(profileId)));
  }
}

async function removeSignalNotificationRoutesForProfile(profileId: string) {
  if (!signalNotificationRoutesLoaded) await loadSignalNotificationRoutes();
  const appId = signalAppId(profileId);
  const removedActivationIds = new Set(
    Array.from(signalNotificationRoutes.values())
      .filter(route => route.appId === appId)
      .map(route => route.activationId)
  );
  signalNotificationRoutes = new Map(
    Array.from(signalNotificationRoutes.entries()).filter(([, route]) => route.appId !== appId)
  );
  for (let index = pendingSignalNotificationActivationIds.length - 1; index >= 0; index -= 1) {
    if (removedActivationIds.has(pendingSignalNotificationActivationIds[index])) {
      pendingSignalNotificationActivationIds.splice(index, 1);
    }
  }
  await signalNotificationRouteWriteQueue.catch(() => undefined);
  const path = signalNotificationRoutesPath();
  const hasStoredFile = await pathExists(path);
  if (!hasStoredFile && signalNotificationRoutes.size === 0) return;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Signal 通知记录无法解密清理，请重新启动后重试');
  const payload = JSON.stringify({ schemaVersion: 1, records: currentSignalNotificationRoutes() });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, safeStorage.encryptString(payload));
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

async function removeProfileSignalControlStatus(profileId: string) {
  await signalControlStatusWriteQueue.catch(() => undefined);
  const path = signalControlStatusPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    await rm(path, { force: true });
    return;
  }
  if (!Array.isArray(parsed.entries)) {
    await rm(path, { force: true });
    return;
  }
  const remaining = parsed.entries.filter(entry =>
    !entry || typeof entry !== 'object' || (entry as Record<string, unknown>).appId !== signalAppId(profileId)
  );
  if (remaining.length === parsed.entries.length) return;
  await writeJsonAtomic(path, { ...parsed, entries: remaining, updatedAt: Date.now() });
}

async function rewriteProfileScopedJsonl(path: string, profileId: string) {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const filtered = filterProfileScopedJsonl(contents, profileId);
  if (!filtered.removed) return;
  if (!filtered.contents) {
    await rm(path, { force: true });
    return;
  }
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, filtered.contents, 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

async function removeProfileScopedRuntimeLogs(profileId: string) {
  await enqueueProfileLogOperation(async () => {
    await rewriteProfileScopedJsonl(translateRequestLogPath(), profileId);
    await rewriteProfileScopedJsonl(signalTranslationDebugLogPath(), profileId);
  });

  if (!translationDiagnostics) return;
  await translationDiagnostics.removeProfileRecords(profileLogIdentityHash(profileId));
}

async function readTranslationCacheIndex(request: TranslationCacheLoadRequest | TranslationCacheSetRequest): Promise<TranslationCacheIndex> {
  try {
    const raw = (await readFile(chunkedTranslationCacheIndexPath(request), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<TranslationCacheIndex>;
    if (parsed.schemaVersion !== 3 || !Array.isArray(parsed.chunks)) return defaultTranslationCacheIndex();
    return {
      schemaVersion: 3,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt as number : Date.now(),
      chunks: parsed.chunks
        .filter((chunk): chunk is TranslationCacheChunkMeta =>
          Boolean(
            /^chunk-\d{6}\.dfc$/.test(chunk?.file || '') &&
            Number.isFinite(chunk.count) &&
            Number.isFinite(chunk.bytes) &&
            Number.isFinite(chunk.minUpdatedAt) &&
            Number.isFinite(chunk.maxUpdatedAt)
          )
        ),
      oldestViewedKey: parsed.oldestViewedKey,
      oldestViewedAt: parsed.oldestViewedAt,
      lastViewedRange: parsed.lastViewedRange
    };
  } catch {
    return defaultTranslationCacheIndex();
  }
}

async function readTranslationCacheIndexFromDir(cacheDir: string): Promise<TranslationCacheIndex> {
  try {
    const raw = (await readFile(containedPath(cacheDir, 'index.json'), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<TranslationCacheIndex>;
    if (parsed.schemaVersion !== 3 || !Array.isArray(parsed.chunks)) return defaultTranslationCacheIndex();
    return {
      schemaVersion: 3,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt as number : Date.now(),
      chunks: parsed.chunks
        .filter((chunk): chunk is TranslationCacheChunkMeta =>
          Boolean(
            /^chunk-\d{6}\.dfc$/.test(chunk?.file || '') &&
            Number.isFinite(chunk.count) &&
            Number.isFinite(chunk.bytes) &&
            Number.isFinite(chunk.minUpdatedAt) &&
            Number.isFinite(chunk.maxUpdatedAt)
          )
        ),
      oldestViewedKey: parsed.oldestViewedKey,
      oldestViewedAt: parsed.oldestViewedAt,
      lastViewedRange: parsed.lastViewedRange
    };
  } catch {
    return defaultTranslationCacheIndex();
  }
}

async function writeTranslationCacheIndex(request: TranslationCacheLoadRequest | TranslationCacheSetRequest, index: TranslationCacheIndex) {
  const targetPath = chunkedTranslationCacheIndexPath(request);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeJsonAtomic(targetPath, { ...index, updatedAt: Date.now() });
}

async function readTranslationCacheChunk(request: TranslationCacheLoadRequest | TranslationCacheSetRequest, chunk: TranslationCacheChunkMeta) {
  const cacheDir = chunkedTranslationCacheDir(request);
  try {
    const raw = await readFile(containedPath(cacheDir, chunk.file), 'utf8');
    return decryptTranslationCacheChunk(cacheDir, chunk.file, raw);
  } catch {
    return [];
  }
}

async function readTranslationCacheChunkFromDir(cacheDir: string, chunk: TranslationCacheChunkMeta) {
  try {
    const raw = await readFile(containedPath(cacheDir, chunk.file), 'utf8');
    return decryptTranslationCacheChunk(cacheDir, chunk.file, raw);
  } catch {
    return [];
  }
}

function decryptTranslationCacheChunk(cacheDir: string, chunkFile: string, raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return decryptTranslationCacheEntry(
          cacheDir,
          chunkFile,
          JSON.parse(line) as EncryptedTranslationCacheRecord
        );
      } catch {
        return null;
      }
    })
    .filter((entry): entry is TranslationCacheEntry =>
      Boolean(entry?.sourceHash && entry?.translatedText && Number.isFinite(entry?.updatedAt))
    );
}

function mergeTranslationCacheEntries(entries: TranslationCacheEntry[]) {
  const byHash = new Map<string, TranslationCacheEntry>();
  for (const entry of entries.sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!byHash.has(entry.sourceHash)) byHash.set(entry.sourceHash, entry);
  }
  return Array.from(byHash.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readChunkedTranslationCacheEntries(
  request: TranslationCacheLoadRequest | TranslationCacheSetRequest,
  neededCount: number
) {
  const index = await readTranslationCacheIndex(request);
  if (!index.chunks.length) return [];
  const entries: TranslationCacheEntry[] = [];
  const chunksNewestFirst = [...index.chunks].sort((a, b) => b.maxUpdatedAt - a.maxUpdatedAt);
  for (const chunk of chunksNewestFirst) {
    entries.push(...await readTranslationCacheChunk(request, chunk));
    if (mergeTranslationCacheEntries(entries).length >= neededCount) break;
  }
  return mergeTranslationCacheEntries(entries);
}

async function readChunkedTranslationCacheEntriesFromDir(cacheDir: string, neededCount: number) {
  const index = await readTranslationCacheIndexFromDir(cacheDir);
  if (!index.chunks.length) return [];
  const entries: TranslationCacheEntry[] = [];
  const chunksNewestFirst = [...index.chunks].sort((a, b) => b.maxUpdatedAt - a.maxUpdatedAt);
  for (const chunk of chunksNewestFirst) {
    entries.push(...await readTranslationCacheChunkFromDir(cacheDir, chunk));
    if (mergeTranslationCacheEntries(entries).length >= neededCount) break;
  }
  return mergeTranslationCacheEntries(entries);
}

function requestedTranslationSourceHashes(request: TranslationCacheLookupRequest) {
  return Array.from(
    new Set(
      (request.sourceHashes || [])
        .map((hash) => String(hash || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 240);
}

function collectMatchingTranslationEntries(
  entries: TranslationCacheEntry[],
  requestedHashes: Set<string>,
  matchedEntries: Map<string, TranslationCacheEntry>
) {
  for (const entry of entries.sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!requestedHashes.has(entry.sourceHash) || matchedEntries.has(entry.sourceHash)) continue;
    matchedEntries.set(entry.sourceHash, entry);
  }
}

async function readChunkedTranslationCacheEntriesByHashes(
  request: TranslationCacheLoadRequest | TranslationCacheSetRequest,
  sourceHashes: string[]
) {
  const requestedHashes = new Set(sourceHashes);
  const matchedEntries = new Map<string, TranslationCacheEntry>();
  const index = await readTranslationCacheIndex(request);
  const chunksNewestFirst = [...index.chunks].sort((a, b) => b.maxUpdatedAt - a.maxUpdatedAt);
  for (const chunk of chunksNewestFirst) {
    collectMatchingTranslationEntries(await readTranslationCacheChunk(request, chunk), requestedHashes, matchedEntries);
    if (matchedEntries.size >= requestedHashes.size) break;
  }
  return Array.from(matchedEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readChunkedTranslationCacheEntriesFromDirByHashes(cacheDir: string, sourceHashes: string[]) {
  const requestedHashes = new Set(sourceHashes);
  const matchedEntries = new Map<string, TranslationCacheEntry>();
  const index = await readTranslationCacheIndexFromDir(cacheDir);
  const chunksNewestFirst = [...index.chunks].sort((a, b) => b.maxUpdatedAt - a.maxUpdatedAt);
  for (const chunk of chunksNewestFirst) {
    collectMatchingTranslationEntries(await readTranslationCacheChunkFromDir(cacheDir, chunk), requestedHashes, matchedEntries);
    if (matchedEntries.size >= requestedHashes.size) break;
  }
  return Array.from(matchedEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function listDirectoryPaths(path: string) {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(path, entry.name));
  } catch {
    return [];
  }
}

async function readProfileWideChunkedTranslationCacheEntries(profileId: string, neededCount: number) {
  const cacheDirs: string[] = [];
  for (const platformDir of await listDirectoryPaths(join(translationCacheRoot(), 'v3'))) {
    const profileDir = join(platformDir, safeProfileFileName(profileId));
    cacheDirs.push(...await listDirectoryPaths(profileDir));
  }

  const indexedCacheDirs: Array<{ cacheDir: string; index: TranslationCacheIndex }> = [];
  for (const cacheDir of cacheDirs) {
    const index = await readTranslationCacheIndexFromDir(cacheDir);
    if (index.chunks.length) indexedCacheDirs.push({ cacheDir, index });
  }

  const entries: TranslationCacheEntry[] = [];
  for (const { cacheDir } of indexedCacheDirs.sort((a, b) => b.index.updatedAt - a.index.updatedAt)) {
    entries.push(...await readChunkedTranslationCacheEntriesFromDir(cacheDir, neededCount));
    if (mergeTranslationCacheEntries(entries).length >= neededCount) break;
  }
  return mergeTranslationCacheEntries(entries);
}

async function readProfileWideChunkedTranslationCacheEntriesByHashes(profileId: string, sourceHashes: string[]) {
  const requestedHashes = new Set(sourceHashes);
  const matchedEntries = new Map<string, TranslationCacheEntry>();
  const cacheDirs: string[] = [];
  for (const platformDir of await listDirectoryPaths(join(translationCacheRoot(), 'v3'))) {
    const profileDir = join(platformDir, safeProfileFileName(profileId));
    cacheDirs.push(...await listDirectoryPaths(profileDir));
  }

  const indexedCacheDirs: Array<{ cacheDir: string; index: TranslationCacheIndex }> = [];
  for (const cacheDir of cacheDirs) {
    const index = await readTranslationCacheIndexFromDir(cacheDir);
    if (index.chunks.length) indexedCacheDirs.push({ cacheDir, index });
  }

  for (const { cacheDir } of indexedCacheDirs.sort((a, b) => b.index.updatedAt - a.index.updatedAt)) {
    const missingHashes = sourceHashes.filter((hash) => !matchedEntries.has(hash));
    if (!missingHashes.length) break;
    collectMatchingTranslationEntries(
      await readChunkedTranslationCacheEntriesFromDirByHashes(cacheDir, missingHashes),
      requestedHashes,
      matchedEntries
    );
  }
  return Array.from(matchedEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function loadTranslationCache(request: TranslationCacheLoadRequest): Promise<TranslationCacheEntry[]> {
  const offset = Math.max(0, request.offset ?? 0);
  const limit = Math.min(Math.max(1, request.limit ?? 100), 1000);
  const neededCount = offset + limit;
  const chunkedEntries = request.platform || request.contactId
    ? await readChunkedTranslationCacheEntries(request, neededCount)
    : await readProfileWideChunkedTranslationCacheEntries(request.profileId, neededCount);
  const entries = mergeTranslationCacheEntries(chunkedEntries);
  return entries.slice(offset, offset + limit);
}

async function lookupTranslationCache(request: TranslationCacheLookupRequest): Promise<TranslationCacheEntry[]> {
  const sourceHashes = requestedTranslationSourceHashes(request);
  if (!request.profileId || !sourceHashes.length) return [];

  const scopedEntries = request.platform || request.contactId
    ? await readChunkedTranslationCacheEntriesByHashes(request, sourceHashes)
    : [];
  const scopedMatches = mergeTranslationCacheEntries(scopedEntries);
  const scopedMatchedHashes = new Set(scopedMatches.map((entry) => entry.sourceHash));
  const missingHashes = sourceHashes.filter((hash) => !scopedMatchedHashes.has(hash));
  const profileEntries = missingHashes.length
    ? await readProfileWideChunkedTranslationCacheEntriesByHashes(request.profileId, missingHashes)
    : [];
  return mergeTranslationCacheEntries([
    ...scopedMatches,
    ...profileEntries
  ]);
}

function translationCacheWriteQueueKey(request: TranslationCacheSetRequest) {
  return chunkedTranslationCacheDir(request);
}

async function saveTranslationCacheEntry(
  request: TranslationCacheSetRequest,
  shouldContinue: () => boolean = () => true,
  options: { bypassNonEnglishContactGuard?: boolean } = {}
): Promise<boolean> {
  if (
    !request.profileId ||
    profilesBeingRemoved.has(request.profileId) ||
    !request.sourceHash ||
    !request.translatedText ||
    !isEnglishChatSource(request.sourceText) ||
    !shouldContinue()
  ) {
    return false;
  }
  if (
    (!options.bypassNonEnglishContactGuard && await isMarkedNonEnglishContact(request)) ||
    !shouldContinue()
  ) {
    return false;
  }
  const queueKey = translationCacheWriteQueueKey(request);
  const previousWrite = translationCacheWriteQueues.get(queueKey) ?? Promise.resolve(true);
  const nextWrite = previousWrite
    .catch(() => false)
    .then(async () => {
      if (profilesBeingRemoved.has(request.profileId) || !shouldContinue()) return false;
      await saveTranslationCacheEntryNow(request);
      return true;
    });
  translationCacheWriteQueues.set(queueKey, nextWrite);
  try {
    return await nextWrite;
  } finally {
    if (translationCacheWriteQueues.get(queueKey) === nextWrite) {
      translationCacheWriteQueues.delete(queueKey);
    }
  }
}

async function saveTranslationCacheEntryNow(request: TranslationCacheSetRequest): Promise<void> {
  const nextEntry: TranslationCacheEntry = {
    sourceHash: request.sourceHash,
    sourceText: request.sourceText,
    translatedText: request.translatedText,
    platform: request.platform,
    profileId: request.profileId,
    profileName: request.profileName,
    contactId: request.contactId,
    contactIdType: request.contactIdType,
    contactTitle: request.contactTitle,
    contactRemark: request.contactRemark,
    direction: request.direction,
    timestamp: request.timestamp,
    messagePart: request.messagePart,
    updatedAt: Date.now()
  };
  const targetDir = chunkedTranslationCacheDir(request);
  const index = await readTranslationCacheIndex(request);
  let currentChunk = index.chunks[index.chunks.length - 1];
  if (
    !currentChunk ||
    currentChunk.count >= translationCacheChunkRecordLimit ||
    currentChunk.bytes >= translationCacheChunkByteLimit
  ) {
    currentChunk = {
      file: `chunk-${String(index.chunks.length + 1).padStart(6, '0')}.dfc`,
      count: 0,
      bytes: 0,
      minUpdatedAt: nextEntry.updatedAt,
      maxUpdatedAt: nextEntry.updatedAt
    };
    index.chunks.push(currentChunk);
  }
  await mkdir(targetDir, { recursive: true });
  let encryptedLine = `${JSON.stringify(encryptTranslationCacheEntry(targetDir, currentChunk.file, nextEntry))}\n`;
  let lineBytes = Buffer.byteLength(encryptedLine, 'utf8');
  if (currentChunk.count > 0 && currentChunk.bytes + lineBytes > translationCacheChunkByteLimit) {
    currentChunk = {
      file: `chunk-${String(index.chunks.length + 1).padStart(6, '0')}.dfc`,
      count: 0,
      bytes: 0,
      minUpdatedAt: nextEntry.updatedAt,
      maxUpdatedAt: nextEntry.updatedAt
    };
    index.chunks.push(currentChunk);
    encryptedLine = `${JSON.stringify(encryptTranslationCacheEntry(targetDir, currentChunk.file, nextEntry))}\n`;
    lineBytes = Buffer.byteLength(encryptedLine, 'utf8');
  }
  await appendFile(containedPath(targetDir, currentChunk.file), encryptedLine, 'utf8');
  currentChunk.count += 1;
  currentChunk.bytes += lineBytes;
  currentChunk.minUpdatedAt = Math.min(currentChunk.minUpdatedAt, nextEntry.updatedAt);
  currentChunk.maxUpdatedAt = Math.max(currentChunk.maxUpdatedAt, nextEntry.updatedAt);
  await writeTranslationCacheIndex(request, index);
}

async function destroyProfilePartition(partition: string) {
  const storagePath = partitionStoragePath(partition);
  if (!storagePath) throw new Error('Profile partition is invalid.');
  const ses = session.fromPartition(partition);
  const storagePolicyKey = sessionStoragePolicyKey(ses.storagePath);

  const closingContents = webContents.getAllWebContents()
    .filter(contents => !contents.isDestroyed() && contents.session === ses)
    .map(contents => new Promise<void>(resolve => {
      if (contents.isDestroyed()) {
        resolve();
        return;
      }
      contents.once('destroyed', () => resolve());
      contents.close({ waitForBeforeUnload: false });
      if (contents.isDestroyed()) resolve();
    }));

  await Promise.all(closingContents);
  await ses.closeAllConnections();
  ses.flushStorageData();
  // A profile owns this entire persistent Chromium partition. Removing the
  // directory is both faster and more complete than clearing stores one by one.
  await removePathWithRetry(storagePath);

  configuredPartitions.delete(partition);
  partitionPolicies.delete(partition);
  sessionPolicies.delete(ses);
  if (storagePolicyKey) sessionStoragePolicies.delete(storagePolicyKey);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removePathWithRetry(path: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      return;
    } catch (error) {
      lastError = error;
      await wait(250 + attempt * 250);
    }
  }

  throw lastError;
}

async function cleanupOrphanProfilePartitions(config: AppConfig) {
  const partitionsRoot = join(app.getPath('userData'), 'Partitions');
  const activePartitionNames = new Set(
    config.profiles
      .map((profile) => (profile.partition.startsWith('persist:') ? profile.partition.slice('persist:'.length) : null))
      .filter((partitionName): partitionName is string => Boolean(partitionName))
  );

  let partitionDirs: string[];
  try {
    partitionDirs = await readdir(partitionsRoot);
  } catch {
    return;
  }

  await Promise.all(
    partitionDirs
      .filter((partitionName) => /^chat-[0-9a-f-]{36}$/i.test(partitionName) && !activePartitionNames.has(partitionName))
      .map((partitionName) => removePathWithRetry(containedPath(partitionsRoot, partitionName)))
  );
}

async function ensureSignalInstanceDirs(config: AppConfig) {
  await Promise.all(
    config.profiles
      .filter((profile) => profile.platform === 'signal' && profile.signalDataDir)
      .map((profile) => mkdir(profile.signalDataDir as string, { recursive: true }))
  );
}

async function ensureSignalProfileBindings(
  config: AppConfig,
  runtimeBinding: RuntimeBindingPayload,
  devicePrivateKeyPem: string
) {
  await Promise.all(
    config.profiles
      .filter((profile) => profile.platform === 'signal' && profile.signalDataDir)
      .map((profile) => ensureSignalInstanceBinding(
        profile.signalDataDir as string,
        profile.id,
        runtimeBinding,
        devicePrivateKeyPem
      ))
  );
}

async function cleanupOrphanSignalInstances(config: AppConfig) {
  const activeSignalDirs = new Set(
    config.profiles
      .filter((profile) => profile.platform === 'signal' && profile.signalDataDir)
      .map((profile) => profile.signalDataDir)
  );

  let signalDirs: string[];
  try {
    signalDirs = await readdir(signalInstancesRoot());
  } catch {
    return;
  }

  await Promise.all(
    signalDirs
      .filter((dirName) => /^Signal-[0-9a-f-]{36}(?:\.broken-.+)?$/i.test(dirName))
      .map((dirName) => containedPath(signalInstancesRoot(), dirName))
      .filter((dirPath) => !activeSignalDirs.has(dirPath))
      .map(async (dirPath) => {
        await killSignalProcessesByDataDir(dirPath);
        await removePathWithRetry(dirPath);
      })
  );
}

function canonicalSendText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC').trim();
}

function registerApprovedComposerTranslation(request: TranslateRequest, requestId: string, translatedText: string) {
  if (!request.profileId || !request.platform) return;
  const isComposerReview = request.reason === 'composer-review';
  const isWebComposerEnter = request.reason === 'composer-enter' && (
    request.platform === 'whatsapp' ||
    request.platform === 'telegram-a' ||
    request.platform === 'telegram-k' || request.platform === 'opensms'
  );
  const isSignalChineseToEnglish = request.platform === 'signal' &&
    (request.reason === 'composer-enter' || request.reason === 'composer-pretranslate') &&
    request.from === 'Chinese' &&
    request.to === 'English';
  if (!isComposerReview && !isWebComposerEnter && !isSignalChineseToEnglish) return;
  const approvedText = isWebComposerEnter || isSignalChineseToEnglish
    ? translatedText
    : request.text;
  if (!canonicalSendText(approvedText)) return;
  const now = Date.now();
  for (const [key, entry] of approvedComposerTranslations) {
    if (entry.expiresAt <= now) approvedComposerTranslations.delete(key);
  }
  approvedComposerTranslations.set(requestId, {
    profileId: request.profileId,
    platform: request.platform,
    conversationSignature: canonicalSendText(request.contactId || ''),
    textHash: createHash('sha256').update(canonicalSendText(approvedText)).digest('hex'),
    expiresAt: now + approvedComposerTranslationTtlMs
  });
}

function authorizeTranslatedSend(request: SendAuthorizationRequest) {
  const approval = approvedComposerTranslations.get(request.requestId);
  if (!approval) return { ok: false, reason: '翻译发送凭证不存在或已使用', reasonCode: 'approval-missing' };
  if (approval.expiresAt < Date.now()) {
    approvedComposerTranslations.delete(request.requestId);
    return { ok: false, reason: '翻译发送凭证已过期，请重新翻译', reasonCode: 'approval-expired' };
  }
  const textHash = createHash('sha256').update(canonicalSendText(request.text)).digest('hex');
  if (
    approval.profileId !== request.profileId ||
    approval.platform !== request.platform ||
    approval.conversationSignature !== canonicalSendText(request.conversationSignature || '') ||
    approval.textHash !== textHash
  ) return { ok: false, reason: '发送内容、联系人或多开与翻译结果不一致，已阻止发送', reasonCode:
    approval.profileId !== request.profileId ? 'profile-mismatch' : approval.platform !== request.platform ? 'platform-mismatch' :
    approval.conversationSignature !== canonicalSendText(request.conversationSignature || '') ? 'conversation-mismatch' : 'text-mismatch' };
  approvedComposerTranslations.delete(request.requestId);
  return { ok: true };
}

async function assertSensitiveSendProfile(request: SensitiveSendRequest) {
  const profile = (await readConfig()).profiles.find((item) => item.id === request.profileId);
  if (!profile || profile.platform !== request.platform) throw new Error('当前多开与发送平台不一致');
  if (!request.conversationSignature.trim()) throw new Error('未识别当前联系人，已阻止发送');
  return profile;
}

const sensitiveDialogResponses = new Map<string, { buttonCount: number; finish: (response: number) => void }>();

function showSensitiveSendDialog(options: { title: string; message: string; detail?: string; buttons: string[]; cancelId?: number }) {
  const owner = mainWindow;
  const cancelId = options.cancelId ?? options.buttons.length - 1;
  if (!owner || owner.isDestroyed()) return Promise.resolve({ response: cancelId });
  return new Promise<{ response: number }>(resolve => {
    const id = randomUUID();
    const finish = (response: number) => {
      if (!sensitiveDialogResponses.delete(id)) return;
      clearTimeout(timer);
      owner.removeListener('closed', cancel);
      owner.webContents.removeListener('did-start-navigation', cancel);
      if (!owner.isDestroyed()) owner.webContents.send('send-integrity:dialog-closed', id);
      resolve({ response });
    };
    const cancel = () => finish(cancelId);
    const timer = setTimeout(cancel, 120_000);
    sensitiveDialogResponses.set(id, { buttonCount: options.buttons.length, finish });
    owner.once('closed', cancel);
    owner.webContents.once('did-start-navigation', cancel);
    owner.webContents.send('send-integrity:dialog', { id, title: options.title, message: options.message, detail: options.detail || '', buttons: options.buttons, cancelId });
  });
}

async function prepareSensitiveSend(request: SensitiveSendPrepareRequest) {
  if (isBlockedPhoneNumberText(request.text)) {
    const options = { type: 'warning' as const, title: '禁止发送', message: blockedPhoneNumberMessage, buttons: ['确定'], noLink: true };
    const signalProfileToRestore = request.platform === 'signal' ? visibleSignalProfileId : null;
    if (signalProfileToRestore) hideAllSignalWindows();
    try {
      await showSensitiveSendDialog(options);
    } finally {
      if (signalProfileToRestore) requestSignalProfilePresentation(signalProfileToRestore);
    }
    return { ok: false, reason: blockedPhoneNumberMessage };
  }
  const inspection = inspectSensitiveSendText(request.text);
  if (!inspection.candidate || !inspection.valid || !inspection.kind) {
    const reason = inspection.reason || '该内容不是可确认的收款账号或 USDT 地址';
    const options = {
      type: 'warning' as const,
      title: '无法发送',
      message: inspection.kind === 'numeric-account' ? '收款账号无效，已阻止发送' : '地址无效或暂不支持，已阻止发送',
      detail: `${reason}\n\n请核对完整地址及所属网络。当前支持 TRC20、ERC20、BEP20 和 Solana 地址格式。`,
      buttons: ['确定'],
      noLink: true
    };
    const signalProfileToRestore = request.platform === 'signal' ? visibleSignalProfileId : null;
    if (signalProfileToRestore) hideAllSignalWindows();
    try {
      await showSensitiveSendDialog(options);
    } finally {
      if (signalProfileToRestore) requestSignalProfilePresentation(signalProfileToRestore);
    }
    return { ok: false, reason };
  }
  const profile = await assertSensitiveSendProfile(request);
  let network: WalletNetwork | undefined;
  const networkChoices = inspection.networks || [];
  const contact = request.conversationSignature.split('::')[0].split('|')[0].trim().slice(0, 120) || '未命名联系人';
  const platformName = platformDefaults[request.platform].label;
  const confirmationMessage = [
    `平台及多开：${platformName} · ${profile.name}`,
    `联系人：${contact}`,
    inspection.kind === 'numeric-account' ? '类型：单一数字收款账号' : '类型：USDT 钱包地址',
    `完整内容：${request.text}`,
    inspection.kind === 'usdt-wallet' && networkChoices.length === 1 ? `网络：${networkChoices[0]}` : '',
    '确认后不会立即发送，请返回聊天窗口再次按回车。'
  ].filter(Boolean).join('\n\n');
  const buttons = inspection.kind === 'usdt-wallet' && networkChoices.length > 1
    ? [...networkChoices, '取消']
    : ['锁定，等待第二次回车', '取消'];
  const cancelId = buttons.length - 1;
  const signalProfileToRestore = request.platform === 'signal' ? visibleSignalProfileId : null;
  if (signalProfileToRestore) hideAllSignalWindows();
  let response: number;
  try {
    const options = {
      type: 'warning' as const,
      title: '发送前可信确认',
      message: inspection.kind === 'numeric-account' ? '确认收款账号' : '确认 USDT 地址与网络',
      detail: confirmationMessage,
      buttons,
      defaultId: 0,
      cancelId,
      noLink: true
    };
    response = (await showSensitiveSendDialog(options)).response;
  } finally {
    if (signalProfileToRestore) requestSignalProfilePresentation(signalProfileToRestore);
  }
  if (response === cancelId) return { ok: false, reason: '已取消敏感信息发送确认' };
  if (inspection.kind === 'usdt-wallet') network = networkChoices.length > 1
    ? networkChoices[response]
    : networkChoices[0];
  if (inspection.kind === 'usdt-wallet' && !isAllowedWalletNetwork(inspection, network)) {
    return { ok: false, reason: '钱包网络未确认或与地址格式不一致' };
  }

  const { token, expiresAt } = sensitiveSendAuthorizations.issue(request, inspection.kind, network);
  return { ok: true, token, kind: inspection.kind, network, expiresAt };
}

async function authorizeSensitiveSend(request: SensitiveSendAuthorizeRequest) {
  if (isBlockedPhoneNumberText(request.text)) return { ok: false, reason: blockedPhoneNumberMessage };
  await assertSensitiveSendProfile(request);
  return sensitiveSendAuthorizations.authorize(request);
}

function deepSeekTransportDiagnostic(error: unknown) {
  const outer = error instanceof Error ? error : null;
  const cause = outer && typeof (outer as Error & { cause?: unknown }).cause === 'object'
    ? (outer as Error & { cause?: Record<string, unknown> }).cause
    : undefined;
  const safeValue = (value: unknown, limit = 96) => typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, limit)
    : typeof value === 'number'
      ? String(value)
      : '';
  return {
    errorName: safeValue(outer?.name || ''),
    causeName: safeValue(cause?.name),
    causeCode: safeValue(cause?.code),
    causeErrno: safeValue(cause?.errno),
    causeSyscall: safeValue(cause?.syscall)
  };
}

function isTransientDeepSeekTransportError(error: unknown) {
  const outer = error instanceof Error ? error : null;
  if (!outer || /abort|cancel/i.test(`${outer.name} ${outer.message}`)) return false;
  const diagnostic = deepSeekTransportDiagnostic(error);
  if (outer.name === 'TypeError' && /fetch failed/i.test(outer.message)) return true;
  return /^(?:EAI_AGAIN|ENOTFOUND|ENETDOWN|ENETUNREACH|ECONNABORTED|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET)$/i.test(
    diagnostic.causeCode
  );
}

async function translateWithDeepSeek(
  request: TranslateRequest,
  abortSignal?: AbortSignal,
  logPolicy: 'standard' | 'content-free' = 'standard'
): Promise<string> {
  if (translationDiagnosticsEnabled) {
    return monitorTranslation(request, abortSignal, logPolicy);
  }
  return translateWithDeepSeekCore(request, abortSignal, logPolicy);
}

async function monitorTranslation(request: TranslateRequest, abortSignal?: AbortSignal, logPolicy: 'standard' | 'content-free' = 'standard') {
  const requestId = request.requestId || randomUUID();
  const startedAt = Date.now();
  const config = await readConfig();
  const details = { requestId, platform: request.platform || '', reason: request.reason || '', profileId: request.profileId || '', textLength: request.text?.length || 0, model: config.deepseekModel || defaultModel };
  diagnosticInFlight.set(requestId, { startedAt, platform: details.platform, reason: details.reason });
  recordTranslationDiagnostic('request:start', details);
  try {
    const result = await translateWithDeepSeekCore({ ...request, requestId }, abortSignal, logPolicy);
    recordTranslationDiagnostic(result ? 'request:success' : 'request:empty', { ...details, elapsedMs: Date.now() - startedAt, translatedLength: result.length });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const errorCode = /not configured/.test(message) ? 'missing-key'
      : /提示词文件与当前套装不匹配|提示词.*(?:签名|密钥)|Missing encrypted .*prompt|缺少加密提示词/.test(message) ? 'prompt-bundle-invalid'
      : /SensitiveTranslationToken|protected|placeholder/i.test(`${(error as Error)?.name} ${message}`) ? 'sensitive-token'
      : /expanded|layout|prompt|Chinese result/i.test(message) ? 'result-validation'
      : /abort|cancel|timeout/i.test(message) ? 'cancelled-or-timeout' : 'request-failed';
    recordTranslationDiagnostic('request:failed', { ...details, elapsedMs: Date.now() - startedAt, errorCode, httpStatus: Number(/failed: (\d{3})/.exec(message)?.[1] || 0), aborted: Boolean(abortSignal?.aborted), ...deepSeekTransportDiagnostic(error) });
    throw error;
  } finally { diagnosticInFlight.delete(requestId); }
}

async function translateWithDeepSeekCore(
  request: TranslateRequest,
  abortSignal?: AbortSignal,
  logPolicy: 'standard' | 'content-free' = 'standard'
): Promise<string> {
  if (request.profileId && profilesBeingRemoved.has(request.profileId)) throw new Error('该多开正在清理，已停止翻译');
  if (abortSignal?.aborted) throw new Error('Translation request was cancelled.');
  const config = await readConfig();
  const deepseekApiKey = clientLicenseManager?.getServiceSecret() || await readDevelopmentServiceSecret();
  if (abortSignal?.aborted) throw new Error('Translation request was cancelled.');
  if (!deepseekApiKey) {
    throw new Error('DeepSeek API key is not configured.');
  }

  const requestId = request.requestId || randomUUID();
  const userId = (request.userId || (request.profileId ? `df-${request.profileId}` : 'df-default'))
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
    .slice(0, 512);
  const logBase = logPolicy === 'content-free'
    ? {
        from: request.from || '',
        to: request.to,
        reason: request.reason || '',
        platform: request.platform || '',
        direction: request.direction || '',
        messagePart: request.messagePart || ''
      }
    : {
        requestId,
        userId,
        from: request.from || '',
        to: request.to,
        textHash: hashForLog(request.text || ''),
        sourceHash: request.sourceHash || hashForLog(request.text || ''),
        textLength: request.text?.length ?? 0,
        reason: request.reason || '',
        profileId: request.profileId || '',
        profileName: request.profileName || '',
        platform: request.platform || '',
        messageKey: request.messageKey || '',
        contactId: request.contactId || '',
        contactIdType: request.contactIdType || '',
        contactTitle: request.contactTitle || '',
        direction: request.direction || '',
        messagePart: request.messagePart || '',
        ...(runtimeLoggingEnabled ? { sourceText: request.text || '' } : {})
      };
  const isComposerEnglishRequest = ['composer-enter', 'composer-pretranslate'].includes(request.reason || '') && /English/i.test(request.to || '');
  const isEnglishToChineseRequest = /Chinese|zh|Simplified/i.test(request.to || '');
  const sensitiveTokenProtection = protectTranslationSensitiveTokens(
    request.text || '',
    randomBytes(12).toString('hex'),
    {
      // Ordinary hyphenated English words must remain translatable during
      // English-to-Chinese requests. URLs and payment identifiers stay protected.
      protectHyphenatedLiterals: !isEnglishToChineseRequest
    }
  );
  const translationPrompts = await loadTranslationPrompts();
  const customChineseToEnglishPrompt = isComposerEnglishRequest
    ? await loadCustomChineseToEnglishPrompt()
    : null;

  const translateOnce = async (retry: boolean) => {
    if (abortSignal?.aborted) throw new Error('Translation request was cancelled.');
    const configuredSystemPrompt = isComposerEnglishRequest
      ? customChineseToEnglishPrompt
        ? composeChineseToEnglishPrompt(customChineseToEnglishPrompt)
        : translationPrompts.chineseToEnglish
      : translationPrompts.englishToChinese;
    const systemPrompt = `${configuredSystemPrompt}\n\n${translationSourceDataProtocol}`;

    let response: Response;
    const diagnosticAttemptStart = Date.now();
    // HTTP 200 may precede inference completion. Bound both headers and body
    // without changing the caller signal used by visible-message deduplication.
    const deadline = AbortSignal.timeout(45_000);
    const requestSignal = abortSignal ? AbortSignal.any([abortSignal, deadline]) : deadline;
    try {
      response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: requestSignal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: config.deepseekModel || defaultModel,
          user_id: userId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildTranslationSourceDataEnvelope(sensitiveTokenProtection.text) }
          ],
          thinking: { type: 'disabled' },
          temperature: retry ? (isComposerEnglishRequest ? 0.05 : 0.1) : 0.2
        })
      });
    } catch (error) {
      await appendTranslateRequestLog({
        ...logBase,
        status: 'transport-failed',
        retry,
        ...deepSeekTransportDiagnostic(error)
      });
      throw error;
    }

    recordTranslationDiagnostic('api:headers', { requestId, httpStatus: response.status, elapsedMs: Date.now() - diagnosticAttemptStart });
    if (!response.ok) {
      if (translationDiagnosticsEnabled) {
        const errorBody = await response.json().catch(() => null);
        recordTranslationDiagnostic('api:http-error', { requestId, httpStatus: response.status, errorCode: String(errorBody?.error?.code || ''), errorType: String(errorBody?.error?.type || '') });
      }
      await appendTranslateRequestLog({ ...logBase, status: 'failed', httpStatus: response.status, retry });
      throw new Error(`DeepSeek request failed: ${response.status}`);
    }

    const data = await response.json();
    recordTranslationDiagnostic('api:body', { requestId, elapsedMs: Date.now() - diagnosticAttemptStart, finishReason: String(data.choices?.[0]?.finish_reason || ''), model: String(data.model || ''), translatedLength: String(data.choices?.[0]?.message?.content || '').length });
    const rawTranslation = data.choices?.[0]?.message?.content?.trim() || '';
    if (!rawTranslation) {
      const error = new Error('DeepSeek returned an empty translation.');
      error.name = 'EmptyTranslationResultError';
      throw error;
    }
    const styledTranslation = isComposerEnglishRequest
      ? normalizeComposerEnglishStyle(rawTranslation)
      : rawTranslation;
    const restored = restoreTranslationSensitiveTokens(styledTranslation, sensitiveTokenProtection);
    if (!restored.ok) {
      const error = new Error(restored.reason);
      error.name = 'SensitiveTranslationTokenIntegrityError';
      throw error;
    }
    if (runtimeLoggingEnabled && logPolicy === 'standard') {
      await appendTranslateRequestLog({
        ...logBase,
        status: 'model-response',
        retry,
        rawTranslation,
        restoredTranslation: restored.text
      });
    }
    return restored.text;
  };

  const translationPromptLeakPattern = /(?:translate the following chat message|return only the translated message|keep\s+emojis?,?\s*urls|请将以下英文聊天信息翻译成中文|(?:保留|保持)\s*表情符号|你是一名(?:中译英|英译中)聊天翻译助手|只输出(?:英文|中文)译文|普通英文单词和短语必须翻译|保持原有换行和空行结构|敏感信息占位符必须原样保留|仅返回翻译后的信息|无需解释)/i;
  const stripTranslationPromptLeak = (value: string) => {
    const text = (value || '').trim();
    if (!text || !translationPromptLeakPattern.test(text)) return text;
    const lines = text
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !translationPromptLeakPattern.test(line));
    return lines.join('\n').trim();
  };
  const sanitizeChineseTranslation = (value: string) => {
    const stripped = stripTranslationPromptLeak(value)
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim();
    if (translationPromptLeakPattern.test(stripped)) {
      throw new Error('Translation prompt leaked into Chinese result.');
    }
    return stripped;
  };
  const composerLayoutMatches = (source: string, translated: string) => {
    const sourceLines = source.replace(/\r\n?/g, '\n').split('\n');
    const translatedLines = translated.replace(/\r\n?/g, '\n').split('\n');
    if (sourceLines.length === 1) return true;
    if (sourceLines.length !== translatedLines.length) return false;
    return sourceLines.every((line, index) => Boolean(line.trim()) === Boolean(translatedLines[index]?.trim()));
  };
  const transportRetryDelaysMs = [200, 600] as const;
  let consumedTransportRetries = 0;
  const translateWithTransportRetries = async (semanticRetry: boolean) => {
    let transportAttempt = 0;
    while (true) {
      try {
        return await translateOnce(semanticRetry || transportAttempt > 0);
      } catch (error) {
        if (
          !isTransientDeepSeekTransportError(error) ||
          consumedTransportRetries >= transportRetryDelaysMs.length
        ) {
          throw error;
        }
        const retryDelayMs = transportRetryDelaysMs[consumedTransportRetries];
        consumedTransportRetries += 1;
        transportAttempt += 1;
        await appendTranslateRequestLog({
          ...logBase,
          status: 'retry-transport',
          retryAttempt: consumedTransportRetries,
          retryDelayMs,
          ...deepSeekTransportDiagnostic(error)
        });
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        if (abortSignal?.aborted) throw new Error('Translation request was cancelled.');
      }
    }
  };
  const runDeepSeekTranslation = async () => {
    await appendTranslateRequestLog({ ...logBase, status: 'start' });
    let translated: string;
    try {
      translated = await translateWithTransportRetries(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'SensitiveTranslationTokenIntegrityError') {
        await appendTranslateRequestLog({ ...logBase, status: 'retry-sensitive-token-integrity' });
        translated = await translateWithTransportRetries(true);
      } else {
        throw error;
      }
    }
    const wantsChinese = isEnglishToChineseRequest;
    const sourceHasLatin = /[A-Za-z]{2,}/.test(request.text || '');
    if (wantsChinese) translated = sanitizeChineseTranslation(translated);
    const translatedHasChinese = /[\u4e00-\u9fff]/.test(translated);
    if (wantsChinese && sourceHasLatin && translated && !translatedHasChinese) {
      await appendTranslateRequestLog({ ...logBase, status: 'retry-chinese', translatedLength: translated.length });
      translated = sanitizeChineseTranslation(await translateWithTransportRetries(true));
    }
    if (isComposerEnglishRequest) {
      translated = sanitizeComposerEnglishTranslation(translated);
      if (isSuspiciousComposerEnglish(request.text || '', translated) || !composerLayoutMatches(request.text || '', translated)) {
        await appendTranslateRequestLog({ ...logBase, status: 'retry-composer-faithful', translatedLength: translated.length });
        translated = sanitizeComposerEnglishTranslation(await translateWithTransportRetries(true));
      }
      if (isSuspiciousComposerEnglish(request.text || '', translated)) throw new Error('Composer translation expanded beyond the source.');
      translated = restoreComposerEnglishLayout(request.text || '', translated);
      if (!composerLayoutMatches(request.text || '', translated)) throw new Error('Composer translation did not preserve source line layout.');
    }
    await appendTranslateRequestLog({ ...logBase, status: 'success', translatedLength: translated.length });
    registerApprovedComposerTranslation(request, requestId, translated);
    return translated;
  };

  const dedupeKey = request.reason === 'visible-message' && request.profileId && request.sourceHash
    ? JSON.stringify([
        request.profileId,
        request.to,
        request.sourceHash,
        createHash('sha256').update(request.text || '', 'utf8').digest('base64url')
      ])
    : '';
  if (!dedupeKey || abortSignal) return runDeepSeekTranslation();

  const existing = visibleMessageDeepSeekDedupe.get(dedupeKey);
  if (existing) {
    await appendTranslateRequestLog({ ...logBase, status: 'dedupe-wait' });
    const translated = await existing;
    await appendTranslateRequestLog({ ...logBase, status: 'dedupe-success', translatedLength: translated.length });
    return translated;
  }

  const promise = runDeepSeekTranslation();
  visibleMessageDeepSeekDedupe.set(dedupeKey, promise);
  try {
    return await promise;
  } catch (error) {
    throw error;
  } finally {
    if (visibleMessageDeepSeekDedupe.get(dedupeKey) === promise) {
      visibleMessageDeepSeekDedupe.delete(dedupeKey);
    }
  }
}

let gptHandoffBusy = false;
async function showGptHandoffDialog(options: Parameters<typeof showSensitiveSendDialog>[0]) {
  const signalProfileToRestore = visibleSignalProfileId;
  if (signalProfileToRestore) hideAllSignalWindows();
  try {
    return await showSensitiveSendDialog(options);
  } finally {
    if (signalProfileToRestore) requestSignalProfilePresentation(signalProfileToRestore);
  }
}
async function copyChatToGpt(request: SmartReplyRequest) {
  if (workspaceVisibilityGate.locked) throw new Error('请先解锁工作区');
  if (gptHandoffBusy) throw new Error('请先关闭当前去GPT提示后再复制');
  gptHandoffBusy = true;
  try {
    return await handoffChatToGpt(request, {
      writeClipboard: text => clipboard.writeText(text),
      showPrompt: async messageCount => {
        const options = {
          title: '去GPT',
          message: '已复制 ' + messageCount + ' 条聊天记录',
          detail: '点击“打开GPT”，在 ChatGPT 中粘贴并发送，即可让 GPT 为我方生成三组英文回复及中文释义。',
          buttons: ['打开GPT', '稍后粘贴'],
          cancelId: 1
        };
        const result = await showGptHandoffDialog(options);
        return result.response === 0;
      },
      openExternal: async url => {
        if (workspaceVisibilityGate.locked) return;
        try {
          await shell.openExternal(url);
        } catch {
          await showGptHandoffDialog({
            title: '打开GPT', message: '聊天记录已复制，但浏览器打开失败',
            detail: '请手动打开 https://chatgpt.com/，然后粘贴并发送。', buttons: ['知道了'], cancelId: 0
          });
        }
      }
    });
  } finally {
    gptHandoffBusy = false;
  }
}

function toggleMainWindowSize(targetWindow: BrowserWindow) {
  if (!targetWindow.isMaximized()) {
    targetWindow.maximize();
    return;
  }

  const display = screen.getDisplayMatching(targetWindow.getBounds());
  const width = Math.min(compactWindowWidth, display.workArea.width);
  const height = Math.min(compactWindowHeight, display.workArea.height);
  const compactBounds = {
    x: display.workArea.x + Math.floor((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.floor((display.workArea.height - height) / 2),
    width,
    height
  };
  targetWindow.once('unmaximize', () => {
    if (!targetWindow.isDestroyed() && !targetWindow.isMaximized()) targetWindow.setBounds(compactBounds);
  });
  targetWindow.unmaximize();
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent | IpcMainEvent) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedMainUrl(event.senderFrame.url)
  ) {
    throw new Error('Blocked IPC call from an untrusted renderer.');
  }
}

function trustedHandle<TArgs extends unknown[], TResult>(
  channel: string,
  runtimeRequired: boolean,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>
) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    if (runtimeRequired) assertClientRuntimeAllowed();
    return handler(event, ...(args as TArgs));
  });
}

function assertText(value: unknown, label: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertSerializedSize(value: unknown, label: string, maxBytes: number) {
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} is not serializable.`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error(`${label} is too large.`);
}

function validatePlatform(value: unknown): Platform {
  if (typeof value !== 'string' || !supportedPlatforms.has(value as Platform)) throw new Error('Platform is invalid.');
  return value as Platform;
}

function validateWorkspaceBounds(value: SignalWorkspaceBounds) {
  if (!value || typeof value !== 'object') throw new Error('Signal workspace bounds are invalid.');
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (!Number.isFinite(value[field])) throw new Error('Signal workspace bounds are invalid.');
  }
  if (value.width < 1 || value.height < 1 || value.width > 16384 || value.height > 16384 || typeof value.visible !== 'boolean') {
    throw new Error('Signal workspace bounds are invalid.');
  }
  return value;
}

function validateTranslateRequest(value: TranslateRequest) {
  if (!value || typeof value !== 'object') throw new Error('Translation request is invalid.');
  assertText(value.text, 'Translation text', 20_000);
  assertText(value.to, 'Translation target', 80);
  if (value.profileId) assertProfileId(value.profileId);
  if (value.platform) validatePlatform(value.platform);
  for (const field of ['requestId', 'userId', 'from', 'reason', 'profileName', 'sourceHash', 'messageKey', 'contactId', 'contactTitle'] as const) {
    if (value[field] !== undefined) assertText(value[field], `Translation ${field}`, 512, true);
  }
  assertSerializedSize(value, 'Translation request', 64 * 1024);
  return value;
}

function validateCacheRequest(value: TranslationCacheLoadRequest | TranslationCacheSetRequest | TranslationCacheLookupRequest) {
  if (!value || typeof value !== 'object') throw new Error('Translation cache request is invalid.');
  assertProfileId(value.profileId);
  if (profilesBeingRemoved.has(value.profileId)) throw new Error('该多开正在清理，暂不能读写记录');
  if (value.platform) validatePlatform(value.platform);
  for (const field of ['profileName', 'contactId', 'contactTitle', 'contactRemark'] as const) {
    if (value[field] !== undefined) assertText(value[field], `Cache ${field}`, 512, true);
  }
  assertSerializedSize(value, 'Translation cache request', 128 * 1024);
  return value;
}

async function hydrateConversationExportChineseCache(request: ConversationExportRequest) {
  const missing = request.rows.filter(row => !row.chineseText && row.originalText);
  const rawId = request.contactId.replace(/^(?:wa:|telegram:|signal:)/, '');
  const scopes: Array<{contactId:string;contactIdType:'platform'|'title'}> = [
    {contactId:request.contactId,contactIdType:'platform'},
    {contactId:rawId,contactIdType:'platform'}
  ];
  if(request.contactTitle && request.contactTitle !== '当前联系人') {
    scopes.push({contactId:hashForLog(request.contactTitle),contactIdType:'title'});
  }
  const normalize = (text:string) => text.replace(/\s+/g,' ').trim();
  for(let offset=0;offset<missing.length;offset+=200) {
    const batch=missing.slice(offset,offset+200);
    for(const scope of scopes) {
      const unresolved=batch.filter(row=>!row.chineseText);
      if(!unresolved.length)break;
      // Read each actual storage scope before the profile-wide hash fallback.
      // Otherwise a newer identical sentence in another chat can mask this
      // contact's older translation before the identity filter is applied.
      const entries=await lookupTranslationCache({profileId:request.profileId,platform:request.platform,
        ...scope,sourceHashes:unresolved.map(row=>hashForLog(row.originalText))});
      for(const row of unresolved) {
        const matches=entries.filter(entry=>entry.sourceText&&entry.translatedText&&
          normalize(entry.sourceText)===normalize(row.originalText)&&entry.messagePart!=='quote'&&entry.platform===request.platform&&
          (entry.contactId===request.contactId||entry.contactId===rawId||
            (entry.contactIdType!=='platform'&&entry.contactTitle===request.contactTitle))&&
          (!entry.direction||entry.direction==='unknown'||row.direction==='unknown'||entry.direction===row.direction));
        if(matches.length)row.chineseText=matches.sort((a,b)=>b.updatedAt-a.updatedAt)[0].translatedText;
      }
    }
  }
}

function openSmsLoginScope(event: IpcMainEvent) {
  if (event.sender.isDestroyed() || event.sender.getType() !== 'webview' || event.senderFrame !== event.sender.mainFrame) return null;
  if (sessionPolicies.get(event.sender.session) !== 'opensms' || !isAllowedPlatformUrl('opensms', event.senderFrame.url)) return null;
  const entry = Array.from(partitionPolicies).find(([partition, platform]) => platform === 'opensms' && session.fromPartition(partition) === event.sender.session);
  const profileId = entry?.[0].match(/^persist:chat-([0-9a-f-]{36})$/i)?.[1];
  return profileId ? { profileId, origin: new URL(event.senderFrame.url).origin } : null;
}
function registerIpc() {
  installOpenSmsLoginPersistence(openSmsLoginScope);
  const assertAssistantUnlocked = () => {
    if (workspaceVisibilityGate.locked) throw new Error('请先解锁工作区');
  };
  trustedHandle('assistant:get', true, () => { assertAssistantUnlocked(); return readAssistantLibrary(); });
  trustedHandle('conversation:export', true, async (_event,request:ConversationExportRequest) => {
    assertAssistantUnlocked();assertSerializedSize(request,'Conversation export',32*1024*1024);assertProfileId(request.profileId);
    const profile=(await readProfileBackup()).find(p=>p.id===request.profileId);
    if(!profile||profile.platform!==request.platform)throw new Error('导出账号或平台不匹配');
    if(!request.contactId||request.contactId.length>256)throw new Error('导出联系人无效');
    if(!Array.isArray(request.rows)||request.rows.length>20000)throw new Error('导出记录无效');
    request.rows.forEach(row=>{assertText(row.originalText,'Export original text',32000,true);assertText(row.chineseText,'Export Chinese text',32000,true);});
    if(request.mode==='chinese'){
      await hydrateConversationExportChineseCache(request);
    }
    assertAssistantUnlocked();return exportConversationFile(request);
  });
  trustedHandle('assistant:stage', true, (_event, value: AssistantMaterial) => {
    assertAssistantUnlocked(); assertSerializedSize(value, 'Assistant material', 100 * 1024); return stageAssistantMaterial(value);
  });
  trustedHandle('assistant:pending', true, () => { assertAssistantUnlocked(); return currentAssistantMaterial(); });
  trustedHandle('assistant:image', true, (_event,id:string) => { assertAssistantUnlocked();return readAssistantImage(id); });
  trustedHandle('assistant:usage', true, (_event, profileId: string) => {
    assertAssistantUnlocked(); return readAssistantUsage(assertProfileId(profileId));
  });
  trustedHandle('assistant:use', true, async (_event, value: AssistantUseRequest) => {
    assertAssistantUnlocked(); assertSerializedSize(value, 'Assistant use', 100 * 1024); assertProfileId(value.profileId);
    if (profilesBeingRemoved.has(value.profileId)) throw new Error('该多开正在清理，无法记录素材使用');
    const profile=(await readProfileBackup()).find(p=>p.id===value.profileId);
    if (profilesBeingRemoved.has(value.profileId)) throw new Error('该多开正在清理，无法记录素材使用');
    const platform=profile?.platform==='telegram-a'||profile?.platform==='telegram-k'?'telegram':profile?.platform;
    if(!profile||platform!==value.platform)throw new Error('素材使用账号或平台不匹配');
    return recordAssistantUse(value);
  });
  trustedHandle('assistant:save', true, (_event, kind: AssistantKind, value: AssistantModule) => {
    assertAssistantUnlocked(); assertSerializedSize(value, 'Assistant module', 4 * 1024 * 1024);
    return saveAssistantModule(kind, value);
  });
  trustedHandle('assistant:import', true, (_event, kind: AssistantKind, merge: boolean) => {
    assertAssistantUnlocked(); if (typeof merge !== 'boolean') throw new Error('导入模式无效');
    return importAssistantModule(kind, merge);
  });
  trustedHandle('assistant:attach', true, (_event, kind: AssistantKind, entryId: string) => {
    assertAssistantUnlocked(); return attachAssistantMedia(kind, assertText(entryId, 'Entry ID', 80));
  });
  trustedHandle('assistant:reveal', true, (_event, id: string) => { assertAssistantUnlocked(); return revealAssistantMedia(id); });
  trustedHandle('assistant:template', true, (_event, kind: AssistantKind) => { assertAssistantUnlocked(); return exportAssistantTemplate(kind); });
  trustedHandle('assistant:export', true, (_event, kind: AssistantKind) => { assertAssistantUnlocked(); return exportAssistantModule(kind); });
  const translationControllers = new Map<string, AbortController>();
  const translationControllerSenders = new Set<number>();
  const assertDiagnostics = () => {
    if (!translationDiagnosticsEnabled) throw new Error('Development diagnostics are disabled.');
  };
  trustedHandle('diagnostics:status', false, async () => {
    if (!translationDiagnosticsEnabled) return { enabled: false };
    const config = await readConfig();
    return {
      enabled: true, keyConfigured: Boolean(diagnosticServiceSecret), model: config.deepseekModel || defaultModel,
      directory: translationDiagnostics!.directory, sessionId: translationDiagnostics!.sessionId,
      counts: { ...translationDiagnostics!.counts }, dropped: translationDiagnostics!.dropped,
      inFlight: diagnosticInFlight.size,
      oldestMs: Math.max(0, ...Array.from(diagnosticInFlight.values(), item => Date.now() - item.startedAt)),
      signalRunning: signalLiveTranslationRunningCount, signalQueued: signalLiveTranslationQueue.length,
      probe: diagnosticProbe,
      recent: translationDiagnostics!.events.slice(-12)
    };
  });
  trustedHandle('diagnostics:configure', false, async (_event, value: { key?: string; model?: string }) => {
    assertDiagnostics();
    if (!value || typeof value !== 'object') throw new Error('Invalid diagnostic configuration');
    if (value.key) {
      const key = assertText(value.key, 'Service key', 512).trim();
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable');
      await mkdir(initialDiagnosticsRoot(), { recursive: true });
      await writeFile(join(initialDiagnosticsRoot(), 'service-key.dpapi'), safeStorage.encryptString(key));
      diagnosticServiceSecret = key;
    }
    if (value.model) {
      if (!['deepseek-v4-flash', 'deepseek-flash', 'deepseek-v4-pro'].includes(value.model)) throw new Error('Unsupported diagnostic model');
      const config = await readConfig();
      await saveConfig({ ...config, deepseekModel: value.model });
    }
    recordTranslationDiagnostic('session:configured', { keyConfigured: Boolean(diagnosticServiceSecret), model: value.model || '' });
    void runDiagnosticApiProbe();
    return { ok: true };
  });
  trustedHandle('diagnostics:event', false, (_event, event: Record<string, unknown>) => {
    if (!translationDiagnosticsEnabled) return;
    assertSerializedSize(event, 'Diagnostic event', 4096);
    recordTranslationDiagnostic(`web:${String(event.stage || 'event')}`, event);
  });
  trustedHandle('diagnostics:mark', false, () => {
    assertDiagnostics();
    recordTranslationDiagnostic('session:problem-marked');
  });
  trustedHandle('diagnostics:probe', false, async () => { assertDiagnostics(); return runDiagnosticApiProbe(); });
  trustedHandle('diagnostics:export', false, async () => {
    assertDiagnostics();
    await translationDiagnostics!.flush();
    const report = join(translationDiagnostics!.directory, `${translationDiagnostics!.sessionId}-report.json`);
    await writeJsonAtomic(report, { sessionId: translationDiagnostics!.sessionId, counts: translationDiagnostics!.counts, events: translationDiagnostics!.events, dropped: translationDiagnostics!.dropped });
    await shell.openPath(translationDiagnostics!.directory);
    return report;
  });
  trustedHandle('client-license:status', false, () => clientLicenseManager?.getStatus());
  trustedHandle('storage:get-location', true, () => ({
    dataPath: app.getPath('userData'),
    changeAllowed: !userDataOverride
  }));
  trustedHandle('storage:open-location', true, () => openCurrentStorageLocation());
  trustedHandle('storage:change-location', true, () => beginStorageLocationChange());
  trustedHandle('client-license:set-username', false, (_event, username: string) =>
    clientLicenseManager?.setUsername(assertText(username, 'Username', 64))
  );
  trustedHandle('client-license:activate', false, async (_event, licenseCode: string) => {
    if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
    const result = await clientLicenseManager.activate(assertText(licenseCode, 'License code', 32 * 1024));
    if (result.selfDestructRequired) {
      await beginAuthorizationSelfDestruct();
      return result;
    }
    if (result.ok) await prepareAuthorizedRuntime();
    return result;
  });
  trustedHandle('client-license:replace', true, async (_event, licenseCode: string) => {
    if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
    const preparation = await clientLicenseManager.prepareReplacement(assertText(licenseCode, 'License code', 32 * 1024));
    if (!preparation.result.ok || !preparation.prepared) {
      if (preparation.result.selfDestructRequired) await beginAuthorizationSelfDestruct();
      return preparation.result;
    }
    try {
      await clientLicenseManager.commitReplacement(preparation.prepared);
      return { ok: true, status: clientLicenseManager.getStatus() };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? `重新授权未完成：${error.message}` : '重新授权未完成',
        status: clientLicenseManager.getStatus()
      };
    }
  });
  trustedHandle('client-license:copy-machine-info', false, async () => {
    if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
    try {
      clipboard.writeText(clientLicenseManager.machineInfoText());
      return { ok: true, status: clientLicenseManager.getStatus() };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : '复制本机信息失败',
        status: clientLicenseManager.getStatus()
      };
    }
  });
  trustedHandle('app:is-packaged', false, () => app.isPackaged);
  trustedHandle('config:get', true, () => readConfig());
  trustedHandle('config:save', true, (_event, config: AppConfig) => {
    assertSerializedSize(config, 'Application config', 1024 * 1024);
    return saveConfig(config);
  });
  trustedHandle('config:set-eye-care-translation', true, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid eye-care translation setting');
    const config = await readConfig();
    config.eyeCareTranslationEnabled = enabled;
    return saveConfig(config);
  });
  trustedHandle('platforms:get', true, () => getPlatformCatalog());
  trustedHandle('profile:create', true, (_event, platform: Platform, name: string, group: string) => {
    return createProfile(validatePlatform(platform), assertText(name, 'Profile name', 80), assertText(group, 'Profile group', 80));
  });
  trustedHandle('profile:rename', true, (_event, id: string, name: string, group: string) => {
    return renameProfile(assertProfileId(id), assertText(name, 'Profile name', 80), assertText(group, 'Profile group', 80));
  });
  trustedHandle('profile:remove', true, (_event, id: string) => {
    return removeProfile(assertProfileId(id));
  });
  trustedHandle('signal:launch', true, (_event, id: string) => {
    return launchSignalProfile(assertProfileId(id));
  });
  trustedHandle('signal:source-only-acceptance', true, () => signalSourceOnlyAcceptanceActive);
  trustedHandle('signal:notification-pending', true, () => pendingSignalNotificationActivation());
  trustedHandle(
    'signal:notification-complete',
    true,
    (_event, profileId: unknown, activationId: unknown) =>
      completeSignalNotificationActivation(profileId, activationId)
  );
  trustedHandle('signal:set-workspace-bounds', true, (_event, id: string, bounds: SignalWorkspaceBounds) =>
    setSignalWorkspaceBounds(assertProfileId(id), validateWorkspaceBounds(bounds))
  );
  trustedHandle('signal:present-workspace', true, (_event, id: string, bounds: SignalWorkspaceBounds) =>
    presentSignalWorkspace(assertProfileId(id), validateWorkspaceBounds(bounds))
  );
  trustedHandle('signal:hide', true, (_event, id: string) => hideSignalProfile(assertProfileId(id)));
  trustedHandle('signal:stop', true, (_event, id: string) => stopSignalProfile(assertProfileId(id)));
  trustedHandle('signal:execute-script', true, (_event, id: string, script: string) =>
    executeSignalScript(assertProfileId(id), assertText(script, 'Signal operation script', 900 * 1024))
  );
  trustedHandle('signal:debug-log', true, (_event, debugEvent: Record<string, unknown>) => {
    assertSerializedSize(debugEvent, 'Signal debug event', 64 * 1024);
    return appendSignalTranslationDebugLog(debugEvent);
  });
  trustedHandle('translate', true, async (event, request: TranslateRequest) => {
    const validated = validateTranslateRequest(request);
    if (validated.profileId && profilesBeingRemoved.has(validated.profileId)) throw new Error('该多开正在清理，无法翻译');
    const requestId = validated.requestId || randomUUID();
    const key = `${event.sender.id}:${requestId}`;
    if (translationControllers.has(key)) throw new Error('Translation request is already running.');
    const controller = new AbortController();
    translationControllers.set(key, controller);
    if (!translationControllerSenders.has(event.sender.id)) {
      const senderId = event.sender.id;
      translationControllerSenders.add(senderId);
      event.sender.once('destroyed', () => {
        for (const [requestKey, active] of translationControllers) {
          if (!requestKey.startsWith(`${senderId}:`)) continue;
          active.abort();
          translationControllers.delete(requestKey);
        }
        translationControllerSenders.delete(senderId);
      });
    }
    try {
      return await translateWithDeepSeek({ ...validated, requestId }, AbortSignal.any([
        controller.signal, AbortSignal.timeout(120_000)
      ]));
    } finally {
      translationControllers.delete(key);
    }
  });
  trustedHandle('translate:cancel', true, (event, requestId: string) => {
    assertText(requestId, 'Translation request ID', 512);
    const controller = translationControllers.get(`${event.sender.id}:${requestId}`);
    if (!controller) return false;
    controller.abort();
    return true;
  });
  trustedHandle('translation-customization:get', true, () => getTranslationCustomization());
  trustedHandle('translation-customization:save', true, (_event, editableChineseToEnglish: string) =>
    saveTranslationCustomization(editableChineseToEnglish)
  );
  trustedHandle('translation-customization:reset', true, () => resetTranslationCustomization());
  trustedHandle('smart-reply:copy-to-gpt', true, (_event, request: SmartReplyRequest) =>
    copyChatToGpt(validateSmartReplyRequest(request))
  );
  trustedHandle('send-integrity:authorize', true, (_event, request: SendAuthorizationRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Send authorization request is invalid.');
    assertText(request.requestId, 'Send request ID', 512);
    assertProfileId(request.profileId);
    validatePlatform(request.platform);
    assertText(request.text, 'Send text', 20_000);
    if (request.conversationSignature !== undefined) assertText(request.conversationSignature, 'Conversation signature', 512, true);
    assertSerializedSize(request, 'Send authorization request', 64 * 1024);
    return authorizeTranslatedSend(request);
  });
  trustedHandle('signal:verify-sent-integrity', true, (_event, request: SignalSentIntegrityRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Signal sent-integrity request is invalid.');
    assertProfileId(request.profileId);
    assertText(request.expectedText, 'Signal expected sent text', 20_000);
    if (
      !Number.isSafeInteger(request.notBefore) ||
      request.notBefore < Date.now() - 60_000 ||
      request.notBefore > Date.now() + 1_000
    ) {
      throw new Error('Signal sent-integrity timestamp is invalid.');
    }
    assertSerializedSize(request, 'Signal sent-integrity request', 64 * 1024);
    return verifySignalSentIntegrity(request);
  });
  trustedHandle('send-integrity:dialog-response', true, (_event, id: string, response: number) => {
    const pending = sensitiveDialogResponses.get(assertText(id, 'Dialog identifier', 64));
    if (!pending) return;
    if (!Number.isInteger(response) || response < 0 || response >= pending.buttonCount) throw new Error('Invalid dialog response');
    pending.finish(response);
  });
  trustedHandle('send-integrity:prepare-sensitive', true, (_event, request: SensitiveSendPrepareRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Sensitive send preparation is invalid.');
    assertProfileId(request.profileId);
    validatePlatform(request.platform);
    assertText(request.conversationSignature, 'Conversation signature', 512, true);
    assertText(request.text, 'Sensitive send text', 256);
    if (request.network !== undefined && !['TRC20', 'ERC20', 'BEP20', 'Solana'].includes(request.network)) {
      throw new Error('Wallet network is invalid.');
    }
    assertSerializedSize(request, 'Sensitive send preparation', 8 * 1024);
    return prepareSensitiveSend(request);
  });
  trustedHandle('send-integrity:authorize-sensitive', true, (_event, request: SensitiveSendAuthorizeRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Sensitive send authorization is invalid.');
    assertText(request.token, 'Sensitive send token', 128);
    assertProfileId(request.profileId);
    validatePlatform(request.platform);
    assertText(request.conversationSignature, 'Conversation signature', 512);
    assertText(request.text, 'Sensitive send text', 256);
    if (request.network !== undefined && !['TRC20', 'ERC20', 'BEP20', 'Solana'].includes(request.network)) {
      throw new Error('Wallet network is invalid.');
    }
    assertSerializedSize(request, 'Sensitive send authorization', 8 * 1024);
    return authorizeSensitiveSend(request);
  });
  trustedHandle('translation-cache:load', true, async (_event, request: TranslationCacheLoadRequest) =>
    (await isMarkedNonEnglishContact(validateCacheRequest(request))) ? [] : loadTranslationCache(request)
  );
  trustedHandle('translation-cache:lookup', true, async (_event, request: TranslationCacheLookupRequest) => {
    validateCacheRequest(request);
    if (!Array.isArray(request.sourceHashes) || request.sourceHashes.length > 240) throw new Error('Cache lookup hashes are invalid.');
    request.sourceHashes.forEach((hash) => assertText(hash, 'Cache source hash', 256));
    return (await isMarkedNonEnglishContact(request)) ? [] : lookupTranslationCache(request);
  });
  trustedHandle('translation-cache:save-entry', true, (_event, request: TranslationCacheSetRequest) => {
    validateCacheRequest(request);
    assertText(request.sourceHash, 'Cache source hash', 256);
    assertText(request.translatedText, 'Cache translation', 30_000);
    if (request.sourceText !== undefined) assertText(request.sourceText, 'Cache source text', 30_000, true);
    return saveTranslationCacheEntry(request);
  });
  trustedHandle('translation-cache:mark-non-english-contact', true, (_event, request: NonEnglishContactRequest) => {
    validateCacheRequest(request);
    return markNonEnglishContact(request);
  });
  trustedHandle('system:get-memory-status', false, () => getMemoryStatus());
  trustedHandle('taskbar:set-unread-count', true, (_event, count: unknown) => setTaskbarUnreadCount(count));
  trustedHandle('lock-screen:status', true, () => getLockScreenStatus());
  trustedHandle('lock-screen:engage', true, () => engageWorkspaceVisibilityLock());
  trustedHandle('lock-screen:check-network-offline', true, () => checkNetworkOffline());
  trustedHandle('lock-screen:authorize-pin-change', true, (event, mode: LockScreenPinChangeMode) => {
    if (mode !== 'setup' && mode !== 'reset' && mode !== 'upgrade') {
      throw new Error('锁屏凭据设置模式无效');
    }
    return authorizeLockScreenPinChange(event.sender.id, mode);
  });
  trustedHandle('lock-screen:set-pin', true, (event, pin: string, token: string) =>
    setLockScreenPin(
      event.sender.id,
      assertText(pin, 'Lock credential', 32),
      assertText(token, 'Lock credential authorization', 256)
    )
  );
  trustedHandle('lock-screen:unlock', true, (_event, pin: string) => unlockLockScreen(assertText(pin, 'Lock credential', 32)));
  trustedHandle('remote-guard:status', false, () => remoteGuardStatus);
  trustedHandle('remote-guard:scan-now', false, () => runRemoteGuardScan(true));
  trustedHandle('remote-guard:acknowledge', false, () => acknowledgeRemoteGuardIncident());
  trustedHandle(
    'window:set-theme',
    true,
    async (_event, theme: 'blackGold' | 'pink' | 'murongPurple' | 'clearWaterBlue') => {
      if (
        theme !== 'blackGold' &&
        theme !== 'pink' &&
        theme !== 'murongPurple' &&
        theme !== 'clearWaterBlue'
      ) {
        throw new Error('Theme is invalid.');
      }
      const config = await readConfig();
      if (config.activeTheme === theme) return;
      config.activeTheme = theme;
      await saveConfig(config);
    }
  );
  trustedHandle('clipboard:read-text', true, () => clipboard.readText().slice(0, 1024 * 1024));
  trustedHandle('clipboard:write-text', true, (_event, text: string) => {
    clipboard.writeText(assertText(text, 'Clipboard text', 1024 * 1024, true));
  });
  trustedHandle('window:minimize', false, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow === mainWindow) prepareSignalWindowsForMainMinimize();
    targetWindow?.minimize();
  });
  trustedHandle('window:toggle-maximize', false, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow) toggleMainWindowSize(targetWindow);
  });
  trustedHandle('window:close', false, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on('window-control', (event, action: 'minimize' | 'toggle-maximize' | 'close') => {
    assertTrustedIpcSender(event);
    if (!['minimize', 'toggle-maximize', 'close'].includes(action)) return;
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;

    if (action === 'minimize') {
      if (targetWindow === mainWindow) prepareSignalWindowsForMainMinimize();
      targetWindow.minimize();
      return;
    }

    if (action === 'toggle-maximize') {
      toggleMainWindowSize(targetWindow);
      return;
    }

    if (action === 'close') {
      targetWindow.close();
    }
  });
}

function getPlatformCatalog(): PlatformInfo[] {
  return Object.entries(platformDefaults).map(([platform, info]) => ({
    platform: platform as Platform,
    ...info
  }));
}

function configureSession(profile: ChatProfile) {
  const ses = session.fromPartition(profile.partition);
  ses.setUserAgent(profile.fingerprint.userAgent);
  partitionPolicies.set(profile.partition, profile.platform);
  sessionPolicies.set(ses, profile.platform);
  const storagePolicyKey = sessionStoragePolicyKey(ses.storagePath);
  if (storagePolicyKey) sessionStoragePolicies.set(storagePolicyKey, profile.platform);

  if (configuredPartitions.has(profile.partition)) {
    return;
  }

  configuredPartitions.add(profile.partition);
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const requestingUrl = details.requestingUrl || requestingOrigin;
    if (!isAllowedPlatformPermissionOrigin(profile.platform, requestingUrl)) return false;
    return permission === 'notifications' || permission === 'media';
  });
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || contents.getURL();
    const allowedOrigin = isAllowedPlatformPermissionOrigin(profile.platform, requestingUrl);
    const allowedPermission = permission === 'notifications' || permission === 'media';
    callback(allowedOrigin && allowedPermission);
  });
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (_event, item) => {
    if (/\.(?:exe|msi|msp|com|scr|cmd|bat|ps1|vbs|js|jse|wsf|wsh|dll|lnk|url)$/i.test(item.getFilename())) {
      item.cancel();
    }
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = {
      ...details.requestHeaders,
      'User-Agent': profile.fingerprint.userAgent
    };

    callback({ requestHeaders });
  });
}

async function prepareAuthorizedRuntime() {
  if (authorizedRuntimePrepared) return;
  assertClientRuntimeAllowed();
  if (!clientLicenseManager) throw new Error('客户端授权模块尚未初始化');
  signalSourceOnlyAcceptanceActive = resolveSignalSourceOnlyAcceptance();
  if (signalSourceOnlyAcceptanceActive) {
    await resolveSignalExecutable();
    initializeSignalSourceOnlyAcceptanceDiagnostics();
  }
  const material = clientLicenseManager.getRuntimeSecurityMaterial();
  let binding;
  if (runtimeSuiteUpgradePending) {
    const source = {
      suiteId: runtimeSuiteUpgradePending.suiteId,
      keyId: runtimeSuiteUpgradePending.keyId
    };
    await migrateTranslationCacheSuiteBinding(
      source.suiteId,
      material.suiteId,
      runtimeSuiteUpgradePending.dataRootId
    );
    binding = await upgradeRuntimeBinding(defaultRuntimeBindingPath(), material, source);
    runtimeSuiteUpgradePending = null;
  } else {
    binding = await ensureRuntimeBinding(defaultRuntimeBindingPath(), material);
  }
  activeRuntimeSecurity = {
    payload: binding.payload,
    devicePrivateKeyPem: material.devicePrivateKeyPem
  };
  await initializeTranslationCacheEncryption(binding.payload);
  for (const executablePath of signalExecutableCandidates()) {
    if (!(await pathExists(executablePath))) continue;
    try {
      await mirrorRuntimeBinding(defaultRuntimeBindingPath(), signalRuntimeBindingPath(executablePath));
    } catch {
      // The profile-root binding remains authoritative if an installation directory is read-only.
    }
    break;
  }
  const config = await readConfig();
  await saveConfig(config);
  await ensureSignalInstanceDirs(config);
  await ensureSignalProfileBindings(config, binding.payload, material.devicePrivateKeyPem);
  await cleanupOrphanProfilePartitions(config);
  await cleanupOrphanSignalInstances(config);
  scheduleHideConfiguredSignalTaskbarButtons(config);
  config.profiles.forEach(configureSession);
  authorizedRuntimePrepared = true;
}

async function runDevelopmentCacheSmokeCheck() {
  if (app.isPackaged || process.env.MAOYI_SMOKE_WRITE_CACHE !== '1') return;
  const request: TranslationCacheSetRequest = {
    profileId: '00000000-0000-4000-8000-000000000001',
    platform: 'whatsapp',
    profileName: 'Smoke Profile',
    contactId: 'smoke-contact',
    contactIdType: 'platform',
    sourceHash: 'smoke-source-hash',
    sourceText: 'Security cache smoke source 123456789',
    translatedText: '安全缓存测试译文 123456789'
  };
  await saveTranslationCacheEntry(request);
  const loaded = await lookupTranslationCache({ ...request, sourceHashes: [request.sourceHash] });
  if (loaded[0]?.translatedText !== request.translatedText) throw new Error('Encrypted translation cache smoke round trip failed.');
}

async function createWindow() {
  const initialTheme = await readInitialAppTheme();
  const initialThemeBackground = initialTheme === 'pink'
    ? '#160711'
    : initialTheme === 'murongPurple'
      ? '#171218'
      : initialTheme === 'clearWaterBlue'
        ? '#eaf8ff'
        : '#08090d';
  const applicationIconPath = app.isPackaged
    ? join(process.resourcesPath, packagedApplicationIconFileName)
    : join(__dirname, '../src/assets/pikachu-translator.ico');
  const applicationIcon = nativeImage.createFromPath(applicationIconPath);
  if (process.platform === 'win32' && applicationIcon.isEmpty()) {
    throw new Error(`Windows application icon is missing or invalid: ${applicationIconPath}`);
  }
  mainWindow = new BrowserWindow({
    width: compactWindowWidth,
    height: compactWindowHeight,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    icon: applicationIcon,
    backgroundColor: initialThemeBackground,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      additionalArguments: [`--maoyi-ui-theme=${initialTheme}`],
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  if (process.platform === 'win32') mainWindow.setIcon(applicationIcon);
  mainWindow.setMenuBarVisibility(false);
  applyTaskbarUnreadOverlay();
  applyTaskbarUnreadAttention();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedMainUrl(targetUrl)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const platform = partitionPolicies.get(params.partition || '');
    if (!platform || !isAllowedPlatformUrl(platform, params.src || '')) {
      event.preventDefault();
      return;
    }
    webPreferences.preload = webviewSendGuardPreloadPath;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
  });
  mainWindow.on('minimize', prepareSignalWindowsForMainMinimize);
  mainWindow.on('hide', () => {
    if (!mainWindow?.isMinimized()) prepareSignalWindowsForMainHide();
  });
  mainWindow.on('close', (event) => {
    if (!remoteGuardIncidentLatched || signalShutdownBeforeQuitDone) return;
    event.preventDefault();
    showRemoteGuardAlarmWindows();
    startRemoteGuardAlarmSound();
    focusMainWindowForRemoteGuardRecovery();
  });
  mainWindow.on('restore', requestSignalWorkspaceRestoreOnce);
  mainWindow.on('show', requestSignalWorkspaceRestoreOnce);
  app.on('browser-window-blur', (_event, blurredWindow) => {
    if (blurredWindow === mainWindow) applyTaskbarUnreadAttention();
  });
  app.on('browser-window-focus', (_event, focusedWindow) => {
    if (focusedWindow === mainWindow) applyTaskbarUnreadAttention();
  });
  mainWindow.on('focus', () => {
    if (signalMainWindowSuspended) requestSignalWorkspaceRestoreOnce();
    else requestSignalWorkspaceSyncBurst();
  });
  mainWindow.on('move', scheduleVisibleSignalMoveSync);
  mainWindow.on('resize', refreshSignalAfterLayoutChange);
  mainWindow.on('resized', refreshSignalAfterLayoutChange);
  mainWindow.on('maximize', refreshSignalAfterLayoutChange);
  mainWindow.on('unmaximize', refreshSignalAfterLayoutChange);
  mainWindow.on('enter-full-screen', refreshSignalAfterLayoutChange);
  mainWindow.on('leave-full-screen', refreshSignalAfterLayoutChange);
  const onDisplayMetricsChanged = () => refreshSignalAfterLayoutChange();
  screen.on('display-metrics-changed', onDisplayMetricsChanged);
  mainWindow.once('closed', () => {
    screen.removeListener('display-metrics-changed', onDisplayMetricsChanged);
    signalLayoutReplayTimers.forEach(timer => clearTimeout(timer));
    signalLayoutReplayTimers = [];
  });

  const readyToShow = new Promise<void>((resolve) => {
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    const timer = setTimeout(resolveOnce, rendererReadyTimeoutMs);
    mainWindow?.once('ready-to-show', () => {
      clearTimeout(timer);
      resolveOnce();
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    if (!app.isPackaged) await mainWindow.webContents.session.clearCache();
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadURL('app://bundle/index.html');
  }

  await readyToShow;
  if (!mainWindow.isDestroyed()) {
    await startRemoteGuard();
    releaseWorkspaceVisibilityLock();
    mainWindow.show();
    requestSignalWorkspaceSyncBurst();
    const smokeCapturePath = !app.isPackaged ? process.env.MAOYI_SMOKE_CAPTURE_PATH?.trim() : '';
    if (smokeCapturePath) {
      if (process.env.MAOYI_SMOKE_ENTER_RUNTIME === '1') {
        await mainWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('进入开发环境'))?.click()`);
        await wait(750);
      }
      await wait(500);
      const image = await mainWindow.webContents.capturePage();
      await writeFile(smokeCapturePath, image.toPNG());
      if (process.env.MAOYI_SMOKE_TEST_EXIT === '1') setTimeout(() => app.exit(0), 250);
    }
  }
}

if (cloneResetWorkerMode) {
  app.whenReady().then(async () => {
    try {
      await runCloneResetWorker(cloneResetPlanPath);
      app.exit(0);
    } catch {
      dialog.showErrorBox(appDisplayName, '初始化未完成，请重新启动程序重试');
      app.exit(1);
    }
  });
} else if (storageMigrationWorkerMode) {
  app.whenReady().then(async () => {
    try {
      await runStorageMigrationWorker(storageMigrationPlanPath);
      app.exit(0);
    } catch (error) {
      dialog.showErrorBox(
        appDisplayName,
        error instanceof Error ? `数据迁移失败：${error.message}` : '数据迁移失败，客户端继续使用原目录'
      );
      app.exit(1);
    }
  });
} else {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    registerLocalAppProtocol();
    installWebContentsSecurityPolicy();
    if (!(await initializeUserDataPath())) {
      app.quit();
      return;
    }
    if (translationDiagnosticsEnabled) {
      try { diagnosticServiceSecret = safeStorage.decryptString(await readFile(join(initialDiagnosticsRoot(), 'service-key.dpapi'))); } catch { diagnosticServiceSecret = ''; }
      const suppliedDiagnosticSecret = process.env.MAOYI_DIAGNOSTIC_SECRET?.trim();
      delete process.env.MAOYI_DIAGNOSTIC_SECRET;
      if (suppliedDiagnosticSecret) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable');
        await mkdir(initialDiagnosticsRoot(), { recursive: true });
        await writeFile(join(initialDiagnosticsRoot(), 'service-key.dpapi'), safeStorage.encryptString(suppliedDiagnosticSecret));
        diagnosticServiceSecret = suppliedDiagnosticSecret;
      }
      recordTranslationDiagnostic('session:start', { version: app.getVersion(), keyConfigured: Boolean(diagnosticServiceSecret) });
      const diagnosticHeartbeat = setInterval(() => {
        recordTranslationDiagnostic('api:heartbeat', { running: diagnosticInFlight.size, oldestMs: Math.max(0, ...Array.from(diagnosticInFlight.values(), item => Date.now() - item.startedAt)) });
        recordTranslationDiagnostic('signal:queue', { running: signalLiveTranslationRunningCount, queued: signalLiveTranslationQueue.length, pending: signalLiveTranslationPendingKeys.size });
      }, 5000);
      diagnosticHeartbeat.unref();
    }
    await loadSignalNotificationRoutes();
    await cleanupPackagedRuntimeLogs();
    clientLicenseManager = new ClientLicenseManager();
    await clientLicenseManager.initialize();
    if (!(await verifyRuntimeCloneState())) return;
    if (clientLicenseManager.isRuntimeAllowed()) {
      await prepareAuthorizedRuntime();
      await runDevelopmentCacheSmokeCheck();
    }
    registerIpc();
    const signalRecoveryTimer = setInterval(() => {
      for (const appId of signalControlClients.keys()) {
        if (!getSignalCacheControlContext(appId)) continue;
        sendSignalControlMessage(appId, { type: 'message.snapshot.request', requestId: randomUUID() });
      }
    }, 15_000);
    signalRecoveryTimer.unref();
    await createWindow();
    if (translationDiagnosticsEnabled && diagnosticServiceSecret) void runDiagnosticApiProbe();
    await dispatchPendingSignalNotificationActivation();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch(showFatalStartupError);
}

if (!backgroundWorkerMode) app.on('before-quit', (event) => {
  if (signalShutdownBeforeQuitDone) return;
  event.preventDefault();
  signalShutdownBeforeQuitTimer ??= setTimeout(() => {
    signalShutdownBeforeQuitDone = true;
    app.quit();
  }, gracefulQuitTimeoutMs);
  signalShutdownBeforeQuitPromise ??= stopAllSignalProfilesForQuit().then(() => cleanupPackagedRuntimeLogs()).finally(() => {
    if (signalShutdownBeforeQuitTimer) {
      clearTimeout(signalShutdownBeforeQuitTimer);
      signalShutdownBeforeQuitTimer = null;
    }
    stopRemoteGuard();
    signalShutdownBeforeQuitDone = true;
    app.quit();
  });
});

if (!backgroundWorkerMode) app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export { platformDefaults };
