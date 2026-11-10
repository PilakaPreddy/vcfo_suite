import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests are pure TypeScript with a jsdom document; no chrome APIs and no WXT build.
// The `@` alias exists only so `src/suite/contract.test.ts` can load Suite's own request schemas
// (src/lib/assist-agents/*.ts in the repository root, which import `@/lib/...`). The extension's
// code never imports from Suite.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Engine runs drive a whole jsdom form; on a busy machine one can take longer than the 5 s default.
    testTimeout: 20_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '../../src') },
  },
});
