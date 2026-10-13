# Pikachu Translator

A multi-platform desktop translation workspace for international one-to-one business conversations.

## Scope

- WhatsApp Web, Telegram Web A/K, and Signal Desktop multi-instance support.
- Isolated login state, session partition, and stable environment parameters for every profile.
- Chinese draft translation into natural American English and English bubble translation back into Chinese.
- Encrypted translation caches isolated by profile and conversation, with batched history rendering.
- Unread indicators and preview flows for all three platforms without triggering read receipts.
- A bundled Signal runtime, isolated instance data, and a local window-control channel.
- Offline authorization, machine binding, client locking, and sensitive-address send confirmation.
- Four persisted themes: Rose Pink, Premium Gold, Murong Purple, and Clear Water Blue.

## Run

```powershell
npm.cmd ci
npm.cmd run dev
```

There is one official recovery route on a new computer: open <https://github.com/baishihappy-ux/baishihappy-2>, choose `Code` → `Download ZIP`, extract into a new empty folder, and double-click `恢复生产环境.cmd` at its root. The flow does not create a suite or consume a formal suite ID; see `NEW-SUITE-GUIDE.en.md`.

## Build And Checks

```powershell
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:signal-render-cache
npm.cmd run test:electron-smoke
```

## Notes

WhatsApp and Telegram run in Electron WebViews. Every profile owns an isolated persistent session partition.

Signal uses the bundled and launch-guarded Signal Desktop runtime. Every instance owns a separate `user-data-dir`, while the main application uses a local control channel for show, hide, bounds synchronization, shutdown, and heartbeat.

Exact key-free translation and smart-reply prompt source is stored under `config/`; content hashes are in `config/prompt-sources.manifest.json`. See `RECOVERY.md` and `NEW-SUITE-GUIDE.en.md` for fresh-computer recovery and new-suite generation.
