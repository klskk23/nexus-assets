import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    // The three generated trees design-sync's buildCmd writes into web/, plus
    // the declaration entry beside them. All four are gitignored, none is
    // authored, and `.ds-types` is tsc's own output -- it carries the `any`s
    // that upstream Radix and react-hook-form put in their public types, which
    // is a lint error in a file nobody can fix here. Ignoring them keeps
    // `npm run lint` honest: a clean run then means the source is clean, not
    // that someone remembered to delete a build directory first.
    ignores: [
      "dist",
      "node_modules",
      "src/components/ui/**",
      ".ds-types/**",
      ".ds-css/**",
      "ds-src/**",
      "index.d.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
)
