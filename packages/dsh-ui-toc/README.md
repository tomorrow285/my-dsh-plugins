# dsh-ui-toc

Conversation TOC (table of contents) plugin for the DeepSeek Harness (DSH) web
client. Adds a floating index of the user messages on the right side of the
session area, styled after the classic `ChatTOC` rail:

- **PC / wide screens (conversation column ≥ 920px)** — a collapsed 36px rail
  pinned at 40% of the column that expands to 224px on hover, listing every
  user turn with scroll-follow active tracking; clicking an item scrolls the
  conversation to that message.
- **Mobile / narrow screens (< 920px)** — a floating toggle button above the
  composer opens a slide-in drawer with the same TOC; tapping an item scrolls
  to the message and closes the drawer.

## How it works

This is a pure-client plugin. The node half (`lib/index.js`) is an empty
`apply` so the row exists in the host Loader; the browser half
(`lib/client.js`, built for the `window.__ModuleLoader__.load` module table)
is discovered through the `dsh.client` declaration in `package.json`.

The TOC registers one additive entry into the `shell.overlay` slot (list/root)
— the frame-wide floating layer — so it never replaces shipped UI. Session
data comes from the framework standard kit: the current session id arrives via
`useSessions`, and the live conversation snapshot is read from the session
binding's observable face, mirroring what session-scoped slots get from
`useSession`. No host RPC, no private state.

## Layout

```
packages/dsh-ui-toc/
├── package.json          # manifest: dsh.client, exports, peers
├── tsdown.config.ts      # self-contained client bundle preset
├── cordis.patch.yml      # profile patch row
└── src/
    ├── index.ts          # node half (empty apply)
    └── client/
        ├── index.ts      # client entry: apply + inject, slot registration
        ├── TocOverlay.tsx# TOC component (PC rail + mobile drawer)
        ├── toc.module.css# styles (PC + mobile)
        └── locales.ts    # zh/en dictionaries
```

## Build

```sh
pnpm install
pnpm --filter dsh-ui-toc build     # emits lib/index.js, lib/client.js, lib/types
```

Artifacts:

- `lib/index.js` — node half (esm)
- `lib/client.js` — browser half (cjs) wrapped in
  `window.__ModuleLoader__.load({ id: "dsh-ui-toc", factory })`
- `lib/types/**/*.d.ts` — TypeScript declarations

## Install into a DSH profile

From the web profile directory (or with `dsh plugin`):

```sh
# inside $DSH_HOME/profiles/web, or via
dsh plugin --profile web add <path-to-this-package>
```

The `cordis.patch.yml` inserts the `dsh-ui-toc` row; the web client picks up
the browser half through the `dsh.client` metadata. Restart the profile, then
refresh the GUI page.
