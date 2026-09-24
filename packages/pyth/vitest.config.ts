import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@fineprint/core": fileURLToPath(new URL("../core/src/types.ts", import.meta.url)),
    },
  },
  test: {
    // Every test in this package makes real HTTP calls to Jupiter (and to Hermes when a key exists). No mocks.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    reporters: ["verbose"],
  },
});
