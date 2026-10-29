import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRemoteGuardScan,
  parseEstablishedTcpConnections,
  parseWindowsSessions,
  parseWindowsTasklist,remoteSourceKey,normalizeRemoteAddress,parseRdpListenerPort
} from '../dist-electron/remote-guard-core.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const consoleSessions = ` SESSIONNAME       USERNAME                 ID  STATE   TYPE        DEVICE\r\n>console           admin                     1  Active\r\n rdp-tcp                                 65536  Listen\r\n`;
const activeRdpSessions = ` SESSIONNAME       USERNAME                 ID  STATE   TYPE        DEVICE\r\n console           admin                     1  Disc\r\n>rdp-tcp#4         admin                     2  Active\r\n rdp-tcp                                 65536  Listen\r\n`;
const disconnectedRdpSessions = ` SESSIONNAME       USERNAME                 ID  STATE   TYPE        DEVICE\r\n>console           admin                     1  Active\r\n rdp-tcp#4         guest                     2  Disc\r\n rdp-tcp                                 65536  Listen\r\n`;
const consoleTasklist = `"maoyi.exe","4242","Console","1","100,000 K"\r\n`;
const rdpTasklist = `"maoyi.exe","4242","RDP-Tcp#4","2","100,000 K"\r\n"rdpclip.exe","3111","RDP-Tcp#4","2","10,000 K"\r\n`;

assert.equal(parseWindowsTasklist(consoleTasklist)[0]?.processId, 4242, 'tasklist PID must parse');
assert.equal(parseWindowsSessions(activeRdpSessions)[0]?.active, false, 'disconnected console session must stay inactive');
assert.equal(parseWindowsSessions(activeRdpSessions)[1]?.current, true, 'current RDP session must parse');
assert.equal(
  parseEstablishedTcpConnections('TCP    0.0.0.0:5900    10.0.0.2:50123    ESTABLISHED    7000')[0]?.processId,
  7000,
  'netstat PID must parse'
);

const base = {
  currentProcessId: 4242,
  processesAvailable: true,
  windowsSessionsAvailable: true,
  connections: 'not-needed'
};

const safe = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: consoleTasklist,
  qwinstaOutput: consoleSessions
});
assert.equal(safe.state, 'guarding');
assert.equal(safe.threatActive, false);

const activeRdp = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: rdpTasklist,
  qwinstaOutput: activeRdpSessions
});
assert.equal(activeRdp.state, 'alarm');
assert.equal(activeRdp.threatActive, true);
assert.ok(activeRdp.findings.some((finding) => finding.connection?.kind === 'rdp'));

const disconnectedRdp = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: consoleTasklist,
  qwinstaOutput: disconnectedRdpSessions
});
assert.equal(disconnectedRdp.threatActive, false, 'disconnected RDP must not trigger a lock');

const anyDeskOnly = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: `${consoleTasklist}"AnyDesk.exe","5000","Console","1","25,000 K"\r\n`,
  qwinstaOutput: consoleSessions
});
assert.equal(anyDeskOnly.state, 'suspicious');
assert.equal(anyDeskOnly.threatActive, false, 'a running remote tool alone is not proof of an active session');

