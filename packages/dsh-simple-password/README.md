# dsh-simple-password

Password gate for the DeepSeek Harness (DSH) web GUI.

- **First run**: when no password exists on the server, the first page load
  asks you to choose one; it is stored as a salted scrypt hash under the DSH
  home (`$DSH_HOME/dsh-simple-password.json`) — never plaintext.
- **Locked loads**: once a password exists, every page load hides the whole
  application and shows a full-screen password wall until the password
  verifies. The gate script is injected into `<head>` and runs before any
  React bundle mounts, so `#root` is locked (`display: none !important` plus
  an opaque overlay) before content can appear — editing page CSS cannot
  reveal the application.
- **Remembered credential**: the password you enter is persisted in
  `localStorage` (`dsh-simple-password:credential`), so an already-authenticated
  browser unlocks automatically on later visits (still verified against the
  server each time). Clear that key to force the wall again.

## How it works

Host-only plugin (no client bundle). The node half:

1. persists the password record via `@deepseek-ai/dsh-home-paths` and
   `node:crypto` (scrypt, timing-safe compare);
2. registers three JSON routes on the web server:

   ```
   GET  /dsh-simple-password/status  → { configured: boolean }
   POST /dsh-simple-password/verify  → { ok: boolean }   (401 on mismatch)
   POST /dsh-simple-password/setup   → { ok: boolean }   (409 when configured)
   ```

3. taps the index renderer (`webServer.tapIndex`) to inject the gate script
   into `<head>`. That script locks the document synchronously, renders the
   password wall, verifies the saved credential asynchronously, and unlocks
   only on success — all plain DOM + `fetch` + `localStorage`, no framework.

Removing the plugin from the profile restores un-gated access (the routes and
the injected script disappear with it).

## Layout

```
packages/dsh-simple-password/
├── package.json          # manifest: dsh.bundle, peers
├── tsdown.config.ts      # host-only bundle preset
├── cordis.patch.yml      # profile patch row
└── src/
    ├── index.ts          # node half: routes + index tap
    ├── host/gate.ts      # browser gate script (injected into <head>)
    └── host/password.ts  # scrypt record persistence + verification
```

## Build

```sh
pnpm install
pnpm --filter dsh-simple-password build   # emits lib/index.js, lib/types
```

## Install into a DSH profile

```sh
dsh plugin --profile web add <path-to-this-package>
```

Restart the profile, then open the GUI: you will be asked to set a password
(first run) or to unlock (once one exists).

## Notes

- The credential is kept in the browser's `localStorage` for convenience, per
  the plugin's design — treat the browser as a trusted device.
- The wall is enforced in the browser; it gates the UI, not the underlying
  session APIs. A determined local attacker with host access is out of scope.
