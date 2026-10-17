# GitHub General Release and Disaster Recovery Rules

The Chinese reading version is `github.md`.

## Governing Principle

The following principle governs every GitHub sync, commit, and push:

1. **Recover after loss of the local computer**
   GitHub must contain sufficiently complete project source and development material. On another computer, the project must support dependency installation, builds, tests, and continued development. A partial code snapshot that cannot run is not a valid recovery copy.

The scope of source and recovery material in this repository is defined by the current committed documentation. It is no longer constrained by a requirement to match the business workspace or to differ only by branding. Complete recovery is not a reason to upload DeepSeek keys, customer data, login state, runtime caches, or any real suite identity.

## Current Repository Scope

The repository currently contains these product capabilities:

- Signal / WhatsApp / Telegram multi-instance support.
- Input translation, bubble translation, cache, refresh, and unread preview.
- Themes, workspace behavior, window control, and app lock.
- Signal display, hide, attachment, process, and multi-instance management logic.
- Authorization, machine binding, security checks, and their development-tool source.
- Build, test, packaging, white-label tooling, and the project-owned Codex skill copy.
- Long-lived bilingual documents and key product design records.
- Tooling and instructions to create a completely new suite identity, sign prompts, and produce package outputs.
- Exact current translation and smart-reply prompt source plus content hashes.
- Four persisted themes: Rose Pink, Premium Gold, Murong Purple, and Clear Water Blue.

The repository product name, application identity, and default data directories use `maoyi`. Original enterprise logos, names, application identities, and data directories do not enter current or future files.

## Recovery Scope

The GitHub general release must include:

- Complete source, including the main process, renderer, issuer, Signal modifications, and platform injection logic.
- Configuration templates and environment examples without real secret values.
- Dependency manifests and lock files.
- Build, test, packaging, white-label sync, and security-check scripts.
- Data model, cache, authorization, suite, and upgrade process documentation.
- Long-lived bilingual documentation.
- Project-owned skills, patches, assets, and tools required to resume development.
- `config/translation-prompts.default.json`, `config/smart-reply-prompt.default.txt`, and the prompt-content hash manifest.
- An isolated fresh-suite reproduction test that never consumes an ID from the real workspace.
- `恢复生产环境.cmd`, its PowerShell implementation, and its contract test; the sole official recovery route must be GitHub `Code` → `Download ZIP` and must not depend on absent `.git` metadata. The flow must hydrate excluded toolchains and dependency caches online, build and synchronize Signal, and never create a suite or consume a formal ID.

The minimum recovery acceptance standard is a fresh remote clone that can use the one-entry restore flow to install or check tools, hydrate dependencies online, build and synchronize the modified Signal runtime, run the required checks, and resume production of completely new suites without borrowing files from the old business workspace.

Production secrets and existing suite identities are not recovered through this repository. The following require a separate encrypted backup outside GitHub or regeneration in the new environment:

- Production API keys and customer keys.
- All suite private keys, certificates, issuer state, and real authorization material.
- The real allocation ledger for used and unused suite IDs.
- Suite identity mappings required for customer upgrades.

The repository recovers the ability to create a new suite, not the private identity or customer continuity of any existing suite. A new suite receives a new nine-digit ID and three new signing identities; customers must authorize and sign in again. See `NEW-SUITE-GUIDE.en.md` and `NEW-SUITE-AI-PROMPT.en.md`.

## Current Documentation and Git History

Later commits may update or delete README text and other current documentation; GitHub displays the latest version on the current branch by default. Old wording remains in existing Git history. This policy applies only to current and future files, does not rewrite existing history, and must not be implemented with a force push.

## Bilingual Sync Rule

`github.md` is the Chinese reading version and `github.en.md` is the English execution-reference version. Both must express the same rules.

Long-lived project `.md` documents follow the same policy:

- `xxx.md`: Chinese reading version.
- `xxx.en.md`: English execution-reference version.
- Update both when changing long-lived rules, product designs, architecture notes, Signal retrospectives, or release procedures.
- Add an English counterpart when a temporary investigation log becomes long-lived documentation.
- `.md` files under third-party dependencies, runtime caches, and generated exports are outside this rule.

## Workspace Isolation

GitHub general-release work must be physically isolated from active business development:

- The business source directory is the functional source of truth and must not be white-labeled and pushed directly.
- Generate, inspect, commit, and push the general release only from `github-export-baishihappy-2`.
- Do not replace branding, logos, or data directory names in the business directory.
- Do not overwrite the business directory with generated general-release output.
- Every sync starts from an explicit business Git commit.
- The general-release sync commit message must include `Source-Checkpoint: <business commit hash>`.

The current business checkpoint is:

```text
3855a77 checkpoint: preserve eye care themes and runtime guards
```

Future syncs must use the new actual business commit hash, not permanently reuse this old value.

## Content That Must Never Enter GitHub

The following must not appear as files, content fragments, log output, or historical revisions:

- API keys, tokens, cookies, passwords, and real environment values.
- `license.dat`, license-code text, and customer authorization material.
- Private keys, certificate private keys, DPAPI data, cache keys, and machine-binding secrets.
- `.package-secrets`, real issuer state, and the real suite-ID ledger.
- Customer suite directories under `taozhuang`, installers, delivery archives, and release outputs.
- Signal / WhatsApp / Telegram login state, account data, and instance directories.
- `TranslationCache`, `SignalInstances`, `Partitions`, WebView user data, and local caches.
- Customer chat records, exported enterprise assets, contacts, images, video, and voice content.
- Customer configuration, machine codes, usernames, and device-binding records.
- Local identity information, private absolute paths, and customer-identifying data.
- Development and customer runtime logs.
- `node_modules`, `dist`, `dist-electron`, `.runtime`, `.tmp`, `.toolchains`, and `.pnpm-store-complete`.

