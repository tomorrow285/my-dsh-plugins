# dsh-ui-history

Session URL sync plugin for the DeepSeek Harness (DSH) web client. Mirrors the
current session into the browser path so every session is addressable:

```
/chat/{sessionId}                  — ungrouped session
/w/{workspaceId}/chat/{sessionId}  — session accounted under a workspace
```

## Behavior

- **Session → URL**: whenever the current session changes (sidebar click,
  New Session, deep link), the path is rewritten via `history.pushState`, so
  back/forward navigation walks between sessions. The optional `/w/{workspaceId}`
  prefix is derived from the workspaces list account when the session belongs
  to one.
- **URL → Session**: on initial load and on `popstate` (back/forward or a
  manual URL edit), a `/chat/{id}` path opens that session — it becomes a
  shareable bookmark. The workspace prefix is validated but never blocks
  opening the named session; a stale `/chat/{id}` for a deleted session falls
  back to the current selection.
- **Safety**: opening waits until the session list has materialized the id
  (`open` fails loud on unknown ids); the initial-URL decision is applied
  exactly once, so later session switches only mirror the URL and never reopen
  the original deep link.

## How it works

Hybrid plugin. The **node half** (`lib/index.js`) registers two webserver
prefix routes — `/chat` and `/w` — that render the SPA index for chat deep
links. This is required because the shipped frontend-static fallback answers
unknown paths with an empty 404 (no SPA history fallback): without these
routes, refreshing a `/chat/{sessionId}` or `/w/{workspaceId}/chat/{sessionId}`
bookmark would blank the page before the client bundle could run. The routes
claim only the chat path shapes (everything else keeps the original 404
behavior) and render the same index.html as the app root — fetched from the
loopback server so every index tap (module graph, password gate, …) applies
— while preserving the URL so the browser half can open the named session.

The **browser half** (`lib/client.js`) is built for the `window.__ModuleLoader__.load`
module table and discovered through the `dsh.client` declaration in `package.json`.

The sync subscribes to the `sessions` and `workspaces` client services
(optional reads via `ctx.get`), so it degrades to a no-op if the shell lacks
them. No UI, no styles, no host RPC beyond the deep-link routes above.

## Layout

```
packages/dsh-ui-history/
├── package.json          # manifest: dsh.client, exports, peers
├── tsdown.config.ts      # self-contained client bundle preset
├── cordis.patch.yml      # profile patch row
└── src/
    ├── index.ts          # node half (deep-link SPA routes)
    └── client/
        ├── index.ts      # client entry: apply + inject
        └── history.ts    # URL ↔ session sync logic
```

## Build

```sh
pnpm install
pnpm --filter dsh-ui-history build   # emits lib/index.js, lib/client.js, lib/types
```

Artifacts:

- `lib/index.js` — node half (esm)
- `lib/client.js` — browser half (cjs) wrapped in
  `window.__ModuleLoader__.load({ id: "dsh-ui-history", factory })`
- `lib/types/**/*.d.ts` — TypeScript declarations

## Install into a DSH profile

```sh
dsh plugin --profile web add <path-to-this-package>
```

The `cordis.patch.yml` inserts the `dsh-ui-history` row; restart the profile,
then refresh the GUI. Session paths take effect from then on.
