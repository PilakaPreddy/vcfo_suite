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
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '../../src') },
  },
});
