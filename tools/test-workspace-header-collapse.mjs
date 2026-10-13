import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const pokeball = fs.readFileSync(path.join(projectRoot, 'src', 'assets', 'pokeball.svg'));

function includes(source, expected, contract) {
  assert.ok(source.includes(expected), `Workspace-header collapse contract missing: ${contract}`);
}

function matches(source, pattern, contract) {
  assert.match(source, pattern, `Workspace-header collapse contract missing: ${contract}`);
}

includes(app, "const workspaceHeaderCollapsed = ref(false);", 'restart default is expanded and session-only');
includes(app, "'workspace-header-collapsed': workspaceHeaderCollapsed", 'collapsed layout class');
includes(app, 'v-show="!workspaceHeaderCollapsed" class="runtime-header"', 'header content hidden when collapsed');
includes(app, 'class="runtime-header-toggle"', 'sidebar toggle below lock');
includes(app, '<span class="runtime-header-toggle-icon" aria-hidden="true">', 'independent static Poké Ball outer ring');
includes(app, "import pokeballIcon from './assets/pokeball.svg';", 'directly extracted Poké Ball glyph asset');
includes(app, '<span class="runtime-header-toggle-glyph" :class="{ spinning: pokeballBursting }" @animationend="handlePokeballAnimationEnd">', 'inner Poké Ball glyph uses bounded animation bursts');
includes(app, '<img :src="pokeballIcon" alt="" />', 'independent inner Poké Ball artwork');
includes(app, ':aria-expanded="!workspaceHeaderCollapsed"', 'accessible expanded state');
includes(app, "{{ workspaceHeaderCollapsed ? '折叠' : '展开' }}", 'visible label describes the current chat-window state');
assert.ok(!app.includes(':class="{ active: workspaceHeaderCollapsed }"'), 'Expand/collapse state must not change the Poké Ball button styling');
matches(
  app,
  /function toggleWorkspaceHeader\(\) \{[\s\S]*workspaceHeaderCollapsed\.value = !workspaceHeaderCollapsed\.value;[\s\S]*themeMenuOpen\.value = false;[\s\S]*preserveActiveSignalAfterChromeChange\(\);[\s\S]*\}/,
  'toggle closes theme menu and resynchronizes an active Signal window'
);
assert.ok(!/localStorage[\s\S]{0,120}workspaceHeaderCollapsed|workspaceHeaderCollapsed[\s\S]{0,120}localStorage/.test(app), 'Collapsed state must not persist across restart');

matches(styles, /\.workspace-page\.workspace-header-collapsed\s*\{\s*grid-template-rows:\s*0 auto minmax\(0, 1fr\);\s*\}/, 'the full 104px header row collapses to zero');
matches(styles, /\.workspace-header-collapsed \.runtime-header\s*\{\s*display:\s*none;/, 'no hidden header residue');
matches(styles, /\.workspace-header-collapsed \.multi-open-tabs\s*\{\s*padding-right:\s*142px;/, 'tabs reserve the floating window-control footprint');
matches(styles, /\.window-ctrl\.vertical\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*9999;/, 'window controls remain floating');
matches(
  styles,
  /\.runtime-side\s*\{[\s\S]*?grid-template-rows:\s*repeat\(4, 78px\) repeat\(3, 72px\) minmax\(76px, 1fr\);/,
  'home, lock, remote guard, and toggle remain equal-height; three platforms remain equal-height; bottom custom entry has a flexible row'
);
matches(styles, /\.runtime-side \.runtime-customize-button\s*\{[\s\S]*?align-self:\s*end;[\s\S]*?padding:\s*0 0 24px;/, 'bottom custom entry keeps a 24px distance from the workspace edge');
matches(app, /class="runtime-lock-button"[\s\S]*class="runtime-guard-button"[\s\S]*class="runtime-header-toggle"/, 'remote guard stays between lock and expand/collapse');
matches(styles, /\.runtime-side \.runtime-header-toggle \.runtime-header-toggle-icon\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?font-size:\s*28px;/, 'enlarged Poké Ball toggle icon');
matches(styles, /\.runtime-side \.runtime-guard-button\s*\{[\s\S]*?transform:\s*translateY\(2px\);/, 'remote guard icon and labels move down together by 2px');
matches(styles, /\.runtime-side \.runtime-header-toggle\s*\{[\s\S]*?transform:\s*translateY\(7px\);/, 'Poké Ball icon and expand/collapse label keep their prior 5px offset and move down by 2px');
matches(styles, /\.runtime-side \.app-short\s*\{[\s\S]*?transform:\s*translateY\(2px\);/, 'all three platform shortcuts move down together by 2px');
includes(styles, '.theme-pink .runtime-side .runtime-header-toggle .runtime-header-toggle-icon', 'pink-theme Poké Ball icon');
assert.ok(!styles.includes('.runtime-header-toggle.active'), 'Only the expand/collapse label may change between states');
matches(styles, /\.runtime-header-toggle-glyph\s*\{[\s\S]*?transform:\s*rotate\(0deg\);/, 'inner glyph returns upright when animation stops');
includes(app, 'const waitMs = 3000 + Math.floor(Math.random() * 9001);', 'random waits between three and twelve seconds');
matches(app, /watch\(signedIn,[\s\S]*?if \(ready\) schedulePokeballBurst\(\);/, 'animation starts when the workspace becomes available');
const animationScheduler = app.slice(app.indexOf('function schedulePokeballBurst()'), app.indexOf('function handlePokeballAnimationEnd'));
assert.ok(!animationScheduler.includes('workspaceHeaderCollapsed'), 'animation works in both expanded and collapsed layouts');
matches(app, /function handlePokeballAnimationEnd\(event: AnimationEvent\) \{[\s\S]*?pokeballBursting\.value = false;[\s\S]*?schedulePokeballBurst\(\);/, 'next wait begins only after a one-turn burst completes');
matches(styles, /\.runtime-header-toggle-glyph\.spinning\s*\{\s*animation:\s*runtime-pokeball-burst 1\.4s ease-in-out 1;/, 'each burst runs once for 1.4 seconds');
matches(styles, /@keyframes runtime-pokeball-burst\s*\{[\s\S]*?transform:\s*rotate\(360deg\);/, 'each burst rotates one full turn');
assert.ok(!styles.includes('runtime-bitcoin-ring-spin'), 'outer ring must remain static');
assert.ok(pokeball.toString('utf8').includes('<svg'), 'Poké Ball asset must remain a scalable SVG');

console.log('workspace-header-collapse: zero-height collapse, floating controls, Poké Ball toggle, and restart default contracts passed');
