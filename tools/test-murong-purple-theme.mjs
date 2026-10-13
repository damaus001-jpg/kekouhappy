import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const shared = fs.readFileSync(path.join(projectRoot, 'electron', 'shared.ts'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.ts'), 'utf8');

function includes(source, expected, contract) {
  assert.ok(source.includes(expected), `Murong Purple theme contract missing: ${contract}`);
}

includes(shared, "export type AppTheme = 'pink' | 'blackGold' | 'murongPurple' | 'clearWaterBlue';", 'shared theme type');
includes(shared, 'activeTheme: AppTheme;', 'theme persisted in application config');
includes(main, "activeTheme: 'blackGold',", 'legacy config fallback remains black gold');
includes(main, "const validAppThemes = new Set<AppTheme>(['pink', 'blackGold', 'murongPurple', 'clearWaterBlue']);", 'config theme whitelist');
includes(main, 'activeTheme: normalizeAppTheme(config.activeTheme),', 'config theme sanitization');
includes(main, "theme !== 'blackGold'", 'black-gold IPC whitelist');
includes(main, "theme !== 'pink'", 'pink IPC whitelist');
includes(main, "theme !== 'murongPurple'", 'Murong Purple IPC whitelist');
includes(main, "theme !== 'clearWaterBlue'", 'Clear Water Blue IPC whitelist');
includes(preload, "'blackGold' | 'pink' | 'murongPurple'", 'renderer theme bridge type');
includes(app, "if (activeTheme.value === 'murongPurple') return 'theme-black-gold theme-murong-purple';", 'third theme class');
includes(app, 'activeTheme: activeTheme.value,', 'theme saved with workspace config');
includes(app, 'activeTheme.value = config.activeTheme;', 'saved theme restored');
includes(app, "@click=\"setTheme('murongPurple')\">慕容紫</button>", 'theme menu entry and label');
includes(app, "theme === 'murongPurple'", 'Signal shell background follows the selected theme');
includes(app, "composerTheme === 'murongPurple'", 'translator-owned overlay follows the selected theme');
includes(styles, '.theme-murong-purple {', 'theme root');
includes(styles, '--bg: #171218;', 'dark plum background');
includes(styles, '--accent: #b48ead;', 'muted purple accent');
includes(styles, '--accent-bright: #d6a6b8;', 'rose highlight');
includes(styles, '.client-lock-screen.theme-murong-purple', 'lock screen coverage');
includes(styles, '.theme-murong-purple .remote-guard-panel-card', 'remote guard coverage');
includes(styles, '.theme-murong-purple .modal-card', 'modal coverage');

console.log('murong-purple-theme: theme menu, persistence, IPC validation, overlays, and core UI coverage passed');
