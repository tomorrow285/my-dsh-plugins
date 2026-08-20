/**
 * tsdown preset for dsh-ui-toc — self-contained version of the official
 * DSH clientBundle preset (packages/client/tsdown.client.ts). Emits:
 *
 *  - lib/index.js   node half (esm) — the host Loader row
 *  - lib/client.js  browser half (cjs) wrapped in
 *                   window.__ModuleLoader__.load({ id, factory })
 *
 * Externals resolve through the injected require (the loader module table),
 * CSS modules are compiled by lightningcss inside the bundle and injected as
 * a tagged style at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const ID = 'dsh-ui-toc'

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

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

/** Emit one plugin-owned style injector and the CSS Modules class map. */
function styleInjectionModule(
  id: string,
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
    `  const tag = document.createElement('style');`,
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/** Resolve a stylesheet import against the importing source file. */
function sourceAssetPath(source: string, importer: string): string {
  return resolvePath(dirname(importer), source)
}

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
      // any other @deepseek-ai value import is a build error (collaboration
      // happens through cordis services / type-only imports, which erase).
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
    {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        const exportEntries = Object.entries(cssExports ?? {})
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        for (const [local, exp] of exportEntries) classMap[local] = exp.name
        return styleInjectionModule(ID, fileId, code.toString(), classMap)
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
