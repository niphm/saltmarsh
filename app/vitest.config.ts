import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The Svelte plugin compiles runes in *.svelte.ts (the store); no PWA/Tailwind needed.
export default defineConfig({
  plugins: [svelte()],
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