Root bug screenshots, competitor screenshots, and temporary feedback images are excluded by default. Commit a specific image only when the user explicitly designates it as long-lived repository evidence.

## Fixed Pre-Push Workflow

Push remotely only when the user explicitly asks to "push GitHub," "upload the general release," or "force-push the general release." Ordinary archiving, a Git safety check, or a local commit does not trigger a push.

### 1. Confirm Source and Isolation Directory

- Confirm the business workspace commit hash.
- Confirm the current directory is `github-export-baishihappy-2`.
- Confirm the business workspace was not changed, moved, or overwritten.
- Confirm that the source, tests, recovery material, and long-lived documentation intended for this publication are all in scope.

### 2. Confirm Remote, Branch, and Visibility

Inspect:

```text
git remote -v
git branch --show-current
```

- The remote and branch must match the intended targets.
- Check repository visibility before every push and report it to the user.
- Because the repository contains complete authorization and security implementation source, a private repository is the default recommendation.
- If the repository is public and the user did not explicitly confirm a public push for this operation, stop and report instead of pushing.

### 3. Confirm Intended Source Scope

- Check the source, tests, scripts, skills, and long-lived documentation explicitly required by the current task.
- Do not use exact feature or workspace-behavior parity with the business workspace as a push condition.
- A fresh-suite capability change must verify the new ID pool, the single consumed ID, all three new signing identities, the public client identity without private keys, exact public prompt hashes, the `maoyi` identity, and all four themes.

### 4. Confirm Branding

Scan file names and contents for:

- business brand Chinese enterprise names.
- `[BUSINESS_BRAND_NAME]`.
- business brand logos, icons, theme images, and brand images.
- Enterprise-only path names, product names, and documentation wording.

The general-release brand is:

```text
maoyi
```

Replace brand assets with general-release assets. Do not blindly delete them and leave missing images, broken layouts, or failed builds.

### 5. Scan Sensitive Files and Content

- Scan filenames, file content, the staging area, and untracked files against the forbidden-content list.
- Confirm `.gitignore` covers runtime data, secret directories, customer outputs, and installers.
- Scan for probable API keys, private-key headers, license codes, machine codes, and customer paths. Current and future files allow no private-key match.
- Stop immediately if a real secret is found. Deleting it from the current working tree does not remove it from Git history.

### 6. Scan Git History

- Inspect the commits that will be pushed, not only the current snapshot.
- Confirm that the commits being pushed contain no out-of-boundary secrets, customer data, installers, or runtime caches.
- This change appends current and future commits only and does not rewrite existing history. Any future history cleanup requires separate explicit authorization.

### 7. Build and Actual Tests

Run at least the following in the general-release isolation directory:

```text
npm.cmd ci
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```

- Run newly added security or critical runtime tests as well.
- Delete temporary screenshots created by `test:electron-smoke` after manual inspection; do not commit them.
- A successful build supports only the statement "build passed."
- Report UI or runtime behavior as verified only after actually opening the application and inspecting that path.
- Do not push after a test failure unless the user is told the exact failing item and explicitly instructs continuation.

### 8. Inspect Git State and Commit Content

Run:

```text
git diff --check
git status --short
git diff --stat
git diff --cached --name-status
git log -1 --oneline
```

- Review every staged path and confirm it belongs to the general release.
- Record the sync scope and `Source-Checkpoint` in the commit message.
- Inspect working-tree status again after committing.

### 9. Push Rule

- Use a normal push by default.
- Do not use `git push --force` as a routine command.
- Rewriting remote history requires the user's explicit approval for that operation and must use `git push --force-with-lease`.
- Do not push if the remote, branch, isolation directory, branding, sensitive-data scan, or tests fail validation.

### 10. Post-Push Disaster-Recovery Audit

After pushing:

- Confirm the remote branch commit hash matches the local general-release commit.
- Fresh-clone the remote into a new temporary directory.
- Without referencing business-workspace files, reinstall dependencies and run the build and required tests.
- Record passed, failed, and unverified items.
- Delete the temporary clone and test outputs without affecting the business workspace or general-release isolation directory.

Only after the remote commit exists and the fresh-clone audit is complete may the operation be described as a completed off-machine recovery backup.

## Git Safety Check, Checkpoint, and Remote Backup

- **Git safety check**: inspects paths, differences, branding, and sensitive data; it creates no commit.
- **Local Git checkpoint**: creates a local commit and supports local rollback, but is lost with the local computer.
- **GitHub remote backup**: gains off-machine recovery value only after isolation, checks, commit, push, and fresh-clone validation.

These are different operations. Status reports must state separately which ones were completed.

## Current Target Repository

```text
https://github.com/damaus001-jpg/kekouhappy.git
```

## Fixed Operating Rule

When the user requests a GitHub push, use this order:

```text
confirm source commit -> prepare isolated repository -> intended-scope/branding/sensitive-data checks -> build and actual tests -> commit -> normal push -> fresh-clone audit
```

Never skip the isolation directory, never push directly from the business directory, and never describe a local commit as a completed GitHub loss-recovery backup.
