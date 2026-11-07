import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages project site: https://niphm.github.io/saltmarsh/
const base = "/saltmarsh/";

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered in src/main.ts
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        id: base,
        name: "Saltmarsh",
        short_name: "Saltmarsh",
        description: "D&D character and party tracker for the Ghosts of Saltmarsh campaign",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#0b1626",
        theme_color: "#0b1626",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        cleanupOutdatedCaches: true,
        // autoUpdate expects the new worker to take over by itself; the plugin only sets these
        // when injectRegister is "auto", so set them explicitly. Checked by scripts/check-sw.mjs.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
