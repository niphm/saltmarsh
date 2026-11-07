import { defineConfig } from "vitest/config";

// Unit tests are plain TS (no Svelte/PWA plugins needed).
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
