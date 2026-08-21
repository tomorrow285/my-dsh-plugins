# my-dsh-plugins

pnpm + TypeScript monorepo for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) plugins.

## Layout

```
.
├── pnpm-workspace.yaml     # packages/*
├── tsconfig.base.json      # shared strict TS config
├── profiles/               # archived dsh profile config (permission presets, …)
├── skills/                 # dsh development skills (create-independent-dsh-plugin, …)
└── packages/
    └── dsh-ui-toc/         # conversation TOC web client plugin
```

## Commands

```sh
pnpm install
pnpm -r typecheck   # typecheck every package
pnpm -r build       # build every package (types + bundles)
pnpm -r watch       # watch-build client bundles (client HMR source)
```

## Plugin conventions

Client plugin packages follow the DSH web plugin contract:

- `package.json` declares `dsh.client.platform: "web"` (and `dsh.bundle.patch`
  when the package ships a profile patch).
- The node half (`lib/index.js`, `main`) provides the host Loader row.
- The browser half (`lib/client.js`, `exports["./client"]`) is built as a
  closure factory for `window.__ModuleLoader__.load({ id, factory })`; externals
  resolve through the loader's module table, CSS modules are compiled by
  lightningcss and injected as tagged styles.
- UI is registered into existing additive slots (`shell.overlay`, session
  header seats, view ring, …) — never replacing shipped single seats.

See `packages/dsh-ui-toc/README.md` for the concrete example.
