/**
 * tsdown preset for dsh-ui-history — self-contained version of the official
 * DSH clientBundle preset (packages/client/tsdown.client.ts). Emits:
 *
 *  - lib/index.js   node half (esm) — the host Loader row
 *  - lib/client.js  browser half (cjs) wrapped in
 *                   window.__ModuleLoader__.load({ id, factory })
 *
 * This plugin is pure logic (no UI, no CSS), so the client half has no
 * stylesheet handling: only the module-table externals and the loader wrapper.
 */
import type { UserConfig } from 'tsdown'

const ID = 'dsh-ui-history'

/** The module specifiers the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
const PRELOADED_CLIENT_EXTERNALS = [
  '@deepseek-ai/dsh-client-runtime/client',
] as const

const REQUESTED_EXTERNALS = new Set<string>([...PLATFORM_MODULES, ...PRELOADED_CLIENT_EXTERNALS])

/** Node half: src/index.ts → lib/index.js (esm). */
const nodeConfig: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: () => true,
    alwaysBundle: () => false,
  },
}

/** Browser half: src/client/index.ts → lib/client.js wrapped for the module loader. */
const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => REQUESTED_EXTERNALS.has(specifier),
    alwaysBundle: (specifier: string) => !REQUESTED_EXTERNALS.has(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [
    {
      // Bundle purity gate: only requested module-table rows stay external;
      // any other @deepseek-ai value import is a build error.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (REQUESTED_EXTERNALS.has(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not in the client externals — `
          + 'cross-plugin value imports are forbidden; use type-only imports or cordis services',
        )
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeConfig, clientConfig] satisfies UserConfig[]
