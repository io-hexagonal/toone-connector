import { defineConfig } from 'tsup';

// The plugin ships one self-contained file, so installing it needs no `npm install`.
export default defineConfig({
  entry: { 'toone-connector': 'src/main.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'plugin/server',
  outExtension: () => ({ js: '.mjs' }),
  noExternal: [/.*/],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  clean: true,
});
