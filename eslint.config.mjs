import tseslint from "typescript-eslint";

const cjsBundledFiles = ["src/cli/**/*.ts", "src/main/supervisor/**/*.ts", "src/shared/**/*.ts"];

export default tseslint.config(
  {
    ignores: ["dist-node/**", "out/**", "release/**", "playwright-report/**", "test-results/**"]
  },
  {
    files: cjsBundledFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MetaProperty[meta.name='import'][property.name='meta']",
          message: "import.meta is disallowed in sources bundled to CommonJS by tsup. Use a CJS-safe runtime check instead."
        }
      ]
    }
  }
);
