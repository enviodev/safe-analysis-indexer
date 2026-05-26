import { defineConfig } from "vitest/config";

// Separate config for the live-network cross-reference suite. Not run by the
// default `pnpm test` because it hits two external endpoints and would be
// flaky on PR gating.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__integration__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "build/**", "generated/**", ".envio/**"],
    globals: false,
    // Network calls + sampling can take a while; per-test 60s + suite-wide
    // beforeAll 120s in the test file itself.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // No setupFile — the unit setup pre-flags ENVIO_TEST_MODE which only
    // matters for the in-process handler harness, not this suite.
  },
});
