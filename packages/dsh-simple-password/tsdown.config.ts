/**
 * tsdown preset for dsh-simple-password — a host-only plugin (no client
 * bundle: the browser half lives inside the injected gate script). Emits
 * `lib/index.js` (esm, node) for the host Loader.
 */
import { isBuiltin } from 'node:module'
import type { UserConfig } from 'tsdown'

const ID = 'dsh-simple-password'

/** Production dependencies stay external imports; everything else inlines. */
const isProductionDependency = (specifier: string): boolean =>
  specifier === '@deepseek-ai/dsh-home-paths' || specifier.startsWith('@deepseek-ai/dsh-home-paths/')

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
    // npm deps and node builtins stay imports; relative modules are bundled.
    neverBundle: (specifier: string) => isProductionDependency(specifier),
    alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier),
  },
}

export default [nodeConfig] satisfies UserConfig[]
