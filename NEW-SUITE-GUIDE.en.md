# Fresh maoyi suite reproduction guide

Use this guide to create a completely new `maoyi` suite on a new Windows computer after loss of the original machine. It does not recover any existing suite. Customers must authorize and sign in again.

## What the public repository recovers

- The `com.maoyi.translator` application identity and `maoyi` data directories.
- Four themes: Rose Pink, Premium Gold, Murong Purple, and Clear Water Blue.
- Source for the issuer, client, prompt generator, and suite packaging flow.
- Exact current Chinese-to-English, English-to-Chinese, and smart-reply prompt source.
- The ability to create a new 10,000-entry nine-digit ID pool, consume one new ID, and generate new authorization, translation-prompt, and smart-reply signing identities.

The repository does not recover a DeepSeek key, an existing suite's private identity or ledger, customer authorization, login state, runtime caches, or installers.

## 1. Restore production readiness with one entry point

Use 64-bit Windows with network access and preferably at least 30 GB free. The restore flow uses a portable Node.js 24.15.0 archive pinned by SHA-256 instead of trusting an arbitrary system Node.js version.

Use this sole official recovery route:

1. Open <https://github.com/damaus001-jpg/kekouhappy>.
2. Choose `Code`, then `Download ZIP`.
3. Extract the downloaded ZIP into a new empty folder; never merge it over an older project download.
4. Double-click this file at the extracted root:

```text
恢复生产环境.cmd
```

The PowerShell equivalent is:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\restore-production-environment.ps1 -InstallMissingSystemTools
```

The entry point:

- checks Git, Python 3.6+, and Visual Studio 2022 C++, installing missing tools through `winget`;
- downloads and verifies portable Node.js 24.15.0 and pnpm 11.5.2;
- installs maoyi dependencies;
- verifies the Signal 8.18.0 source archive and 21-patch series;
- hydrates the ignored Signal dependency store, Electron archive, and native headers online;
- rechecks those inputs offline, builds the modified Signal, and synchronizes `.runtime/signal-desktop`;
- runs fresh-suite reproduction, the complete security suite, Signal cache validation, maoyi/issuer UI smoke acceptance, and Signal window-control acceptance.

If newly installed system tools are not yet visible, restart Windows and run the same entry point again. Verified downloads are reused. A mismatched Signal experiment tree left by a code update, patch change, or interruption is rebuilt only within `.tmp/signal-source/v8.18.0`. Full success ends with `生产环境恢复完成，现在可以生成新套装。` and writes `.tmp/production-environment-restore-report.json`.

The success report is `.tmp/production-environment-restore-report.json`. An official GitHub ZIP recovery must also record `sourceMode: "github-download-zip"`. The restore flow never reads a DeepSeek key, creates a formal suite, consumes a formal nine-digit suite ID, generates formal private keys, or creates an installer. `-SkipUiAcceptance` is only for controlled environments that cannot open windows; a run using it is not full acceptance.

## 2. Prepare the DeepSeek key locally

No DeepSeek key is stored on GitHub. During authorization, the issuer writes the actual service secret into the customer's machine-bound license. Never place the key in `config/`, source, logs, screenshots, or Git.

Development testing may use only ignored `.package-secrets/trial-config.json` or the process environment variable `MAOYI_SERVICE_SECRET`.

## 3. Generate one new suite

Select a three-digit delivery sequence never used before. Do not run `suite:create` first; `suite:package` creates and permanently consumes its own new nine-digit suite ID.

```powershell
$env:MAOYI_SUITE_SEQUENCE = '012'
npm.cmd run suite:package
Remove-Item Env:MAOYI_SUITE_SEQUENCE
```

`012` is only a format example. The operator must select an unused sequence. The selected nine-digit ID is never recycled, whether packaging succeeds or fails.

Output is written under the adjacent `taozhuang/taozhuang<sequence>_<time>/` directory. It contains the client installer, suite-specific issuer, suite-specific prompt generator, and manifest. Never commit that directory or `.package-secrets`, `.package-staging`, `.runtime`, or `release`.

## 4. Acceptance before delivery

```powershell
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```

Also open the generated client and manually verify startup, authorization, all four themes, WhatsApp/Telegram sign-in, a new Signal instance, translation, and smart reply. Builds and automated checks do not replace real UI acceptance.

## 5. Consequence

The new suite is independent from every old suite. Customers must authorize and sign in or scan again. Public GitHub does not recover old authorization or login continuity.
