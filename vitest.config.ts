import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "build/**", "generated/**", ".envio/**"],
    globals: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    setupFiles: ["src/__tests__/fixtures/setup.ts"],
  },
});
