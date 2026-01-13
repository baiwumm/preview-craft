import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{js,ts,tsx,mjs}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "import/order": "off",
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^node:"], // Node 内置模块
            ["^@?\\w"], // 第三方模块
            ["^@nestjs/"], // Nest.js 模块
            ["^src/"], // 内部 alias
            ["^\\."], // 相对路径
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "no-duplicate-imports": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
]);
