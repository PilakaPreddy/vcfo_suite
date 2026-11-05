import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// This config is `.mts` (ESM) on purpose: `@vitejs/plugin-react-swc` is
// ESM-only, and loading it from a `.ts` config via CommonJS `require` fails
// ("ESM file cannot be loaded by require") on newer Node. ESM loading +
// `import.meta.dirname` (Node 20.11+) avoids that entirely.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    // `npm run test:coverage` writes the summary to the terminal and the HTML report to coverage/.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      exclude: ["**/*.{test,spec}.{ts,tsx}", "src/test/**"],
      reporter: ["text-summary", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
