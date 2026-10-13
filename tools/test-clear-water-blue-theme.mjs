import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const shared = fs.readFileSync(path.join(projectRoot, 'electron', 'shared.ts'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');

function includes(source, expected, contract) {
  assert.ok(source.includes(expected), `Clear Water Blue theme contract missing: ${contract}`);
}

includes(shared, "'clearWaterBlue'", 'shared theme value');
includes(main, "'pink', 'blackGold', 'murongPurple', 'clearWaterBlue'", 'saved config whitelist');
includes(main, "theme !== 'clearWaterBlue'", 'IPC whitelist');
includes(main, 'config.activeTheme = theme;', 'theme IPC persists the exact selected theme');
includes(main, 'await saveConfig(config);', 'theme IPC completes the config write');
includes(main, 'const initialTheme = await readInitialAppTheme();', 'theme loaded before the window is created');
includes(main, 'additionalArguments: [`--maoyi-ui-theme=${initialTheme}`]', 'validated theme passed to preload before first paint');
includes(main, 'backgroundColor: initialThemeBackground', 'native window background follows the saved theme');
includes(preload, 'getInitialTheme: () => initialTheme', 'synchronous first-render theme bridge');
includes(app, "theme-clear-water-blue", 'theme class');
includes(app, "@click=\"setTheme('clearWaterBlue')\">晴水蓝</button>", 'theme menu label');
includes(app, 'function setTheme(theme: ThemeName) {', 'one persistence flow shared by every theme');
includes(app, 'activeTheme.value = theme;', 'the currently selected theme is the saved value');
includes(app, 'setWindowTheme?.(theme)', 'selected theme uses the dedicated persistence IPC');
includes(app, 'activeTheme.value = config.activeTheme;', 'saved theme is restored on next launch');
includes(app, "window.chatTranslator?.getInitialTheme?.() ?? 'blackGold'", 'login page starts with the saved theme');
includes(app, "composerTheme === 'clearWaterBlue'", 'translator-owned overlay palette');
includes(styles, '.theme-clear-water-blue {', 'theme root');
includes(styles, 'grid-template-columns: repeat(2, minmax(92px, 1fr));', 'theme menu uses two columns');
includes(styles, 'min-width: 220px;', 'two-column theme menu width');
includes(styles, '--bg: #eaf8ff;', 'light water background');
includes(styles, '--accent: #4aade8;', 'sky blue accent');
includes(styles, '--text: #17364a;', 'readable light-theme text');
includes(styles, '.theme-clear-water-blue.login-page::before', 'login page removes the yellow circle decoration');
includes(styles, '.theme-pink.login-page .login-card', 'pink login card uses its darker theme treatment');
includes(styles, '.client-lock-screen.theme-clear-water-blue', 'lock screen coverage');
includes(styles, '.theme-clear-water-blue .remote-guard-panel-card', 'remote guard coverage');
includes(styles, 'border-radius: 18px;', 'cartoon rounded modal language');

console.log('clear-water-blue-theme: menu, persistence, light palette, overlays, and core UI coverage passed');
