/**
 * Workspace lint config. Besides code hygiene it enforces the hexagonal boundaries from
 * .claude/rules/salesforce-adapter.md, so a layering violation fails `npm run lint`, not review.
 */
const ADAPTER_PACKAGES = ["jsforce", "jsforce/*", "@tdm/salesforce-adapter", "@tdm/salesforce-adapter/*"];

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { es2022: true, node: true },
  ignorePatterns: ["node_modules/", "dist/", "build/", "coverage/", "*.d.ts", "integrations/salesforce/mdapi/", "**/generated/"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    "no-console": ["error", { allow: ["warn", "error"] }],
    eqeqeq: ["error", "always", { null: "ignore" }],
  },
  overrides: [
    {
      // Platform entries (CommonJS, loaded by the host's Node runtime).
      files: ["api/**/*.js"],
      env: { node: true },
      rules: { "@typescript-eslint/no-var-requires": "off" },
    },
    {
      // Business logic talks to repository interfaces only.
      files: ["packages/domain/**/*.ts", "packages/types/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [{ group: [...ADAPTER_PACKAGES, "@tdm/postgres-adapter", "@nestjs/*"], message: "Domain code must stay provider- and framework-free." }] },
        ],
      },
    },
    {
      // Only the infrastructure module constructs Salesforce adapters; everything else injects a token.
      files: ["apps/api/src/**/*.ts"],
      excludedFiles: ["apps/api/src/infrastructure/infrastructure.module.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [{ group: ADAPTER_PACKAGES, message: "Inject a repository token from infrastructure/tokens.ts instead." }] },
        ],
      },
    },
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      env: { browser: true, node: false },
      plugins: ["react-hooks"],
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [{ group: [...ADAPTER_PACKAGES, "@tdm/postgres-adapter", "@tdm/domain"], message: "The web app talks to the API only; share types via @tdm/types." }] },
        ],
      },
    },
    {
      // jsforce returns schemaless SObject records; the mappers in this package are the typed boundary,
      // and nothing untyped crosses into @tdm/domain.
      files: ["integrations/salesforce/**/*.ts"],
      rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
    {
      // Standalone dev seed / ops scripts print to the terminal by design.
      files: ["**/scripts/**/*.ts", "**/prisma/seed*.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
