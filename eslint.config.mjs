import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions are Deno (own runtime + type-checking); don't lint them
  // with the browser/Next config.
  // extensions/* are separate packages (own package.json, tsconfig and tests); don't lint them here.
  { ignores: ["dist", ".next", "supabase/functions", "extensions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // React 19 compiler rules — many valid App Router / shadcn patterns trip these
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      // Brand-new React 19 ref rule: noisy on this codebase's large components
      // (often flags refs closed over by render helpers). Kept as a warning —
      // it did surface a real render-phase ref bug — but not a blocking error,
      // consistent with the other React 19 compiler rules disabled above.
      "react-hooks/refs": "warn",
      // React Compiler diagnostic ("could not preserve memoization") — an
      // optimization note, not a bug. Warn, don't block, like the rules above.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": "warn",
      "no-useless-assignment": "warn",
    },
  },
);
