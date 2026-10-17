# Fresh-suite prompt for Codex or another coding AI

Copy the complete block below to Codex or another coding AI on the new computer:

```text
You are working in a fresh ZIP recovery folder from the public repository damaus001-jpg/kekouhappy. Your objective is to verify or generate a completely new maoyi suite. Do not recover or reuse any existing suite.

Fixed boundaries:
- Keep application ID com.maoyi.translator and keep the product and data-directory identity as maoyi.
- Preserve all four themes: Rose Pink, Premium Gold, Murong Purple, and Clear Water Blue.
- The only authoritative current prompt sources are config/translation-prompts.default.json and config/smart-reply-prompt.default.txt. Verify exact content hashes against config/prompt-sources.manifest.json first.
- GitHub contains no DeepSeek/API key. Do not find, guess, generate, print, or commit a real key.
- Do not read, recover, or reuse an old suite ID, private key, ledger, authorization file, or customer identity.
- Do not read or commit customer data, machine codes, login state, cookies, chat data, Signal instances, translation caches, logs, installers, or delivery directories.
- Keep .package-secrets, .package-staging, .runtime, release, and adjacent taozhuang output untracked.
- Use .toolchains, .pnpm-store-complete, and .tmp only as local recovery inputs and keep them untracked.
- The sole official recovery source is opening https://github.com/damaus001-jpg/kekouhappy and choosing Code → Download ZIP; do not offer users any other project-acquisition route.
- Do not rewrite Git history and do not force-push.

For verification only:
1. Read RECOVERY.md, NEW-SUITE-GUIDE.en.md, github.en.md, and config/prompt-sources.manifest.json.
2. After the user allows missing-system-tool installation and network dependency downloads, run tools/restore-production-environment.ps1 -InstallMissingSystemTools without -SkipUiAcceptance.
3. Require status ready, sourceMode github-download-zip, suiteIdConsumed false, and installerGenerated false in .tmp/production-environment-restore-report.json.
4. Report separately whether the pinned toolchain, Signal build and synchronization, prompt hashes, fresh test ID, all three signing identities, private-key-free client identity, maoyi identity, all four themes, and both real-window acceptance flows passed.
5. Do not run suite:create or suite:package, consume a real ID, or generate an installer.

Only if the user later explicitly authorizes formal packaging and supplies an unused three-digit delivery sequence:
1. Prepare and verify the Signal 8.18.0 runtime according to NEW-SUITE-GUIDE.en.md.
2. Do not run suite:create first.
3. Set MAOYI_SUITE_SEQUENCE and run npm.cmd run suite:package.
4. Treat that run's nine-digit suite ID as permanently consumed whether it succeeds or fails.
5. Run the required tests and perform real UI acceptance.
6. Do not commit or push .package-secrets, ledgers, private keys, installers, or taozhuang output.

Do not commit or push any change unless the user explicitly authorizes it.
```
