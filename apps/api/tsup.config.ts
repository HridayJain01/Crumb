import { defineConfig } from 'tsup';

// One ESM bundle with @crumb/core inlined; npm dependencies stay external and are
// installed in the container by `pnpm deploy`.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@crumb\//],
});