const activeVnc = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: `${consoleTasklist}"winvnc.exe","7000","Console","1","18,000 K"\r\n`,
  qwinstaOutput: consoleSessions,
  connections: 'available',
  netstatOutput: 'TCP    0.0.0.0:5900    10.0.0.2:50123    ESTABLISHED    7000'
});
assert.equal(activeVnc.state, 'alarm');
assert.ok(activeVnc.findings.some((finding) => finding.connection?.kind === 'vnc'));
const vnc=activeVnc.findings.find(f=>f.connection)?.connection;
assert.equal(vnc.sourceAddress,'10.0.0.2');assert.equal(vnc.remotePort,50123);assert.equal(vnc.localPort,5900);assert.ok(vnc.trustKey);
const remembered=[{key:vnc.trustKey,kind:'vnc',sourceAddress:'10.0.0.2',servicePort:5900,createdAt:1}];
const trustedVnc=evaluateRemoteGuardScan({...base,tasklistOutput:consoleTasklist,qwinstaOutput:consoleSessions,connections:'available',netstatOutput:'TCP 10.0.0.5:5900 10.0.0.2:59999 ESTABLISHED 8000',trustedSources:remembered});assert.equal(trustedVnc.threatActive,false,'remembered peer remains trusted after PID/client port changes');
const mixed=evaluateRemoteGuardScan({...base,tasklistOutput:consoleTasklist,qwinstaOutput:consoleSessions,connections:'available',netstatOutput:'TCP 10.0.0.5:5900 10.0.0.2:59999 ESTABLISHED 8000\nTCP 10.0.0.5:5900 10.0.0.3:51111 ESTABLISHED 8000',trustedSources:remembered});assert.equal(mixed.threatActive,true);assert.equal(mixed.findings.filter(f=>f.trusted).length,1,'trust never covers a different source');
const rdpPeer=evaluateRemoteGuardScan({...base,tasklistOutput:rdpTasklist,qwinstaOutput:activeRdpSessions,connections:'available',rdpPort:3390,netstatOutput:'TCP 10.0.0.5:3390 10.0.0.9:50123 ESTABLISHED 7000'}).findings.find(f=>f.connection)?.connection;
assert.equal(rdpPeer.sourceAddress,'10.0.0.9');assert.equal(rdpPeer.userName,'admin');assert.equal(rdpPeer.sessionId,2);
assert.equal(remoteSourceKey('rdp','10.0.0.9',3390),rdpPeer.trustKey);assert.notEqual(remoteSourceKey('vnc','10.0.0.9',3390),rdpPeer.trustKey);
assert.equal(parseRdpListenerPort('PortNumber REG_DWORD 0xd3d'),3389);assert.equal(parseRdpListenerPort('bad'),0);
assert.equal(normalizeRemoteAddress('[::FFFF:10.0.0.2]'),'10.0.0.2');assert.equal(normalizeRemoteAddress('2001:0db8::1'),'2001:db8::1');assert.equal(remoteSourceKey('vnc','not-an-ip',5900),'');
assert.equal(normalizeRemoteAddress('[fe80:0000::1%12]'),'fe80::1%12','Windows scoped IPv6 addresses remain readable without throwing');
assert.equal(evaluateRemoteGuardScan({...base,tasklistOutput:rdpTasklist,qwinstaOutput:consoleSessions}).threatActive,false,'stale process cache cannot turn a current console session into RDP');
assert.equal(activeRdp.findings.find(f=>f.connection)?.connection.trustKey,undefined,'a session number alone cannot become a persistent trusted source');

const outboundVncViewer = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: consoleTasklist,
  qwinstaOutput: consoleSessions,
  connections: 'available',
  netstatOutput: 'TCP    10.0.0.5:50123    10.0.0.2:5900    ESTABLISHED    4242'
});
assert.equal(outboundVncViewer.threatActive, false, 'controlling another VNC host must not look like an inbound VNC session');

const degraded = evaluateRemoteGuardScan({
  ...base,
  tasklistOutput: '',
  qwinstaOutput: consoleSessions,
  processesAvailable: false
});
assert.equal(degraded.state, 'degraded');
assert.match(degraded.reason || '', /远控进程/);

const mainSource = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const preloadSource = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');
assert.match(mainSource, /const remoteGuardScanIntervalMs = 8_000;/, 'guard must scan every 8 seconds');
assert.match(mainSource, /processScanIntervalMs: remoteGuardProcessScanIntervalMs/, 'slow process scan interval must be visible and packaged');
assert.match(mainSource, /const remoteGuardWindowsLockDelayMs = 5 \* 60_000;/, 'every new connection must allow five minutes');
assert.match(mainSource, /scheduleRemoteGuardWindowsLock\(\)[\s\S]*requestWindowsWorkstationLock/, 'main process must own the lock countdown');
assert.match(mainSource, /remoteGuardIncidentLatched[\s\S]*releaseWorkspaceVisibilityLock/, 'incident must gate workspace release');
assert.match(
  rendererSource,
  /const hasBlockingModal = computed\(\(\) => Boolean\([\s\S]*remoteGuardPanelVisible\.value/,
  'remote guard details must participate in the native Signal window visibility gate'
);
assert.match(
  rendererSource,
  /function openRemoteGuardPanel\(\) \{[\s\S]*remoteGuardPanelVisible\.value = true;[\s\S]*scheduleSignalWorkspaceSyncBurst\(\)/,
  'opening remote guard details must hide the active Signal surface before the modal is used'
);
assert.match(
  rendererSource,
  /function closeRemoteGuardPanel\(\) \{[\s\S]*remoteGuardPanelVisible\.value = false;[\s\S]*scheduleSignalWorkspaceSyncBurst\(\)/,
  'closing remote guard details must restore the same Signal workspace without a refresh'
);
assert.ok(rendererSource.includes('十万伏特'), 'sidebar guard entry must exist');
assert.ok(rendererSource.includes('remote-guard-alarm-screen'), 'full-screen alarm must exist');
assert.ok(preloadSource.includes('remote-guard:status-changed'), 'packaged preload must deliver guard status');

console.log('remote-guard: policy, timing, package bridge, and false-positive contracts passed');
