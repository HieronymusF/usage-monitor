import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "out/**", "node_modules/**", "bundle/**", "figma-plugin/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "electron/**/*.ts",
      "renderer/src/**/*.{ts,tsx}",
      "shared/**/*.ts",
      "tests/renderer/**/*.ts",
      "tests/renderer/components/**/*.tsx",
      "electron.vite.config.ts",
    ],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
