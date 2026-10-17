const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const workRoot = path.join(projectRoot, '.tmp', 'signal-gpt-context-patch');
const oldFunctions = 'function d(e,t,n){let r=new Set;for(let n of t){let t=n.messageId.toLowerCase();if(n.conversationId!==e||r.has(t))return[];r.add(t)}let i=f(e,t),a=n??t.at(-1);if(!a||!i.includes(a.messageId))return[];let o=t.findIndex(e=>u(e,a));return o<0?[]:t.slice(Math.max(0,o-8+1),o+1)}function f(e,t){let n=new Set;for(let r of t){let t=r.messageId.toLowerCase();if(r.conversationId!==e||n.has(t))return[];n.add(t)}return t.filter(e=>e.direction===`incoming`).slice(-3).map(e=>e.messageId)}';
const newFunctions = 'function isCurrentLocalCalendarDay(e){let t=new Date(e),n=new Date;return Number.isFinite(t.getTime())&&t.getFullYear()===n.getFullYear()&&t.getMonth()===n.getMonth()&&t.getDate()===n.getDate()}function d(e,t,n){let r=new Set;for(let n of t){let t=n.messageId.toLowerCase();if(n.conversationId!==e||r.has(t))return[];r.add(t)}let i=f(e,t),a=n??t.at(-1);if(!a||!i.includes(a.messageId))return[];let o=t.findIndex(e=>u(e,a));return o<0?[]:t.slice(0,o+1).filter(e=>isCurrentLocalCalendarDay(e.timestamp)).slice(-18)}function f(e,t){let n=new Set;for(let r of t){let t=r.messageId.toLowerCase();if(r.conversationId!==e||n.has(t))return[];n.add(t)}return t.filter(e=>e.direction===`incoming`&&isCurrentLocalCalendarDay(e.timestamp)).slice(-3).map(e=>e.messageId)}';

function assertInsideProject(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Signal GPT context patch path must stay inside the project: ${target}`);
  }
}

async function patchSignalGptContext(archivePath) {
  const targetArchive = path.resolve(archivePath);
  assertInsideProject(targetArchive);
  await fs.rm(workRoot, { recursive: true, force: true });
  const extracted = path.join(workRoot, 'extracted');
  const packed = path.join(workRoot, 'patched.asar');
  const backupArchive = path.join(workRoot, 'original.asar');
  const backupUnpacked = path.join(workRoot, 'original.asar.unpacked');
  await fs.mkdir(workRoot, { recursive: true });
  await asar.extractAll(targetArchive, extracted);

  const chunks = path.join(extracted, 'bundles', 'chunks');
  const candidates = (await fs.readdir(chunks)).filter(name => /^messageBridgeChannels\.std-.+\.js$/.test(name));
  if (candidates.length !== 1) throw new Error(`Expected one Signal message bridge projection bundle, found ${candidates.length}.`);
  const bridgePath = path.join(chunks, candidates[0]);
  const source = await fs.readFile(bridgePath, 'utf8');
  if (source.includes(newFunctions)) {
    console.log('Signal GPT context already supports recent incoming anchors and up to 18 messages today.');
    return false;
  }
  const firstIndex = source.indexOf(oldFunctions);
  if (firstIndex < 0 || source.indexOf(oldFunctions, firstIndex + oldFunctions.length) >= 0) {
    throw new Error('Signal message bridge context selector does not match the expected 8-message source.');
  }
  await fs.writeFile(bridgePath, source.replace(oldFunctions, newFunctions), 'utf8');
  await asar.createPackageWithOptions(extracted, packed, {
    unpack: '*.node',
    unpackDir: 'build/icons/win'
  });

  const targetUnpacked = `${targetArchive}.unpacked`;
  await fs.copyFile(targetArchive, backupArchive);
  const targetUnpackedExists = await fs.stat(targetUnpacked).then(() => true, () => false);
  if (targetUnpackedExists) await fs.cp(targetUnpacked, backupUnpacked, { recursive: true });
  try {
    await fs.rm(targetArchive, { force: true });
    await fs.rename(packed, targetArchive);
    await fs.rm(targetUnpacked, { recursive: true, force: true });
    const packedUnpacked = `${packed}.unpacked`;
    if (await fs.stat(packedUnpacked).then(() => true, () => false)) {
      await fs.rename(packedUnpacked, targetUnpacked);
    }
  } catch (error) {
    await fs.rm(targetArchive, { force: true });
    await fs.copyFile(backupArchive, targetArchive);
    await fs.rm(targetUnpacked, { recursive: true, force: true });
    if (targetUnpackedExists) await fs.cp(backupUnpacked, targetUnpacked, { recursive: true });
    throw error;
  }
  console.log('Signal GPT context now supports the last three incoming anchors and copies up to 18 messages ending at the selected bubble.');
  return true;
}

if (require.main === module) {
  const archivePath = process.argv[2];
  if (!archivePath) throw new Error('Usage: node tools/patch-signal-gpt-context.cjs <project-asar>');
  patchSignalGptContext(archivePath).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { patchSignalGptContext, oldFunctions, newFunctions };
