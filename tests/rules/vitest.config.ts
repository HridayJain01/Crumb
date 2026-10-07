import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The rules emulator compiles rules on first use; keep generous timeouts and run serially.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
