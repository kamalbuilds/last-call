import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@fineprint/core": fileURLToPath(new URL("../core/src/types.ts", import.meta.url)),
    },
  },
  test: {
    // Every test in this package makes real HTTP calls to Jupiter. No mocks.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ["verbose"],
  },
});
